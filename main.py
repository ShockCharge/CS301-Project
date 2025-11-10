import os
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from flask_mail import Mail, Message
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from pymongo import MongoClient
from dotenv import load_dotenv
from datetime import datetime, timedelta
from bson import ObjectId
import threading
from openai import OpenAI


load_dotenv()

openai_api_key = os.environ.get("OPENAI_API_KEY")
if not openai_api_key:
    raise ValueError("OPENAI_API_KEY not found in environment variables")
openai_client = OpenAI(api_key=openai_api_key)

app = Flask(__name__)
app.secret_key = 'supersecretkey123'

# Email configuration

app.config['MAIL_SERVER'] = 'smtp.gmail.com'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_SSL'] = False
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = os.environ.get('MAIL_USERNAME')
app.config['MAIL_PASSWORD'] = os.environ.get('MAIL_PASSWORD')
app.config['MAIL_DEFAULT_SENDER'] = os.environ.get('MAIL_USERNAME') 


mail = Mail(app)

# Timezone configuration with fallback
try:
    NZ_TZ = ZoneInfo("Pacific/Auckland")
except ZoneInfoNotFoundError:
    print("Warning: 'Pacific/Auckland' timezone not found. Falling back to UTC.")
    print("Please install tzdata: pip install tzdata")
    NZ_TZ = ZoneInfo("UTC")


# MongoDB connection
try:
    MONGO_USER = os.environ.get("MONGO_USER", "")
    MONGO_PASS = os.environ.get("MONGO_PASS", "")
    
    if MONGO_USER and MONGO_PASS:
        conn_str = f"mongodb+srv://{MONGO_USER}:{MONGO_PASS}@studyplanner.y4rlgjy.mongodb.net/study_planner_db?retryWrites=true&w=majority"
        mongo_client = MongoClient(conn_str, serverSelectionTimeoutMS=5000)
        mongo_client.server_info()
        db = mongo_client["study_planner_db"]
        users_collection = db["users"]
        schedules_collection = db["schedules"]
        tasks_collection = db["tasks"]
        exams_collection = db["exams"]
        classes_collection = db["classes"]
        vacations_collection = db["vacations"]
        
        print("MongoDB Atlas connected successfully!")
    else:
        print("No MongoDB credentials found. Running in development mode.")
        users_collection = None
        schedules_collection = None
        tasks_collection = None
        exams_collection = None
        classes_collection = None
        vacations_collection = None
except Exception as e:
    print(f"MongoDB connection failed: {e}")
    print("Running in development mode.")
    users_collection = None
    schedules_collection = None
    tasks_collection = None
    exams_collection = None
    classes_collection = None
    vacations_collection = None

# Email notification function
def send_deadline_email(user_email, user_name, deadline_date, items):
    """Send email notification for upcoming deadlines"""
    try:
        # Read email template
        template_path = os.path.join(os.path.dirname(__file__), 'templates', 'email_template.html')
        with open(template_path, 'r', encoding='utf-8') as f:
            html_template = f.read()
        
        # Format items as HTML list
        items_html = ''.join([f'<li style="margin: 8px 0; color: #333;">{item}</li>' for item in items])
        
        # Replace placeholders
        html_content = html_template.replace('{{USER_NAME}}', user_name)
        html_content = html_content.replace('{{DATE}}', deadline_date)
        html_content = html_content.replace('{{ITEMS}}', items_html)
        
        # Create message
        msg = Message(
            subject='Study Planner - Upcoming Deadlines Reminder',
            recipients=[user_email]
        )
        
        # Plain text version
        msg.body = f"""
Hello {user_name},

This is a friendly reminder about your upcoming deadlines tomorrow ({deadline_date}):

{chr(10).join(['- ' + item for item in items])}

Don't forget to prepare! Good luck!

Best regards,
Study Planner Team
        """
        
        # HTML version
        msg.html = html_content
        
        # Send email
        mail.send(msg)
        print(f" Email sent to {user_email} ({len(items)} items)")
        return True
        
    except Exception as e:
        print(f" Failed to send email to {user_email}: {e}")
        return False

def check_upcoming_deadlines():
    """Check for deadlines in the next 24 hours and send email notifications"""
    if users_collection is None:
        print("Skipping deadline check - no database connection")
        return
    
    now_nz = datetime.now(NZ_TZ)  # Use the global NZ_TZ here
    tomorrow = now_nz + timedelta(days=1)
    tomorrow_str = tomorrow.strftime('%Y-%m-%d')
    
    print(f"Checking deadlines for {tomorrow_str}...")
    
    # Get all users
    users = users_collection.find()
    
    for user in users:
        email = user.get('email')
        user_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or email
        
        upcoming_items = []
        
        # Check tasks
        if tasks_collection is not None:
            tasks = tasks_collection.find({
                'user': email,
                'completed': {'$ne': True},
                'date': tomorrow_str
            })
            for task in tasks:
                upcoming_items.append(f"Task: {task.get('name')} - {task.get('date')}")
        
        # Check exams
        if exams_collection:
            exams = exams_collection.find({
                'user': email,
                'completed': {'$ne': True},
                'date': tomorrow_str
            })
            for exam in exams:
                upcoming_items.append(f" Exam: {exam.get('subject')} - {exam.get('date')} at {exam.get('time')}")
        
        # Check schedules
        if schedules_collection:
            schedules = schedules_collection.find({
                'user': email,
                'completed': {'$ne': True},
                'date': tomorrow_str
            })
            for schedule in schedules:
                upcoming_items.append(f" Schedule: {schedule.get('title')} - {schedule.get('date')} at {schedule.get('time')}")
        
        # Send email if there are upcoming items
        if upcoming_items and app.config['MAIL_USERNAME']:
            send_deadline_email(email, user_name, tomorrow_str, upcoming_items)
        elif upcoming_items:
            print(f"  {email} has {len(upcoming_items)} upcoming items but email not configured")

def start_deadline_checker():
    """Run deadline checker every 24 hours"""
    check_upcoming_deadlines()
    # Schedule next check in 24 hours (86400 seconds)
    threading.Timer(86400, start_deadline_checker).start()

def get_task_status(date_str):
    """
    Determine the status of a task/exam/schedule based on its date.
    
    Args:
        date_str: Date string in format 'YYYY-MM-DD'
    
    Returns:
        'outdated' if the date is in the past
        'current' if the date is today or in the future
    """
    if not date_str:
        return 'current'  
    
    try:
        
        task_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        today = datetime.now(NZ_TZ).date()

        
        
        if task_date < today:
            return 'outdated'
        else:
            return 'current'
    except (ValueError, TypeError):
        
        return 'current'
    
@app.route('/test_email')
def test_email():
    try:
        msg = Message(subject="Test Email", recipients=["1bikramp@gmail.com"], body="This is a test.")
        mail.send(msg)
        return "Email sent!"
    except Exception as e:
        return f"Failed: {str(e)}"


@app.route('/', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']
        
        if users_collection is not None:
            user = users_collection.find_one({'email': email, 'password': password})
        else:
            user = {'email': email} if email == 'test@example.com' and password == 'password' else None
        
        if user:
            session['user'] = email
            if users_collection is not None and user:
                session['user_name'] = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()
            else:
                session['user_name'] = email
            return redirect(url_for('dashboard'))
        else:
            return render_template('login.html', error='Invalid email or password')
    return render_template('login.html')

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        first_name = request.form['first_name']
        last_name = request.form['last_name']
        email = request.form['email']
        password = request.form['password']
        confirm_password = request.form['confirm_password']
        institution = request.form['institution']
        major = request.form['major']
        
        if password != confirm_password:
            return render_template('signup.html', error='Passwords do not match')
        
        if users_collection is not None:
            if users_collection.find_one({'email': email}):
                return render_template('signup.html', error='Email already registered')
            
            user_data = {
                'first_name': first_name,
                'last_name': last_name,
                'email': email,
                'password': password,
                'institution': institution,
                'major': major,
                'created_at': datetime.now()
            }
            users_collection.insert_one(user_data)
        
        return redirect(url_for('login'))
    return render_template('signup.html')

@app.route('/dashboard')
def dashboard():
    if 'user' not in session:
        return redirect(url_for('login'))
    
    # Get user's activities
    if tasks_collection is not None:
        # Initialize lists for categorized activities
        outdated_tasks = []
        outdated_exams = []
        outdated_schedules = []
        outdated_classes = []
        outdated_vacations = []
        
        # 1. Process Tasks
        all_tasks = list(tasks_collection.find({'user': session['user']}))
        tasks_for_display = []
        for task in all_tasks:
            task['_id'] = str(task['_id'])
            status = get_task_status(task.get('date'))
            if status == 'outdated':
                outdated_tasks.append(task)
            else:
                # Only display non-outdated tasks on dashboard
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
                # Only display non-outdated exams on dashboard
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
        
        total_items = 0
        completed_items = 0
        
        # Count tasks
        total_items += len(all_tasks)
        completed_items += len([t for t in all_tasks if t.get('completed', False)])
        
        # Count exams
        total_items += len(all_exams)
        completed_items += len([e for e in all_exams if e.get('completed', False)])
        
        # Count classes
        total_items += len(all_classes)
        completed_items += len([c for c in all_classes if c.get('completed', False)])
        
        # Count schedules
        total_items += len(all_schedules)
        completed_items += len([s for s in all_schedules if s.get('completed', False)])
        
        # Calculate percentage
        if total_items > 0:
            progress = int((completed_items / total_items) * 100)
        else:
            progress = 0
    else:
        tasks_for_display = []
        exams_for_display = []
        outdated_items = []
        progress = 0
    
    return render_template('dashboard.html', progress=progress, tasks=tasks_for_display, exams=exams_for_display, outdated_items=outdated_items)
@app.route('/api/clear-outdated', methods=['POST'])
def clear_outdated():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    from datetime import datetime
    from zoneinfo import ZoneInfo
    
    try:
        NZ_TZ = ZoneInfo("Pacific/Auckland")
    except:
        NZ_TZ = ZoneInfo("UTC")
    
    today = datetime.now(NZ_TZ).date()
    deleted_count = 0
    
    # Delete outdated tasks
    if tasks_collection is not None:
        result = tasks_collection.delete_many({
            'user': session['user'],
            'date': {'$lt': today.strftime('%Y-%m-%d')}
        })
        deleted_count += result.deleted_count
    
    # Delete outdated exams
    if exams_collection is not None:
        result = exams_collection.delete_many({
            'user': session['user'],
            'date': {'$lt': today.strftime('%Y-%m-%d')}
        })
        deleted_count += result.deleted_count
    
    # Delete outdated schedules
    if schedules_collection is not None:
        result = schedules_collection.delete_many({
            'user': session['user'],
            'date': {'$lt': today.strftime('%Y-%m-%d')}
        })
        deleted_count += result.deleted_count
    
    # Delete outdated classes (if they have dates)
    if classes_collection is not None:
        result = classes_collection.delete_many({
            'user': session['user'],
            'date': {'$exists': True, '$lt': today.strftime('%Y-%m-%d')}
        })
        deleted_count += result.deleted_count
    
    # Delete outdated vacations
    if vacations_collection is not None:
        result = vacations_collection.delete_many({
            'user': session['user'],
            'start_date': {'$lt': today.strftime('%Y-%m-%d')}
        })
        deleted_count += result.deleted_count
    
    return jsonify({'success': True, 'deleted_count': deleted_count})

@app.route('/schedule')
def schedule():
    if 'user' not in session:
        return redirect(url_for('login'))
    
    if schedules_collection is not None:
        all_schedules = list(schedules_collection.find({'user': session['user']}).sort('date', 1))
        
        # Filter out outdated schedules
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
    """Render the chatbot page"""
    if 'user' not in session:
        return redirect(url_for('login'))
    return render_template('chatbot.html')


@app.route('/tasks')
def tasks():
    if 'user' not in session:
        return redirect(url_for('login'))
    
    if tasks_collection is not None:
        all_tasks = list(tasks_collection.find({'user': session['user']}).sort('date', 1))
        
        # Filter out outdated tasks
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
        all_exams = list(exams_collection.find({'user': session['user']}).sort('date', 1))
        
        # Filter out outdated exams
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
        all_classes = list(classes_collection.find({'user': session['user']}).sort('date', 1))
        
        # Filter out outdated classes
        classes_list = []
        for class_item in all_classes:
            # Only filter if the class has a date field
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
        all_vacations = list(vacations_collection.find({'user': session['user']}).sort('start_date', 1))
        
        # Filter out outdated vacations (based on start_date)
        vacations_list = []
        for vacation in all_vacations:
            # Only filter if the vacation has a start_date field
            if vacation.get('start_date') and get_task_status(vacation.get('start_date')) == 'outdated':
                continue
            vacation['_id'] = str(vacation['_id'])
            vacations_list.append(vacation)
    else:
        vacations_list = []
        
    return render_template('vacations.html', vacations=vacations_list)


@app.route('/settings')
def settings():
    if 'user' not in session:
        return redirect(url_for('login'))
    return render_template('settings.html')

@app.route('/profile')
def profile():
    if 'user' not in session:
        return redirect(url_for('login'))
    
    # Get user data from database
    user_data = None
    stats = {
        'total_study_time': 0,
        'completed_tasks': 0,
        'total_tasks': 0,
        'upcoming_exams': 0,
        'current_streak': 0
    }
    
    if users_collection is not None:
        user_data = users_collection.find_one({'email': session['user']})
        if user_data:
            user_data['_id'] = str(user_data['_id'])
        
        # Calculate real statistics
        if tasks_collection is not None:
            stats['total_tasks'] = tasks_collection.count_documents({'user': session['user']})
            stats['completed_tasks'] = tasks_collection.count_documents({
                'user': session['user'], 
                'completed': True
            })
        
        if exams_collection is not None:
            today = datetime.now(NZ_TZ).strftime('%Y-%m-%d')
            stats['upcoming_exams'] = exams_collection.count_documents({
                'user': session['user'],
                'date': {'$gte': today},
                'completed': {'$ne': True}
            })
        
        # Calculate study time from completed tasks/classes with duration
        if tasks_collection is not None:
            completed_tasks = tasks_collection.find({
                'user': session['user'],
                'completed': True,
                'duration': {'$exists': True}
            })
            for task in completed_tasks:
                stats['total_study_time'] += task.get('duration', 0)
                # TODO: Calculate total_study_time and current_streak
        
    
    return render_template('profile.html', user=user_data, stats=stats)

# API Endpoints
@app.route('/api/schedules', methods=['GET', 'POST'])
def api_schedules():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    if request.method == 'POST':
        data = request.json
        schedule_item = {
            'user': session['user'],
            'title': data.get('title'),
            'date': data.get('date'),
            'time': data.get('time'),
            'duration': data.get('duration'),
            'description': data.get('description'),
            'completed': False,
            'created_at': datetime.now()
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
    
@app.route('/api/chat', methods=['POST'])
def chat():
    """Handle chat messages and return AI responses"""
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    data = request.json
    user_message = data.get('message')

    if not user_message:
        return jsonify({'error': 'No message provided'}), 400

    # Gather user's current data for context
    user_tasks = list(tasks_collection.find({'user': session['user']}))
    user_exams = list(exams_collection.find({'user': session['user']}))
    user_classes = list(classes_collection.find({'user': session['user']}))
    user_schedules = list(schedules_collection.find({'user': session['user']}))

    # Convert MongoDB ObjectId to string for JSON serialization
    for task in user_tasks:
        task['_id'] = str(task['_id'])
    for exam in user_exams:
        exam['_id'] = str(exam['_id'])
    for cls in user_classes:
        cls['_id'] = str(cls['_id'])
    for schedule in user_schedules:
        schedule['_id'] = str(schedule['_id'])

    # Create a comprehensive system prompt with user context
    system_prompt = f"""
You are a friendly and helpful AI study assistant integrated into the Study Planner application.
Your goal is to help the user manage their academic life effectively.

Here is the user's current data:

**Tasks ({len(user_tasks)} total):**
{user_tasks if user_tasks else "No tasks yet"}

**Exams ({len(user_exams)} total):**
{user_exams if user_exams else "No exams scheduled"}

**Classes ({len(user_classes)} total):**
{user_classes if user_classes else "No classes added"}

**Schedule Items ({len(user_schedules)} total):**
{user_schedules if user_schedules else "No schedule items"}

Based on this data, you can:
1. Answer questions about their tasks, exams, classes, and schedule
2. Help them prioritize their work
3. Provide study tips and time management advice
4. Offer motivation and encouragement
5. Help break down large tasks into smaller steps
6. Suggest study schedules based on their workload

Example questions you can answer:
- "What are my most important tasks?"
- "When is my next exam?"
- "Do I have anything due tomorrow?"
- "How should I prepare for my upcoming exam?"
- "I'm feeling overwhelmed, can you help?"

Keep your responses:
- Concise and to the point
- Helpful and actionable
- Encouraging and positive
- Based on the actual data provided above

If the user asks you to add, edit, or delete items, politely inform them that they need to use the respective pages in the application (Tasks, Exams, Classes, etc.) as you can only provide information and advice.
"""

    try:
        if not openai_client:
            return jsonify({'error': 'AI assistant is not configured.'})
        
        # Call OpenAI API
        response = openai_client.chat.completions.create(
            model="gpt-3.5-turbo",  # Using the cost-effective model
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            temperature=0.7,  # Balanced creativity and consistency
            max_tokens=500    # Limit response length
        )
        
        ai_response = response.choices[0].message.content
        return jsonify({'response': ai_response})

    except Exception as e:
        print(f"OpenAI API Error: {e}")
        return jsonify({'error': 'Failed to get response from AI assistant. Please try again.'})




@app.route('/api/tasks', methods=['GET', 'POST'])
def api_tasks():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    if request.method == 'POST':
        data = request.json
        task_item = {
            'user': session['user'],
            'name': data.get('name'),
            'priority': data.get('priority', 'medium'),
            'date': data.get('date'),
            'description': data.get('description'),
            'completed': False,
            'created_at': datetime.now()
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

@app.route('/api/tasks/<task_id>/toggle', methods=['PUT'])
def toggle_task(task_id):
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    if tasks_collection is not None:
        task = tasks_collection.find_one({'_id': ObjectId(task_id), 'user': session['user']})
        
        if task:
            new_status = not task.get('completed', False)
            tasks_collection.update_one(
                {'_id': ObjectId(task_id)},
                {'$set': {'completed': new_status}}
            )
            return jsonify({'success': True, 'completed': new_status})
        else:
            return jsonify({'error': 'Task not found'}), 404
    else:
        return jsonify({'success': True, 'completed': True})

@app.route('/api/exams', methods=['GET', 'POST'])
def api_exams():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    if request.method == 'POST':
        data = request.json
        exam_item = {
            'user': session['user'],
            'subject': data.get('subject'),
            'date': data.get('date'),
            'time': data.get('time'),
            'duration': data.get('duration'),
            'notes': data.get('notes'),
            'completed': False,
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

@app.route('/api/exams/<exam_id>/toggle', methods=['PUT'])
def toggle_exam(exam_id):
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    if exams_collection is not None:
        exam = exams_collection.find_one({'_id': ObjectId(exam_id), 'user': session['user']})
        
        if exam:
            new_status = not exam.get('completed', False)
            exams_collection.update_one(
                {'_id': ObjectId(exam_id)},
                {'$set': {'completed': new_status}}
            )
            return jsonify({'success': True, 'completed': new_status})
        else:
            return jsonify({'error': 'Exam not found'}), 404
    else:
        return jsonify({'success': True, 'completed': True})

@app.route('/api/classes', methods=['GET', 'POST'])
def api_classes():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    if request.method == 'POST':
        data = request.json
        class_item = {
            'user': session['user'],
            'name': data.get('name'),
            'instructor': data.get('instructor'),
            'day': data.get('day'),
            'time': data.get('time'),
            'room': data.get('room'),
            'completed': False,
            'created_at': datetime.now()
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

@app.route('/api/classes/<class_id>/toggle', methods=['PUT'])
def toggle_class(class_id):
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    if classes_collection is not None:
        class_item = classes_collection.find_one({'_id': ObjectId(class_id), 'user': session['user']})
        
        if class_item:
            new_status = not class_item.get('completed', False)
            classes_collection.update_one(
                {'_id': ObjectId(class_id)},
                {'$set': {'completed': new_status}}
            )
            return jsonify({'success': True, 'completed': new_status})
        else:
            return jsonify({'error': 'Class not found'}), 404
    else:
        return jsonify({'success': True, 'completed': True})

@app.route('/api/schedules/<schedule_id>/toggle', methods=['PUT'])
def toggle_schedule(schedule_id):
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    if schedules_collection is not None:
        schedule = schedules_collection.find_one({'_id': ObjectId(schedule_id), 'user': session['user']})
        
        if schedule:
            new_status = not schedule.get('completed', False)
            schedules_collection.update_one(
                {'_id': ObjectId(schedule_id)},
                {'$set': {'completed': new_status}}
            )
            return jsonify({'success': True, 'completed': new_status})
        else:
            return jsonify({'error': 'Schedule not found'}), 404
    else:
        return jsonify({'success': True, 'completed': True})

@app.route('/api/vacations', methods=['GET', 'POST'])
def api_vacations():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    if request.method == 'POST':
        data = request.json
        vacation_item = {
            'user': session['user'],
            'title': data.get('title'),
            'start_date': data.get('start_date'),
            'end_date': data.get('end_date'),
            'description': data.get('description'),
            'created_at': datetime.now()
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

@app.route('/api/profile', methods=['PUT'])
def update_profile():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.json
    update_data = {}
    
    # Personal information
    if 'first_name' in data:
        update_data['first_name'] = data['first_name']
    if 'last_name' in data:
        update_data['last_name'] = data['last_name']
    if 'phone' in data:
        update_data['phone'] = data['phone']
    if 'date_of_birth' in data:
        update_data['date_of_birth'] = data['date_of_birth']
    if 'gender' in data:
        update_data['gender'] = data['gender']
    if 'address' in data:
        update_data['address'] = data['address']
    
    # Study information
    if 'institution' in data:
        update_data['institution'] = data['institution']
    if 'student_id' in data:
        update_data['student_id'] = data['student_id']
    if 'major' in data:
        update_data['major'] = data['major']
    if 'year_level' in data:
        update_data['year_level'] = data['year_level']
    if 'daily_study_goal' in data:
        update_data['daily_study_goal'] = data['daily_study_goal']
    if 'preferred_study_time' in data:
        update_data['preferred_study_time'] = data['preferred_study_time']
    
    update_data['updated_at'] = datetime.now()
    
    if users_collection is not None:
        users_collection.update_one(
            {'email': session['user']},
            {'$set': update_data}
        )
        return jsonify({'success': True, 'message': 'Profile updated successfully'})
    else:
        return jsonify({'success': True, 'message': 'Profile updated (dev mode)'})

# DELETE and UPDATE endpoints for Tasks
@app.route('/api/tasks/<task_id>', methods=['DELETE'])
def delete_task(task_id):
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    if tasks_collection is not None:
        result = tasks_collection.delete_one({'_id': ObjectId(task_id), 'user': session['user']})
        if result.deleted_count > 0:
            return jsonify({'success': True, 'message': 'Task deleted successfully'})
        else:
            return jsonify({'error': 'Task not found'}), 404
    else:
        return jsonify({'success': True, 'message': 'Task deleted (dev mode)'})

@app.route('/api/tasks/<task_id>', methods=['PUT'])
def update_task(task_id):
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.json
    update_data = {
        'name': data.get('name'),
        'priority': data.get('priority', 'medium'),
        'date': data.get('date'),
        'description': data.get('description'),
        'updated_at': datetime.now()
    }
    
    if tasks_collection is not None:
        result = tasks_collection.update_one(
            {'_id': ObjectId(task_id), 'user': session['user']},
            {'$set': update_data}
        )
        if result.matched_count > 0:
            return jsonify({'success': True, 'message': 'Task updated successfully'})
        else:
            return jsonify({'error': 'Task not found'}), 404
    else:
        return jsonify({'success': True, 'message': 'Task updated (dev mode)'})

# DELETE and UPDATE endpoints for Exams
@app.route('/api/exams/<exam_id>', methods=['DELETE'])
def delete_exam(exam_id):
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    if exams_collection is not None:
        result = exams_collection.delete_one({'_id': ObjectId(exam_id), 'user': session['user']})
        if result.deleted_count > 0:
            return jsonify({'success': True, 'message': 'Exam deleted successfully'})
        else:
            return jsonify({'error': 'Exam not found'}), 404
    else:
        return jsonify({'success': True, 'message': 'Exam deleted (dev mode)'})

@app.route('/api/exams/<exam_id>', methods=['PUT'])
def update_exam(exam_id):
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.json
    update_data = {
        'subject': data.get('subject'),
        'date': data.get('date'),
        'time': data.get('time'),
        'duration': data.get('duration'),
        'notes': data.get('notes'),
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
            return jsonify({'error': 'Exam not found'}), 404
    else:
        return jsonify({'success': True, 'message': 'Exam updated (dev mode)'})

# DELETE and UPDATE endpoints for Classes
@app.route('/api/classes/<class_id>', methods=['DELETE'])
def delete_class(class_id):
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    if classes_collection is not None:
        result = classes_collection.delete_one({'_id': ObjectId(class_id), 'user': session['user']})
        if result.deleted_count > 0:
            return jsonify({'success': True, 'message': 'Class deleted successfully'})
        else:
            return jsonify({'error': 'Class not found'}), 404
    else:
        return jsonify({'success': True, 'message': 'Class deleted (dev mode)'})

@app.route('/api/classes/<class_id>', methods=['PUT'])
def update_class(class_id):
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.json
    update_data = {
        'name': data.get('name'),
        'instructor': data.get('instructor'),
        'day': data.get('day'),
        'time': data.get('time'),
        'room': data.get('room'),
        'updated_at': datetime.now()
    }
    
    if classes_collection is not None:
        result = classes_collection.update_one(
            {'_id': ObjectId(class_id), 'user': session['user']},
            {'$set': update_data}
        )
        if result.matched_count > 0:
            return jsonify({'success': True, 'message': 'Class updated successfully'})
        else:
            return jsonify({'error': 'Class not found'}), 404
    else:
        return jsonify({'success': True, 'message': 'Class updated (dev mode)'})

# DELETE and UPDATE endpoints for Schedules
@app.route('/api/schedules/<schedule_id>', methods=['DELETE'])
def delete_schedule(schedule_id):
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    if schedules_collection is not None:
        result = schedules_collection.delete_one({'_id': ObjectId(schedule_id), 'user': session['user']})
        if result.deleted_count > 0:
            return jsonify({'success': True, 'message': 'Schedule deleted successfully'})
        else:
            return jsonify({'error': 'Schedule not found'}), 404
    else:
        return jsonify({'success': True, 'message': 'Schedule deleted (dev mode)'})

@app.route('/api/schedules/<schedule_id>', methods=['PUT'])
def update_schedule(schedule_id):
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.json
    update_data = {
        'title': data.get('title'),
        'date': data.get('date'),
        'time': data.get('time'),
        'duration': data.get('duration'),
        'description': data.get('description'),
        'updated_at': datetime.now()
    }
    
    if schedules_collection is not None:
        result = schedules_collection.update_one(
            {'_id': ObjectId(schedule_id), 'user': session['user']},
            {'$set': update_data}
        )
        if result.matched_count > 0:
            return jsonify({'success': True, 'message': 'Schedule updated successfully'})
        else:
            return jsonify({'error': 'Schedule not found'}), 404
    else:
        return jsonify({'success': True, 'message': 'Schedule updated (dev mode)'})

# DELETE and UPDATE endpoints for Vacations
@app.route('/api/vacations/<vacation_id>', methods=['DELETE'])
def delete_vacation(vacation_id):
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    if vacations_collection is not None:
        result = vacations_collection.delete_one({'_id': ObjectId(vacation_id), 'user': session['user']})
        if result.deleted_count > 0:
            return jsonify({'success': True, 'message': 'Vacation deleted successfully'})
        else:
            return jsonify({'error': 'Vacation not found'}), 404
    else:
        return jsonify({'success': True, 'message': 'Vacation deleted (dev mode)'})

@app.route('/api/vacations/<vacation_id>', methods=['PUT'])
def update_vacation(vacation_id):
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.json
    update_data = {
        'title': data.get('title'),
        'start_date': data.get('start_date'),
        'end_date': data.get('end_date'),
        'description': data.get('description'),
        'updated_at': datetime.now()
    }
    
    if vacations_collection is not None:
        result = vacations_collection.update_one(
            {'_id': ObjectId(vacation_id), 'user': session['user']},
            {'$set': update_data}
        )
        if result.matched_count > 0:
            return jsonify({'success': True, 'message': 'Vacation updated successfully'})
        else:
            return jsonify({'error': 'Vacation not found'}), 404
    else:
        return jsonify({'success': True, 'message': 'Vacation updated (dev mode)'})

@app.route('/logout')
def logout():
    session.pop('user', None)
    return redirect(url_for('login'))

# Start deadline checker when app starts
if users_collection is not None and app.config['MAIL_USERNAME']:
    print("Email notifications enabled - deadline checker will start in 10 seconds")
    threading.Timer(10, start_deadline_checker).start()
elif users_collection is not None:
    print(" Email notifications disabled - MAIL_USERNAME not configured in .env")
else:
    print("Email notifications disabled - no database connection")

if __name__ == '__main__':
    
    threading.Thread(target=start_deadline_checker, daemon=True).start()
    app.run(debug=True, port=5000)