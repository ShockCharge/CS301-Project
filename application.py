import os
import re

import secrets

from flask import Flask, render_template, request, redirect, url_for, session, jsonify, Response
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_wtf.csrf import CSRFProtect, CSRFError
from werkzeug.security import generate_password_hash, check_password_hash
import json
from flask_mail import Mail, Message
from datetime import datetime, timedelta
from bson import ObjectId
import threading
import random
import warnings
import redis

from common import NZ_TZ, ZoneInfo, users_collection, schedules_collection, tasks_collection, exams_collection, classes_collection, vacations_collection, chain, llm, safe_ai_invoke, social_connections_collection, study_groups_collection, group_members_collection, group_messages_collection

from task import celery_app, get_ai_suggestions_task, get_ai_study_plan_task
from collaboration import collaboration_bp
from settings import settings_bp
from schedule import schedule_bp
from task_routes import task_bp
from exam import exam_bp
from classes import class_bp
from vacation import vacation_bp
from profile import profile_bp
from web_aware_ai import answer_with_web_awareness

import boto3

redis_client = redis.from_url(os.environ.get('REDIS_URL', os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0')))



BASE_DIR = os.path.abspath(os.path.dirname(__file__))
TEMPLATE_FOLDER = 'templates' if os.path.isdir(os.path.join(BASE_DIR, 'templates')) else 'Templates'
STATIC_FOLDER = 'static' if os.path.isdir(os.path.join(BASE_DIR, 'static')) else 'Static'

app = Flask(__name__, template_folder=TEMPLATE_FOLDER, static_folder=STATIC_FOLDER)
application = app

# CSRF is enabled for browser form submissions. JSON API routes are excluded here
# because the existing frontend fetch calls do not consistently send CSRF headers.
# This prevents template errors while protecting normal HTML forms such as login,
# signup, 2FA verification, and profile forms.
app.config['WTF_CSRF_CHECK_DEFAULT'] = False
app.config['WTF_CSRF_TIME_LIMIT'] = int(os.environ.get('WTF_CSRF_TIME_LIMIT', 3600))
csrf = CSRFProtect(app)

@app.before_request
def protect_non_api_forms():
    if request.method in ('POST', 'PUT', 'PATCH', 'DELETE') and not request.path.startswith('/api/'):
        csrf.protect()

@app.errorhandler(CSRFError)
def handle_csrf_error(error):
    if request.path.startswith('/api/'):
        return jsonify({'error': 'CSRF validation failed', 'details': error.description}), 400
    return render_template('login.html', error='Your form session expired. Please try again.'), 400



app.secret_key = os.environ.get('SECRET_KEY') or ('dev-only-change-me' if os.environ.get('FLASK_ENV') == 'development' else None)
if not app.secret_key:
    raise RuntimeError('SECRET_KEY environment variable is required in production.')

limiter = Limiter(
    key_func=get_remote_address,
    app=app,
    default_limits=[],
    storage_uri=os.environ.get('RATELIMIT_STORAGE_URI', 'memory://')
)

app.register_blueprint(collaboration_bp)
app.register_blueprint(settings_bp)
app.register_blueprint(schedule_bp)
app.register_blueprint(task_bp)
app.register_blueprint(exam_bp)
app.register_blueprint(class_bp)
app.register_blueprint(vacation_bp)
app.register_blueprint(profile_bp)

# Email configuration
# Gmail app passwords are often displayed with spaces; SMTP expects the compact value.
mail_username = (os.environ.get('MAIL_USERNAME') or '').strip()
mail_password = (os.environ.get('MAIL_PASSWORD') or '').replace(' ', '').strip()

app.config['MAIL_SERVER'] = os.environ.get('MAIL_SERVER', 'smtp.gmail.com')
app.config['MAIL_PORT'] = int(os.environ.get('MAIL_PORT', 587))
app.config['MAIL_USE_TLS'] = os.environ.get('MAIL_USE_TLS', 'true').lower() == 'true'
app.config['MAIL_USE_SSL'] = os.environ.get('MAIL_USE_SSL', 'false').lower() == 'true'
app.config['MAIL_USERNAME'] = mail_username
app.config['MAIL_PASSWORD'] = mail_password
app.config['MAIL_DEFAULT_SENDER'] = os.environ.get('MAIL_DEFAULT_SENDER') or mail_username
app.config['MAIL_TIMEOUT'] = int(os.environ.get('MAIL_TIMEOUT', 20))
mail = Mail(app)


# HELPER FUNCTIONS

def generate_otp():
    """Generate a secure 6-digit verification code."""
    return ''.join(str(secrets.randbelow(10)) for _ in range(6))

def send_otp_email(user_email, phone, otp_code):
    """Send a login verification code by email and phone."""
    if not app.config.get('MAIL_USERNAME') or not app.config.get('MAIL_PASSWORD'):
        print('OTP Email Error: MAIL_USERNAME or MAIL_PASSWORD is not configured.')
        return False

    try:
        msg = Message(
            subject='Study Planner Verification Code',
            recipients=[user_email]
        )

        msg.body = f"""
Your Study Planner verification code is: {otp_code}

This code expires in 10 minutes. If you did not try to log in, you can ignore this email.
"""

        mail.send(msg)
        return True

    except Exception as e:
        print(f"OTP Email Error: {e}")
        return False

def login_2fa_enabled():
    """Return True when email OTP verification should be required at login."""
    return os.environ.get('LOGIN_2FA_ENABLED', 'true').strip().lower() in ('1', 'true', 'yes', 'on')


def start_2fa_session(user_email, phone, user_name=''):
    """Create a pending login session and send the user's OTP email."""
    otp_code = generate_otp()
    session['pending_user'] = user_email
    session['pending_user_name'] = user_name
    session['pending_phone'] = phone 
    session['otp_code'] = otp_code
    session['otp_expiry'] = (datetime.utcnow() + timedelta(minutes=10)).isoformat()
    session['otp_attempts'] = 0
    session['last_otp_sent_at'] = datetime.utcnow().isoformat()

    if send_otp_email(user_email, phone, otp_code):
        return True

    session.pop('pending_user', None)
    session.pop('pending_user_name', None)
    session.pop('pending_phone', None)
    session.pop('otp_code', None)
    session.pop('otp_expiry', None)
    session.pop('otp_attempts', None)
    session.pop('last_otp_sent_at', None)
    return False

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
                    sms_sent = send_sms(phone, sms_message)
                    if not sms_sent:
                        print(f"SMS not delivered to {phone}")
            except Exception as e:
                print(f"SMS failed for {email}: {e}")

deadline_checker_started = False


def start_deadline_checker():
    """Run deadline checker every 24 hours with a duplicate-start guard."""
    global deadline_checker_started
    if deadline_checker_started:
        print("Deadline checker is already running.")
        return

    deadline_checker_started = True

    def run_check_loop():
        check_upcoming_deadlines()
        timer = threading.Timer(86400, run_check_loop)
        timer.daemon = True
        timer.start()

    run_check_loop()


def get_task_status(date_str):
    """
    Determine the status of a task/exam/schedule based on its date.
    Returns 'outdated', 'current', 'no_date', or 'invalid_date'.
    """
    if not date_str:
        return 'no_date'

    try:
        task_date = datetime.strptime(str(date_str), '%Y-%m-%d').date()
        today = datetime.now(NZ_TZ).date()
        return 'outdated' if task_date < today else 'current'
    except (ValueError, TypeError):
        print(f"Warning: Invalid date format encountered: {date_str}")
        return 'invalid_date'


# TEST / UTILITY ROUTES

@app.route('/health')
def health():
    db_ok = users_collection is not None
    return jsonify({'status': 'ok' if db_ok else 'degraded', 'database': db_ok}), 200 if db_ok else 503


@app.route('/test_email')
def test_email():
    """Send a controlled test email to the currently logged-in user only."""
    if 'user' not in session:
        return redirect(url_for('login'))

    if not app.config.get('MAIL_USERNAME') or not app.config.get('MAIL_PASSWORD'):
        return "Email is not configured. Please set MAIL_USERNAME and MAIL_PASSWORD in .env.", 500

    try:
        msg = Message(
            subject="Study Planner Test Email",
            recipients=[session['user']],
            body="This is a Study Planner test email. If you received this, your email setup is working."
        )
        mail.send(msg)
        return f"Test email sent to {session['user']}!"
    except Exception as e:
        return f"Failed: {str(e)}", 500


# AUTH ROUTES

@app.route('/', methods=['GET', 'POST'])
@limiter.limit('5 per minute', methods=['POST'])
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
            # Development-only fallback. Never allow test credentials in production.
            if os.environ.get('FLASK_ENV') == 'development' and email == 'test@example.com' and password == 'password':
                user = {'email': email, 'first_name': 'Test', 'last_name': 'User'}
            else:
                return render_template('login.html', error='Database is unavailable. Please try again later.')

        if user:
            user_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()

            if login_2fa_enabled():
                if start_2fa_session(email, user_name):
                    return redirect(url_for('verify_2fa'))
                return render_template(
                    'login.html',
                    error='Login details are correct, but the verification email could not be sent. Please check your email settings or try again later.'
                )

            session['user']      = email
            session['user_name'] = user_name
            return redirect(url_for('dashboard'))
        else:
            return render_template('login.html', error='Invalid email or password.')
    return render_template('login.html')

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

            user_data = {
                'first_name':  first_name,
                'last_name':   last_name,
                'email':       email,
                'password':    generate_password_hash(password),
                'phone':       phone,
                'institution': institution,
                'major':       major,
                'created_at':  datetime.now(NZ_TZ)
            }
            users_collection.insert_one(user_data)
        else:
            return render_template('signup.html', error='Database connection is unavailable. Please check MongoDB settings.')

        return redirect(url_for('login'))

    return render_template('signup.html')


# PAGE ROUTES
@app.route('/verify-2fa', methods=['GET', 'POST'])
def verify_2fa():

    if 'pending_user' not in session:
        return redirect(url_for('login'))

    if request.method == 'POST':

        entered_otp = request.form.get('otp', '')

        stored_otp = session.get('otp_code')
        expiry = session.get('otp_expiry')

        if not stored_otp or not expiry:
            return render_template('verify2fa_mobile.html', error='Verification session expired', email=session.get('pending_user'))

        expiry = datetime.fromisoformat(expiry)

        if datetime.utcnow() > expiry:
            return render_template('verify2fa_mobile.html', error='OTP expired', email=session.get('pending_user'))

        if entered_otp == stored_otp:

            session['user'] = session['pending_user']
            session['user_name'] = session.get('pending_user_name', '')

            session.pop('pending_user', None)
            session.pop('pending_user_name', None)
            session.pop('otp_code', None)
            session.pop('otp_expiry', None)

            return redirect(url_for('dashboard'))

        return render_template('verify2fa_mobile.html', error='Invalid verification code', email=session.get('pending_user'))

    return render_template('verify2fa_mobile.html', email=session.get('pending_user'))


@app.route('/resend-2fa', methods=['POST'])
def resend_2fa():
    """Resend the login verification email for the pending user."""
    pending_user = session.get('pending_user')
    if not pending_user:
        return redirect(url_for('login'))

    otp_code = generate_otp()
    session['otp_code'] = otp_code
    session['otp_expiry'] = (datetime.utcnow() + timedelta(minutes=10)).isoformat()

    if send_otp_email(pending_user, otp_code):
        return render_template('verify2fa_mobile.html', email=pending_user, info='A new verification code has been sent to your email.')

    return render_template('verify2fa_mobile.html', email=pending_user, error='Could not resend the verification code. Please try again later.')


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

    return render_template('dashboard.html', progress=progress, tasks=tasks_for_display,
                           exams=exams_for_display, outdated_items=outdated_items)


@app.route('/api/clear-outdated', methods=['POST'])
def clear_outdated():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    today         = datetime.now(NZ_TZ).date()
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
        today_str     = today.strftime('%Y-%m-%d')
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
                exam_date = datetime.strptime(exam_date_str, '%Y-%m-%d')
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


@app.route('/api/suggestions')
def api_suggestions_alias():
    """Compatibility route for frontend JavaScript that calls /api/suggestions."""
    return get_ai_suggestions()


@app.route('/api/ai-task-status/<task_id>')
def ai_task_status(task_id):
    """Return Celery task status in a frontend-friendly format."""
    task = celery_app.AsyncResult(task_id)

    if task.state == 'PENDING':
        response = {'state': task.state, 'status': 'pending', 'message': 'Pending...'}
    elif task.state == 'STARTED':
        response = {'state': task.state, 'status': 'started', 'message': 'Task started...'}
    elif task.state == 'SUCCESS':
        response = {'state': task.state, 'status': 'success', 'result': task.result}
    elif task.state == 'FAILURE':
        response = {'state': task.state, 'status': 'failed', 'error': str(task.info), 'result': None}
    else:
        response = {'state': task.state, 'status': task.state.lower(), 'message': str(task.info)}

    return jsonify(response)


@app.route('/tasks')
def tasks():
    if 'user' not in session:
        return redirect(url_for('login'))

    if tasks_collection is not None:
        tasks_list = list(tasks_collection.find({'user': session['user']}).sort('date', 1))
        for task in tasks_list:
            task['_id'] = str(task['_id'])
            task['status'] = get_task_status(task.get('date'))
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
    tasks_data = list(tasks_collection.find({'user': session['user']})) if tasks_collection is not None else []
    exams_data = list(exams_collection.find({'user': session['user']})) if exams_collection is not None else []
    context    = f"Tasks: {tasks_data}\nExams: {exams_data}"
    advice     = safe_ai_invoke({"question": "Give the student helpful study advice for today", "user_context": context})
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
        today = datetime.now(NZ_TZ).strftime('%Y-%m-%d')

        # Gather user data (fast part - stays in Flask)
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
                {'name': e.get('subject', e.get('name')), 'date': e.get('date')}
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

        # Offload the heavy AI work to Celery
        task = get_ai_study_plan_task.delay(user_email)   # ← Only pass user_email

        return jsonify({
            'task_id': task.id,
            'status': 'processing',
            'message': 'Generating your personalized study plan... (this may take 15-40 seconds)'
        }), 202   

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    

@app.route('/api/task/<task_id>')
def task_status(task_id):
    
    task = get_ai_study_plan_task.AsyncResult(task_id)
    
    if task.state == 'PENDING':
        return jsonify({"status": "pending", "message": "Still generating..."})
    elif task.state == 'SUCCESS':
        return jsonify({"status": "success", "result": task.result})
    elif task.state == 'FAILURE':
        return jsonify({"status": "failed", "error": str(task.info)})
    else:
        return jsonify({"status": task.state})

# Settings/account API routes moved to settings.py.


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


# Profile API routes moved to profile.py.

# Schedule API routes moved to schedule_routes.py.


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

    user_tasks = list(tasks_collection.find({
        'user': session['user'],
        'completed': {'$ne': True},
        '$or': [{'date': {'$gte': today}}, {'date': None}, {'date': ''}, {'date': {'$exists': False}}]
    })) if tasks_collection is not None else []
    user_exams     = list(exams_collection.find({'user': session['user'], 'date': {'$gte': today}, 'completed': {'$ne': True}})) if exams_collection is not None else []
    user_classes   = list(classes_collection.find({'user': session['user']})) if classes_collection is not None else []
    user_schedules = list(schedules_collection.find({'user': session['user'], '$or': [{'date': {'$gte': today}}, {'date': None}, {'date': ''}, {'date': {'$exists': False}}]})) if schedules_collection is not None else []

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
        cache_key = f"chat:{session['user']}:{today}:{user_message}"
        cached = None
        try:
            cached = redis_client.get(cache_key)
        except Exception as redis_error:
            print('Redis cache unavailable:', redis_error)
        if cached:
            return jsonify({'response': cached.decode('utf-8')})
        ai_result = answer_with_web_awareness(chain, user_message, context)

        ai_response = ai_result.get('response', '')
        try:
            redis_client.set(cache_key, ai_response, ex=3600)
        except Exception as redis_error:
            print('Redis cache save failed:', redis_error)
        return jsonify({
            'response': ai_response,
            'web_used': ai_result.get('web_used', False),
            'sources': ai_result.get('sources', []),
            'web_error': ai_result.get('web_error')
        })

    except Exception as e:
        print("Ollama / LangChain error:", str(e))
        return jsonify({'error': f'Local AI failed: {str(e)}'}), 500


# Tasks API routes moved to task_routes.py.


# Exams API routes moved to exam_routes.py.

# Classes API routes moved to class_routes.py.


# VACATIONS API


# Vacations API routes moved to vacation.py.

# ACCOUNT / PASSWORD

# Settings/account API routes moved to settings.py.


# LOGOUT

@app.route('/logout')
def logout():
    session.pop('user', None)
    session.pop('user_name', None)
    session.pop('pending_user', None)
    session.pop('pending_user_name', None)
    session.pop('otp_code', None)
    session.pop('otp_expiry', None)
    return redirect(url_for('login'))


if os.environ.get('START_DEADLINE_CHECKER', 'false').strip().lower() in ('1', 'true', 'yes', 'on'):
    start_deadline_checker()


if __name__ == '__main__':
    app.run(debug=True, use_reloader=False)
