import os
import re
from flask import Flask, render_template, request, redirect, url_for, session, jsonify, Response
from werkzeug.security import generate_password_hash, check_password_hash, gen_salt
import json
from flask_mail import Mail, Message
from datetime import datetime, timedelta
from bson import ObjectId
import threading
import warnings
import redis
from common import NZ_TZ, ZoneInfo, users_collection, schedules_collection, tasks_collection, exams_collection, classes_collection, vacations_collection, chain, llm
from task import get_ai_suggestions_task, get_ai_study_plan_task
from celery import Celery
from celery_app import celery_app
import bcrypt

# Initialize Celery app (must be done in application.py as well for Flask context)
celery_app = Celery(
    'study_planner',
    broker=os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0'),
    backend=os.environ.get('CELERY_RESULT_BACKEND', 'redis://localhost:6379/0')
)

redis_client = redis.Redis(host='localhost', port=6379, db=0)

app = Flask(__name__)
application = app

app.secret_key = os.environ.get('SECRET_KEY', 'supersecretkey123-dev-only')

# Email configuration
app.config['MAIL_SERVER']   = 'smtp.gmail.com'
app.config['MAIL_PORT']     = 587
app.config['MAIL_USE_TLS']  = True
app.config['MAIL_USERNAME'] = os.environ.get('MAIL_USERNAME')
app.config['MAIL_PASSWORD'] = os.environ.get('MAIL_PASSWORD')
mail = Mail(app)


# HELPER FUNCTIONS

def sanitize(value):
    """Strip HTML tags and dangerous characters to prevent XSS."""
    if not value or not isinstance(value, str):
        return value
    value = re.sub(r'<[^>]+>', '', value)
    return value.strip()

def validate_email(email):
    """Return True if email format is valid."""
    pattern = r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))

def validate_date(date_str):
    """Return True if date is in YYYY-MM-DD format."""
    if not date_str:
        return True  # Date is optional on most forms
    try:
        datetime.strptime(date_str, '%Y-%m-%d')
        return True
    except ValueError:
        return False


def send_deadline_email(user_email, user_name, deadline_date, items):
    """Send email notification for upcoming deadlines."""
    try:
        template_path = os.path.join(os.path.dirname(__file__), 'templates', 'email_template.html')
        with open(template_path, 'r', encoding='utf-8') as f:
            html_template = f.read()

        items_html = ''.join([f'<li style="margin: 8px 0; color: #333;">{item}</li>' for item in items])

        html_content = html_template.replace('{{USER_NAME}}', user_name)
        html_content = html_content.replace('{{DATE}}', deadline_date)
        html_content = html_content.replace('{{ITEMS}}', items_html)

        msg = Message(
            subject='Study Planner - Upcoming Deadlines Reminder',
            recipients=[user_email]
        )
        msg.body = f"""
Hello {user_name},

This is a friendly reminder about your upcoming deadlines tomorrow ({deadline_date}):

{chr(10).join(['- ' + item for item in items])}

Don't forget to prepare! Good luck!

Best regards,
Study Planner Team
        """
        msg.html = html_content
        mail.send(msg)
        print(f" Email sent to {user_email} ({len(items)} items)")
        return True
    except Exception as e:
        print(f" Failed to send email to {user_email}: {e}")
        return False

def check_upcoming_deadlines():
    if users_collection is None:
        print("Skipping deadline check - no database connection")
        return

    now_nz     = datetime.now(NZ_TZ)
    tomorrow   = now_nz + timedelta(days=1)
    tomorrow_str = tomorrow.strftime('%Y-%m-%d')

    print(f"Checking deadlines for {tomorrow_str}...")

    users = users_collection.find()

    for user in users:
        email     = user.get("email")
        phone     = user.get("phone")
        user_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or email

        upcoming_items = []

        if tasks_collection is not None:
            tasks = tasks_collection.find({
                'user': email,
                'completed': {'$ne': True},
                'date': tomorrow_str
            })
            for task in tasks:
                upcoming_items.append(f"Task: {task.get('name')}")

        if exams_collection is not None:
            exams = exams_collection.find({
                'user': email,
                'completed': {'$ne': True},
                'date': tomorrow_str
            })
            for exam in exams:
                upcoming_items.append(f"Exam: {exam.get('subject')} at {exam.get('time')}")

        if schedules_collection is not None:
            schedules = schedules_collection.find({
                'user': email,
                'completed': {'$ne': True},
                'date': tomorrow_str
            })
            for sched in schedules:
                upcoming_items.append(f"Schedule: {sched.get('title')} at {sched.get('time')}")

        if upcoming_items:
            if app.config['MAIL_USERNAME']:
                send_deadline_email(email, user_name, tomorrow_str, upcoming_items)

            try:
                if phone:
                    from notification import send_sms
                    sms_message = f"""
Reminder

Hello {user_name},

You have {len(upcoming_items)} deadline(s) tomorrow ({tomorrow_str}).

Check your Study Planner.
"""
                    # send_sms(phone, sms_message)
                    print(f"SMS sent to {phone}")
            except Exception as e:
                print(f"SMS failed for {email}: {e}")

def start_deadline_checker():
    """Run deadline checker every 24 hours."""
    check_upcoming_deadlines()
    threading.Timer(86400, start_deadline_checker).start()


def get_task_status(date_str):
    """
    Determine the status of a task/exam/schedule based on its date.
    Returns 'outdated', 'current', or 'invalid_date'.
    """
    if not date_str:
        return 'current'
    try:
        task_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        today     = datetime.utcnow().date()
        if task_date < today:
            return 'outdated'
        else:
            return 'current'
    except (ValueError, TypeError):
        print(f"Warning: Invalid date format encountered: {date_str}")
        return 'invalid_date'


# TEST / UTILITY ROUTES

@app.route('/test_email')
def test_email():
    try:
        msg = Message(subject="Test Email", recipients=["1bikramp@gmail.com"], body="This is a test.")
        mail.send(msg)
        return "Email sent!"
    except Exception as e:
        return f"Failed: {str(e)}"


# AUTH ROUTES

@app.route('/', methods=['GET', 'POST'])
def login():
    
    if request.method == 'POST':
        email    = sanitize(request.form.get('email', '')).lower()
        password = request.form.get('password', '')

        if not email or not validate_email(email):
            return render_template('login.html', error='Please enter a valid email address.')
        if not password:
            return render_template('login.html', error='Password is required.')

        if users_collection is not None:
            user = users_collection.find_one({'email': email})
            if not user or not check_password_hash(user.get('password', ''), password):
                return render_template('login.html', error='Invalid email or password.')
        else:
            # Dev fallback — no database
            user = {'email': email} if email == 'test@example.com' and password == 'password' else None

        if user:
            session['user']      = email
            session['user_name'] = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()
            return redirect(url_for('dashboard'))
        else:
            return render_template('login.html', error='Invalid email or password.')
    return render_template('login.html')

def hash_password(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password, hashed):
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    
@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        first_name       = sanitize(request.form.get('first_name', ''))
        last_name        = sanitize(request.form.get('last_name', ''))
        email            = sanitize(request.form.get('email', '')).lower()
        password         = request.form.get('password', '')
        confirm_password = request.form.get('confirm_password', '')
        phone            = sanitize(request.form.get('phone', ''))
        institution      = sanitize(request.form.get('institution', ''))
        major            = sanitize(request.form.get('major', ''))

        if not first_name or not last_name:
            return render_template('signup.html', error='First and last name are required.')
        if not email or not validate_email(email):
            return render_template('signup.html', error='Please enter a valid email address.')
        if len(password) < 8:
            return render_template('signup.html', error='Password must be at least 8 characters long.')
        if not re.search(r'[A-Z]', password):
            return render_template('signup.html', error='Password must contain at least one uppercase letter.')
        if not re.search(r'[0-9]', password):
            return render_template('signup.html', error='Password must contain at least one number.')
        if password != confirm_password:
            return render_template('signup.html', error='Passwords do not match.')

        if users_collection is not None:
            if users_collection.find_one({'email': email}):
                return render_template('signup.html', error='This email is already registered.')
            
            password = request.form.get("password")
            hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            users_collection.insert_one({
                "email": email,
                "password": hashed_password
                })

            user_data = {
                'first_name':  first_name,
                'last_name':   last_name,
                'email':       email,
                'password':    generate_password_hash(password),
                'phone':       phone,
                'institution': institution,
                'major':       major,
                'created_at':  datetime.now()
            }
            users_collection.insert_one(user_data)

        return redirect(url_for('login'))
    return render_template('signup.html')



def hash_password(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password, hashed):
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

# PAGE ROUTES

@app.route('/dashboard')
def dashboard():
    if 'user' not in session:
        return redirect(url_for('login'))

    if tasks_collection is not None and exams_collection is not None:

        outdated_tasks     = []
        outdated_exams     = []
        outdated_schedules = []
        outdated_classes   = []
        outdated_vacations = []

        all_tasks = list(tasks_collection.find({'user': session['user']}))
        tasks_for_display = []
        for task in all_tasks:
            task['_id'] = str(task['_id'])
            status = get_task_status(task.get('date'))
            if status == 'outdated':
                outdated_tasks.append(task)
            else:
                tasks_for_display.append(task)
        tasks_for_display = tasks_for_display[:5]

        all_exams = list(exams_collection.find({'user': session['user']}))
        exams_for_display = []
        for exam in all_exams:
            exam['_id'] = str(exam['_id'])
            status = get_task_status(exam.get('date'))
            if status == 'outdated':
                outdated_exams.append(exam)
            else:
                exams_for_display.append(exam)
        exams_for_display = exams_for_display[:3]

        all_schedules = list(schedules_collection.find({'user': session['user']}))
        for schedule in all_schedules:
            schedule['_id'] = str(schedule['_id'])
            status = get_task_status(schedule.get('date'))
            if status == 'outdated':
                outdated_schedules.append(schedule)

        all_classes = list(classes_collection.find({'user': session['user']}))
        for class_item in all_classes:
            if class_item.get('date') and get_task_status(class_item.get('date')) == 'outdated':
                outdated_classes.append(class_item)

        all_vacations = list(vacations_collection.find({'user': session['user']}))
        for vacation in all_vacations:
            if vacation.get('start_date') and get_task_status(vacation.get('start_date')) == 'outdated':
                outdated_vacations.append(vacation)

        outdated_items = outdated_tasks + outdated_exams + outdated_schedules + outdated_classes + outdated_vacations

        total_items     = 0
        completed_items = 0

        total_items     += len(all_tasks)
        completed_items += len([t for t in all_tasks if t.get('completed', False)])

        total_items     += len(all_exams)
        completed_items += len([e for e in all_exams if e.get('completed', False)])

        total_items     += len(all_classes)
        completed_items += len([c for c in all_classes if c.get('completed', False)])

        total_items     += len(all_schedules)
        completed_items += len([s for s in all_schedules if s.get('completed', False)])

        progress = int((completed_items / total_items) * 100) if total_items > 0 else 0

    else:
        tasks_for_display = []
        exams_for_display = []
        outdated_items    = []
        progress          = 0

    return render_template('V2dashboard.html', progress=progress, tasks=tasks_for_display,
                           exams=exams_for_display, outdated_items=outdated_items)


@app.route('/api/clear-outdated', methods=['POST'])
def clear_outdated():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    today         = datetime.utcnow().date()
    deleted_count = 0

    if tasks_collection is not None:
        result = tasks_collection.delete_many({'user': session['user'], 'date': {'$lt': today.strftime('%Y-%m-%d')}})
        deleted_count += result.deleted_count

    if exams_collection is not None:
        result = exams_collection.delete_many({'user': session['user'], 'date': {'$lt': today.strftime('%Y-%m-%d')}})
        deleted_count += result.deleted_count

    if schedules_collection is not None:
        result = schedules_collection.delete_many({'user': session['user'], 'date': {'$lt': today.strftime('%Y-%m-%d')}})
        deleted_count += result.deleted_count

    if classes_collection is not None:
        result = classes_collection.delete_many({'user': session['user'], 'date': {'$exists': True, '$lt': today.strftime('%Y-%m-%d')}})
        deleted_count += result.deleted_count

    if vacations_collection is not None:
        result = vacations_collection.delete_many({'user': session['user'], 'start_date': {'$lt': today.strftime('%Y-%m-%d')}})
        deleted_count += result.deleted_count

    return jsonify({'success': True, 'deleted_count': deleted_count})


@app.route('/schedule')
def schedule():
    if 'user' not in session:
        return redirect(url_for('login'))
    if schedules_collection is not None:
        all_schedules = list(schedules_collection.find({'user': session['user']}).sort('date', 1))
        schedules = []
        for sched in all_schedules:
            if get_task_status(sched.get('date')) != 'outdated':
                sched['_id'] = str(sched['_id'])
                schedules.append(sched)
    else:
        schedules = []
    return render_template('schedule.html', schedules=schedules)


@app.route('/chatbot')
def chatbot():
    if 'user' not in session:
        return redirect(url_for('login'))
    return render_template('chatbot.html')


@app.route('/get_ai_suggestions')
def get_ai_suggestions():
    if 'user' not in session:
        return jsonify({"error": "User not logged in"}), 401
    try:
        user_email    = session['user']
        today         = datetime.now(NZ_TZ)
        today_str     = today.strftime('%d/%m/%Y')
        priority_order = {'high': 0, 'medium': 1, 'low': 2}

        today_tasks = list(tasks_collection.find({
            "user": user_email,
            "date": today_str,
            "completed": {"$ne": True}
        }))
        today_tasks.sort(key=lambda x: priority_order.get(x.get('priority', 'medium').lower(), 1))

        today_exams = list(exams_collection.find({
            "user": user_email,
            "completed": {"$ne": True}
        }).limit(3))

        filtered_exams = []
        for exam in today_exams:
            exam_date_str = exam.get('date', '')
            try:
                exam_date = datetime.strptime(exam_date_str, '%d/%m/%Y')
                if exam_date.date() >= today.date():
                    filtered_exams.append(exam)
            except:
                pass

        context = {
            "exams": [{"name": e.get("subject"), "date": e.get("date")} for e in filtered_exams],
            "tasks": [{"name": t.get("name"), "priority": t.get("priority", "medium")} for t in today_tasks]
        }

        from common import get_ai_suggestion_sync
        ai_response = get_ai_suggestion_sync(context)
        return jsonify({"suggestions": ai_response})

    except Exception as e:
        print(f"Error in get_ai_suggestions: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)})


@app.route('/api/ai-task-status/<task_id>')
def ai_task_status(task_id):
    task = celery_app.AsyncResult(task_id)
    if task.state == 'PENDING':
        response = {'state': task.state, 'status': 'Pending...'}
    elif task.state != 'FAILURE':
        response = {'state': task.state, 'result': task.result}
    else:
        response = {'state': task.state, 'status': str(task.info), 'result': None}
    return jsonify(response)


@app.route('/tasks')
def tasks():
    if 'user' not in session:
        return redirect(url_for('login'))
    if tasks_collection is not None:
        all_tasks  = list(tasks_collection.find({'user': session['user']}).sort('date', 1))
        tasks_list = []
        for task in all_tasks:
            if get_task_status(task.get('date')) != 'outdated':
                task['_id'] = str(task['_id'])
                tasks_list.append(task)
    else:
        tasks_list = []
    return render_template('tasks.html', tasks=tasks_list)

@app.route('/exams')
def exams():
    if 'user' not in session:
        return redirect(url_for('login'))
    if exams_collection is not None:
        all_exams  = list(exams_collection.find({'user': session['user']}).sort('date', 1))
        exams_list = []
        for exam in all_exams:
            if get_task_status(exam.get('date')) != 'outdated':
                exam['_id'] = str(exam['_id'])
                exams_list.append(exam)
    else:
        exams_list = []
    return render_template('exams.html', exams=exams_list)


@app.route('/classes')
def classes():
    if 'user' not in session:
        return redirect(url_for('login'))
    if classes_collection is not None:
        all_classes  = list(classes_collection.find({'user': session['user']}).sort('date', 1))
        classes_list = []
        for class_item in all_classes:
            if class_item.get('date') and get_task_status(class_item.get('date')) == 'outdated':
                continue
            class_item['_id'] = str(class_item['_id'])
            classes_list.append(class_item)
    else:
        classes_list = []
    return render_template('classes.html', classes=classes_list)


@app.route('/vacations')
def vacations():
    if 'user' not in session:
        return redirect(url_for('login'))
    if vacations_collection is not None:
        all_vacations  = list(vacations_collection.find({'user': session['user']}).sort('start_date', 1))
        vacations_list = []
        for vacation in all_vacations:
            if vacation.get('start_date') and get_task_status(vacation.get('start_date')) == 'outdated':
                continue
            vacation['_id'] = str(vacation['_id'])
            vacations_list.append(vacation)
    else:
        vacations_list = []
    return render_template('vacations.html', vacations=vacations_list)


@app.route('/api/daily-advice')
def daily_advice():
    if 'user' not in session:
        return jsonify({'error': 'Not logged in'})
    tasks_data = list(tasks_collection.find({'user': session['user']}))
    exams_data = list(exams_collection.find({'user': session['user']}))
    context    = f"Tasks: {tasks_data}\nExams: {exams_data}"
    advice     = chain.invoke({"question": "Give the student helpful study advice for today", "user_context": context})
    return jsonify({"advice": advice})


@app.route('/settings')
def settings():
    if 'user' not in session:
        return redirect(url_for('login'))
    return render_template('settings.html')


# API ROUTES

@app.route('/api/study_plan', methods=['POST'])
def api_study_plan():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    try:
        user_email = session['user']
        today      = datetime.utcnow().strftime('%Y-%m-%d')

        upcoming_tasks = []
        if tasks_collection is not None:
            raw_tasks = list(tasks_collection.find({'user': user_email, 'completed': {'$ne': True}}))
            upcoming_tasks = [
                {'name': t.get('name'), 'priority': t.get('priority', 'medium'), 'date': t.get('date')}
                for t in raw_tasks
                if get_task_status(t.get('date')) != 'outdated'
            ]

        upcoming_exams = []
        if exams_collection is not None:
            raw_exams = list(exams_collection.find({'user': user_email, 'completed': {'$ne': True}}))
            upcoming_exams = [
                {'name': e.get('subject'), 'date': e.get('date')}
                for e in raw_exams
                if get_task_status(e.get('date')) != 'outdated'
            ]

        upcoming_classes = []
        if classes_collection is not None:
            raw_classes = list(classes_collection.find({'user': user_email}))
            upcoming_classes = [
                {'name': c.get('name', c.get('subject', 'Class')), 'date': c.get('date')}
                for c in raw_classes
                if get_task_status(c.get('date')) != 'outdated'
            ]

        all_due_dates = []
        for item in upcoming_tasks + upcoming_exams + upcoming_classes:
            if item.get('date'):
                all_due_dates.append(item['date'])

        nearest_date = min(all_due_dates) if all_due_dates else None

        if nearest_date:
            question = (
                f"Today is {today}. "
                f"The student's nearest upcoming deadline is on {nearest_date}. "
                f"Create a focused, day-by-day study plan ONLY from today ({today}) up to and including {nearest_date}. "
                f"Do NOT plan any days beyond {nearest_date}. "
                f"After the plan section, add a separate section titled 'Coming Up Next' "
                f"that briefly lists all remaining tasks, exams, and classes due AFTER {nearest_date}, "
                f"sorted by their due date. "
                f"Keep the tone clear, practical, and motivating."
            )
        else:
            question = (
                f"Today is {today}. The student has no immediate deadlines. "
                f"Create a general 7-day study plan to help them stay productive. "
                f"Keep it clear and motivating."
            )

        user_context = (
            f"Today's date: {today}\n"
            f"Nearest deadline: {nearest_date if nearest_date else 'None'}\n"
            f"Upcoming tasks: {upcoming_tasks}\n"
            f"Upcoming exams: {upcoming_exams}\n"
            f"Upcoming classes: {upcoming_classes}"
        )

        plan = chain.invoke({"question": question, "user_context": user_context})

        if users_collection is not None:
            users_collection.update_one(
                {'email': user_email},
                {'$set': {'last_study_plan': plan, 'last_study_plan_date': today}},
                upsert=False
            )

        return jsonify({'plan': plan, 'generated_at': today, 'cached': False})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/settings', methods=['GET', 'POST'])
def api_settings():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    if users_collection is None:
        if request.method == 'GET':
            return jsonify({'dark_mode': False, 'task_reminders': True, 'exam_alerts': True,
                            'study_duration': '60', 'break_duration': '10', 'default_view': 'week'})
        return jsonify({'success': True})

    if request.method == 'GET':
        user = users_collection.find_one({'email': session['user']}, {'settings': 1})
        s    = user.get('settings', {}) if user else {}
        return jsonify({
            'dark_mode':      s.get('dark_mode',      False),
            'task_reminders': s.get('task_reminders',  True),
            'exam_alerts':    s.get('exam_alerts',     True),
            'study_duration': s.get('study_duration', '60'),
            'break_duration': s.get('break_duration', '10'),
            'default_view':   s.get('default_view',  'week')
        })

    data = request.json or {}
    users_collection.update_one(
        {'email': session['user']},
        {'$set': {
            'settings.dark_mode':      bool(data.get('dark_mode',      False)),
            'settings.task_reminders': bool(data.get('task_reminders',  True)),
            'settings.exam_alerts':    bool(data.get('exam_alerts',     True)),
            'settings.study_duration': str(data.get('study_duration',  '60')),
            'settings.break_duration': str(data.get('break_duration',  '10')),
            'settings.default_view':   str(data.get('default_view',   'week'))
        }}
    )
    return jsonify({'success': True})


@app.route('/api/export', methods=['GET'])
def api_export_data():
    if 'user' not in session:
        return redirect(url_for('login'))

    user_email  = session['user']
    export_data = {'user': user_email}

    if tasks_collection is not None:
        export_data['tasks']     = list(tasks_collection.find({'user': user_email},     {'_id': 0}))
        export_data['exams']     = list(exams_collection.find({'user': user_email},     {'_id': 0}))
        export_data['classes']   = list(classes_collection.find({'user': user_email},   {'_id': 0}))
        export_data['schedules'] = list(schedules_collection.find({'user': user_email}, {'_id': 0}))

    response = Response(
        json.dumps(export_data, indent=4, default=str),
        mimetype='application/json',
        headers={'Content-Disposition': 'attachment;filename=study_planner_export.json'}
    )
    return response


@app.route('/api/clear-all', methods=['POST'])
def api_clear_all_data():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    user_email = session['user']

    if tasks_collection is not None:
        tasks_collection.delete_many({'user': user_email})
        exams_collection.delete_many({'user': user_email})
        classes_collection.delete_many({'user': user_email})
        schedules_collection.delete_many({'user': user_email})
        vacations_collection.delete_many({'user': user_email})

    return jsonify({'success': True, 'message': 'All user data cleared'})


# PROFILE ROUTES


@app.route('/profile')
def profile():
    if 'user' not in session:
        return redirect(url_for('login'))

    user_data = None
    stats = {
        'total_study_time': 0,
        'completed_tasks':  0,
        'total_tasks':      0,
        'upcoming_exams':   0,
        'current_streak':   0
    }

    if users_collection is not None:
        user_data = users_collection.find_one({'email': session['user']})
        if user_data:
            user_data['_id'] = str(user_data['_id'])

        if tasks_collection is not None:
            stats['total_tasks']     = tasks_collection.count_documents({'user': session['user']})
            stats['completed_tasks'] = tasks_collection.count_documents({'user': session['user'], 'completed': True})

            completed_with_duration = tasks_collection.find({
                'user': session['user'], 'completed': True, 'duration': {'$exists': True}
            })
            for task in completed_with_duration:
                stats['total_study_time'] += task.get('duration', 0)

            all_completed = list(tasks_collection.find({
                'user': session['user'], 'completed': True, 'completed_at': {'$exists': True}
            }).sort('completed_at', -1))

            streak = 0
            if all_completed:
                check_date = datetime.now(NZ_TZ).date()
                dates_with_completion = set()
                for t in all_completed:
                    completed_at = t.get('completed_at')
                    if completed_at:
                        if hasattr(completed_at, 'date'):
                            dates_with_completion.add(completed_at.date())
                        else:
                            try:
                                dates_with_completion.add(datetime.strptime(str(completed_at)[:10], '%Y-%m-%d').date())
                            except Exception:
                                pass
                while check_date in dates_with_completion:
                    streak     += 1
                    check_date -= timedelta(days=1)
            stats['current_streak'] = streak

        if exams_collection is not None:
            today = datetime.now(NZ_TZ).strftime('%Y-%m-%d')
            stats['upcoming_exams'] = exams_collection.count_documents({
                'user': session['user'], 'date': {'$gte': today}, 'completed': {'$ne': True}
            })

    return render_template('profile.html', user=user_data, stats=stats)


@app.route('/api/profile', methods=['PUT'])
def api_profile():
    """
    Update the current user's profile fields.
    Accepts both personal info (first_name, last_name, phone, date_of_birth, gender, address)
    and study info (institution, student_id, major, year_level, daily_study_goal, preferred_study_time).
    Both forms on the profile page POST to this single endpoint.
    """
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    data = request.json or {}

    # Whitelist of fields that are allowed to be updated — prevents mass-assignment attacks
    allowed_fields = [
        'first_name', 'last_name', 'phone', 'date_of_birth',
        'gender', 'address', 'institution', 'student_id',
        'major', 'year_level', 'daily_study_goal', 'preferred_study_time'
    ]

    update_data = {}
    for k, v in data.items():
        if k in allowed_fields:
            # Sanitize strings; leave numbers/booleans as-is
            update_data[k] = sanitize(str(v)) if isinstance(v, str) else v

    if not update_data:
        return jsonify({'error': 'No valid fields to update'})

    if users_collection is not None:
        users_collection.update_one({'email': session['user']}, {'$set': update_data})

    return jsonify({'success': True})


# SCHEDULE API

@app.route('/api/schedules', methods=['GET', 'POST'])
def api_schedules():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    if request.method == 'POST':
        data  = request.json or {}
        title = sanitize(data.get('title', ''))
        date  = sanitize(data.get('date', ''))

        if not title:
            return jsonify({'error': 'Schedule title is required.'}), 400
        if len(title) > 200:
            return jsonify({'error': 'Title must be under 200 characters.'}), 400
        if date and not validate_date(date):
            return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD.'}), 400

        schedule_item = {
            'user':        session['user'],
            'title':       title,
            'date':        date or None,
            'time':        sanitize(data.get('time', '')),
            'duration':    data.get('duration'),
            'description': sanitize(data.get('description', '')),
            'completed':   False,
            'created_at':  datetime.now()
        }
        if schedules_collection is not None:
            result = schedules_collection.insert_one(schedule_item)
            schedule_item['_id'] = str(result.inserted_id)
        else:
            schedule_item['_id'] = 'temp_id'
        return jsonify(schedule_item), 201

    else:
        if schedules_collection is not None:
            schedules = list(schedules_collection.find({'user': session['user']}))
            for schedule in schedules:
                schedule['_id'] = str(schedule['_id'])
        else:
            schedules = []
        return jsonify(schedules)


@app.route('/api/schedules/<schedule_id>', methods=['PUT', 'DELETE'])
def api_single_schedule(schedule_id):
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    if request.method == 'PUT':
        data = request.json or {}
        update_data = {
            'title':       sanitize(data.get('title', '')),
            'date':        sanitize(data.get('date', '')),
            'time':        sanitize(data.get('time', '')),
            'duration':    data.get('duration'),
            'description': sanitize(data.get('description', '')),
            'updated_at':  datetime.now()
        }
        if schedules_collection is not None:
            result = schedules_collection.update_one(
                {'_id': ObjectId(schedule_id), 'user': session['user']},
                {'$set': update_data}
            )
            if result.matched_count > 0:
                return jsonify({'success': True, 'message': 'Schedule updated successfully'})
            else:
                return jsonify({'error': 'Schedule not found'})
        else:
            return jsonify({'success': True, 'message': 'Schedule updated (dev mode)'})

    elif request.method == 'DELETE':
        if schedules_collection is not None:
            result = schedules_collection.delete_one({'_id': ObjectId(schedule_id), 'user': session['user']})
            if result.deleted_count > 0:
                return jsonify({'success': True, 'message': 'Schedule deleted successfully'})
            else:
                return jsonify({'error': 'Schedule not found'})
        else:
            return jsonify({'success': True, 'message': 'Schedule deleted (dev mode)'})


# CHAT API

@app.route('/api/chat', methods=['POST'])
def chat():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    data         = request.json or {}
    user_message = sanitize(data.get('message', ''))

    if not user_message:
        return jsonify({'error': 'No message provided'}), 400

    today = datetime.now(NZ_TZ).strftime('%Y-%m-%d')

    user_tasks     = list(tasks_collection.find({'user': session['user'], 'date': {'$gte': today}, 'completed': {'$ne': True}}))
    user_exams     = list(exams_collection.find({'user': session['user'], 'date': {'$gte': today}, 'completed': {'$ne': True}}))
    user_classes   = list(classes_collection.find({'user': session['user']}))
    user_schedules = list(schedules_collection.find({'user': session['user'], 'date': {'$gte': today}}))

    for col in [user_tasks, user_exams, user_classes, user_schedules]:
        for item in col:
            if '_id' in item:
                item['_id'] = str(item['_id'])

    context = f"""
    Today's date: {today}
    Tasks: {user_tasks}
    Exams: {user_exams}
    Classes: {user_classes}
    Schedules: {user_schedules}
""".strip()

    try:
        cache_key = f"chat:{user_message}"
        cached    = redis_client.get(cache_key)
        if cached:
            return jsonify({'response': cached.decode('utf-8')})
        ai_response = chain.invoke({"question": user_message, "user_context": context})
        redis_client.set(cache_key, ai_response, ex=3600)
        return jsonify({'response': ai_response})
    except Exception as e:
        print("Ollama / LangChain error:", str(e))
        return jsonify({'error': f'Local AI failed: {str(e)}'}), 500


# TASKS API

@app.route('/api/tasks', methods=['GET', 'POST'])
def api_tasks():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    if request.method == 'POST':
        data     = request.json or {}
        name     = sanitize(data.get('name', ''))
        priority = sanitize(data.get('priority', 'medium'))
        date     = sanitize(data.get('date', ''))

        if not name:
            return jsonify({'error': 'Task name is required.'}), 400
        if len(name) > 200:
            return jsonify({'error': 'Task name must be under 200 characters.'}), 400
        if priority not in ('high', 'medium', 'low'):
            return jsonify({'error': 'Invalid priority value.'}), 400
        if date and not validate_date(date):
            return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD.'}), 400

        task_item = {
            'user':        session['user'],
            'name':        name,
            'priority':    priority,
            'date':        date or None,
            'description': sanitize(data.get('description', '')),
            'completed':   False,
            'created_at':  datetime.now()
        }
        if tasks_collection is not None:
            result = tasks_collection.insert_one(task_item)
            task_item['_id'] = str(result.inserted_id)
        else:
            task_item['_id'] = 'temp_id'
        return jsonify(task_item), 201

    else:
        if tasks_collection is not None:
            tasks = list(tasks_collection.find({'user': session['user']}))
            for task in tasks:
                task['_id'] = str(task['_id'])
        else:
            tasks = []
        return jsonify(tasks)


@app.route('/api/tasks/<task_id>', methods=['PUT', 'PATCH', 'DELETE'])
def api_single_task(task_id):
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    if request.method == 'PUT':
        data = request.json or {}
        update_data = {
            'name':        sanitize(data.get('name', '')),
            'priority':    sanitize(data.get('priority', 'medium')),
            'date':        sanitize(data.get('date', '')),
            'description': sanitize(data.get('description', '')),
            'completed':   data.get('completed'),
            'updated_at':  datetime.now()
        }
        if tasks_collection is not None:
            result = tasks_collection.update_one(
                {'_id': ObjectId(task_id), 'user': session['user']},
                {'$set': update_data}
            )
            if result.matched_count > 0:
                return jsonify({'success': True, 'message': 'Task updated successfully'})
            else:
                return jsonify({'error': 'Task not found'})
        else:
            return jsonify({'success': True, 'message': 'Task updated (dev mode)'})

    elif request.method == 'PATCH':
        data       = request.json or {}
        patch_data = {'updated_at': datetime.now()}
        if 'completed' in data:
            patch_data['completed'] = data['completed']
            if data['completed']:
                patch_data['completed_at'] = datetime.now()
        if tasks_collection is not None:
            result = tasks_collection.update_one(
                {'_id': ObjectId(task_id), 'user': session['user']},
                {'$set': patch_data}
            )
            if result.matched_count > 0:
                return jsonify({'success': True, 'message': 'Task updated'})
            else:
                return jsonify({'error': 'Task not found'}), 404
        else:
            return jsonify({'success': True, 'message': 'Task updated (dev mode)'})

    elif request.method == 'DELETE':
        if tasks_collection is not None:
            result = tasks_collection.delete_one({'_id': ObjectId(task_id), 'user': session['user']})
            if result.deleted_count > 0:
                return jsonify({'success': True, 'message': 'Task deleted successfully'})
            else:
                return jsonify({'error': 'Task not found'})
        else:
            return jsonify({'success': True, 'message': 'Task deleted (dev mode)'})


# EXAMS API

@app.route('/api/exams', methods=['GET', 'POST'])
def api_exams():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    if request.method == 'POST':
        data    = request.json or {}
        subject = sanitize(data.get('subject', ''))
        date    = sanitize(data.get('date', ''))

        if not subject:
            return jsonify({'error': 'Subject name is required.'}), 400
        if len(subject) > 200:
            return jsonify({'error': 'Subject name must be under 200 characters.'}), 400
        if date and not validate_date(date):
            return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD.'}), 400

        exam_item = {
            'user':       session['user'],
            'subject':    subject,
            'date':       date or None,
            'time':       sanitize(data.get('time', '')),
            'duration':   data.get('duration'),
            'notes':      sanitize(data.get('notes', '')),
            'completed':  False,
            'created_at': datetime.now()
        }
        if exams_collection is not None:
            result = exams_collection.insert_one(exam_item)
            exam_item['_id'] = str(result.inserted_id)
        else:
            exam_item['_id'] = 'temp_id'
        return jsonify(exam_item), 201

    else:
        if exams_collection is not None:
            exams = list(exams_collection.find({'user': session['user']}))
            for exam in exams:
                exam['_id'] = str(exam['_id'])
        else:
            exams = []
        return jsonify(exams)


@app.route('/api/exams/<exam_id>', methods=['PUT', 'PATCH', 'DELETE'])
def api_single_exam(exam_id):
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    if request.method == 'PATCH':
        # Lightweight update — only update the fields that are sent
        data = request.json or {}
        patch_data = {'updated_at': datetime.now()}
        if 'completed' in data:
            patch_data['completed'] = bool(data['completed'])
        if exams_collection is not None:
            result = exams_collection.update_one(
                {'_id': ObjectId(exam_id), 'user': session['user']},
                {'$set': patch_data}
            )
            if result.matched_count > 0:
                return jsonify({'success': True})
            else:
                return jsonify({'error': 'Exam not found'}), 404
        return jsonify({'success': True})

    if request.method == 'PUT':
        data = request.json or {}
        update_data = {
            'subject':    sanitize(data.get('subject', '')),
            'date':       sanitize(data.get('date', '')),
            'time':       sanitize(data.get('time', '')),
            'duration':   data.get('duration'),
            'notes':      sanitize(data.get('notes', '')),
            'completed':  data.get('completed'),
            'updated_at': datetime.now()
        }
        if exams_collection is not None:
            result = exams_collection.update_one(
                {'_id': ObjectId(exam_id), 'user': session['user']},
                {'$set': update_data}
            )
            if result.matched_count > 0:
                return jsonify({'success': True, 'message': 'Exam updated successfully'})
            else:
                return jsonify({'error': 'Exam not found'})
        else:
            return jsonify({'success': True, 'message': 'Exam updated (dev mode)'})

    elif request.method == 'DELETE':
        if exams_collection is not None:
            result = exams_collection.delete_one({'_id': ObjectId(exam_id), 'user': session['user']})
            if result.deleted_count > 0:
                return jsonify({'success': True, 'message': 'Exam deleted successfully'})
            else:
                return jsonify({'error': 'Exam not found'})
        else:
            return jsonify({'success': True, 'message': 'Exam deleted (dev mode)'})


# CLASSES API

@app.route('/api/classes', methods=['GET', 'POST'])
def api_classes():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    if request.method == 'POST':
        data = request.json or {}
        name = sanitize(data.get('name', ''))
        date = sanitize(data.get('date', ''))

        if not name:
            return jsonify({'error': 'Class name is required.'}), 400
        if len(name) > 200:
            return jsonify({'error': 'Class name must be under 200 characters.'}), 400
        if date and not validate_date(date):
            return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD.'}), 400

        class_item = {
            'user':        session['user'],
            'name':        name,
            'instructor':  sanitize(data.get('instructor', '')),
            'day':         sanitize(data.get('day', '')),
            'date':        date or None,
            'time':        sanitize(data.get('time', '')),
            'duration':    data.get('duration'),
            'room':        sanitize(data.get('room', '')),
            'completed':   False,
            'created_at':  datetime.now()
        }
        if classes_collection is not None:
            result = classes_collection.insert_one(class_item)
            class_item['_id'] = str(result.inserted_id)
        else:
            class_item['_id'] = 'temp_id'
        return jsonify(class_item), 201

    else:
        if classes_collection is not None:
            classes = list(classes_collection.find({'user': session['user']}))
            for class_item in classes:
                class_item['_id'] = str(class_item['_id'])
        else:
            classes = []
        return jsonify(classes)


@app.route('/api/classes/<class_id>', methods=['PUT', 'DELETE'])
def api_single_class(class_id):
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    if request.method == 'PUT':
        data = request.json or {}
        update_data = {
            'name':        sanitize(data.get('name', '')),
            'instructor':  sanitize(data.get('instructor', '')),
            'day':         sanitize(data.get('day', '')),
            'date':        sanitize(data.get('date', '')),
            'time':        sanitize(data.get('time', '')),
            'duration':    data.get('duration'),
            'room':        sanitize(data.get('room', '')),
            'completed':   data.get('completed'),
            'updated_at':  datetime.now()
        }
        if classes_collection is not None:
            result = classes_collection.update_one(
                {'_id': ObjectId(class_id), 'user': session['user']},
                {'$set': update_data}
            )
            if result.matched_count > 0:
                return jsonify({'success': True, 'message': 'Class updated successfully'})
            else:
                return jsonify({'error': 'Class not found'})
        else:
            return jsonify({'success': True, 'message': 'Class updated (dev mode)'})

    elif request.method == 'DELETE':
        if classes_collection is not None:
            result = classes_collection.delete_one({'_id': ObjectId(class_id), 'user': session['user']})
            if result.deleted_count > 0:
                return jsonify({'success': True, 'message': 'Class deleted successfully'})
            else:
                return jsonify({'error': 'Class not found'})
        else:
            return jsonify({'success': True, 'message': 'Class deleted (dev mode)'})



# VACATIONS API


@app.route('/api/vacations', methods=['GET', 'POST'])
def api_vacations():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    if request.method == 'POST':
        data       = request.json or {}
        title      = sanitize(data.get('title', ''))
        start_date = sanitize(data.get('start_date', ''))
        end_date   = sanitize(data.get('end_date', ''))

        if not title:
            return jsonify({'error': 'Vacation title is required.'}), 400
        if start_date and not validate_date(start_date):
            return jsonify({'error': 'Invalid start date format. Use YYYY-MM-DD.'}), 400
        if end_date and not validate_date(end_date):
            return jsonify({'error': 'Invalid end date format. Use YYYY-MM-DD.'}), 400

        vacation_item = {
            'user':        session['user'],
            'title':       title,
            'start_date':  start_date or None,
            'end_date':    end_date or None,
            'description': sanitize(data.get('description', '')),
            'created_at':  datetime.now()
        }
        if vacations_collection is not None:
            result = vacations_collection.insert_one(vacation_item)
            vacation_item['_id'] = str(result.inserted_id)
        else:
            vacation_item['_id'] = 'temp_id'
        return jsonify(vacation_item), 201

    else:
        if vacations_collection is not None:
            vacations = list(vacations_collection.find({'user': session['user']}))
            for vacation in vacations:
                vacation['_id'] = str(vacation['_id'])
        else:
            vacations = []
        return jsonify(vacations)


@app.route('/api/vacations/<vacation_id>', methods=['PUT', 'PATCH', 'DELETE'])
def api_single_vacation(vacation_id):
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    if request.method == 'PATCH':
        # Lightweight update — only update the fields that are sent
        data = request.json or {}
        patch_data = {'updated_at': datetime.now()}
        if 'completed' in data:
            patch_data['completed'] = bool(data['completed'])
        if vacations_collection is not None:
            result = vacations_collection.update_one(
                {'_id': ObjectId(vacation_id), 'user': session['user']},
                {'$set': patch_data}
            )
            if result.matched_count > 0:
                return jsonify({'success': True})
            else:
                return jsonify({'error': 'Vacation not found'}), 404
        return jsonify({'success': True})

    if request.method == 'PUT':
        data = request.json or {}
        update_data = {
            'title':       sanitize(data.get('title', '')),
            'start_date':  sanitize(data.get('start_date', '')),
            'end_date':    sanitize(data.get('end_date', '')),
            'description': sanitize(data.get('description', '')),
            'updated_at':  datetime.now()
        }
        if vacations_collection is not None:
            result = vacations_collection.update_one(
                {'_id': ObjectId(vacation_id), 'user': session['user']},
                {'$set': update_data}
            )
            if result.matched_count > 0:
                return jsonify({'success': True, 'message': 'Vacation updated successfully'})
            else:
                return jsonify({'error': 'Vacation not found'})
        else:
            return jsonify({'success': True, 'message': 'Vacation updated (dev mode)'})

    elif request.method == 'DELETE':
        if vacations_collection is not None:
            result = vacations_collection.delete_one({'_id': ObjectId(vacation_id), 'user': session['user']})
            if result.deleted_count > 0:
                return jsonify({'success': True, 'message': 'Vacation deleted successfully'})
            else:
                return jsonify({'error': 'Vacation not found'})
        else:
            return jsonify({'success': True, 'message': 'Vacation deleted (dev mode)'})


# ACCOUNT / PASSWORD

@app.route('/api/change_password', methods=['POST'])
def api_change_password():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    data             = request.json or {}
    current_password = data.get('current_password', '')
    new_password     = data.get('new_password', '')

    if not current_password or not new_password:
        return jsonify({'error': 'Both current and new password are required.'}), 400
    if len(new_password) < 8:
        return jsonify({'error': 'New password must be at least 8 characters.'}), 400
    if not re.search(r'[A-Z]', new_password):
        return jsonify({'error': 'New password must contain at least one uppercase letter.'}), 400
    if not re.search(r'[0-9]', new_password):
        return jsonify({'error': 'New password must contain at least one number.'}), 400

    user = users_collection.find_one({'email': session['user']})
    if not user or not check_password_hash(user.get('password', ''), current_password):
        return jsonify({'error': 'Current password is incorrect.'}), 403

    users_collection.update_one(
        {'email': session['user']},
        {'$set': {'password': generate_password_hash(new_password)}}
    )
    return jsonify({'success': True})


@app.route('/api/account', methods=['DELETE'])
def api_delete_account():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    user_email = session['user']

    if users_collection is not None:
        # Delete all associated data first
        tasks_collection.delete_many({'user': user_email})
        exams_collection.delete_many({'user': user_email})
        classes_collection.delete_many({'user': user_email})
        schedules_collection.delete_many({'user': user_email})
        vacations_collection.delete_many({'user': user_email})
        # Finally delete the user account itself
        users_collection.delete_one({'email': user_email})

    session.pop('user', None)
    return jsonify({'success': True})

# LOGOUT

@app.route('/logout')
def logout():
    session.pop('user', None)
    return redirect(url_for('login'))


if __name__ == '__main__':
    app.run(debug=True, use_reloader=False)
