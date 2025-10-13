import os
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from pymongo import MongoClient
from dotenv import load_dotenv
from datetime import datetime
from bson import ObjectId

app = Flask(__name__)
app.secret_key = 'supersecretkey123'

load_dotenv()

try:
    MONGO_USER = os.environ.get("MONGO_USER", "")
    MONGO_PASS = os.environ.get("MONGO_PASS", "")
    
    if MONGO_USER and MONGO_PASS:
        conn_str = f"mongodb+srv://{MONGO_USER}:{MONGO_PASS}@studyplanner.y4rlgjy.mongodb.net/study_planner_db?retryWrites=true&w=majority"
        client = MongoClient(conn_str, serverSelectionTimeoutMS=5000)
        # Test connection
        client.server_info()
        db = client["study_planner_db"]
        users_collection = db["users"]
        schedules_collection = db["schedules"]
        tasks_collection = db["tasks"]
        
        # Initialize test user if database is available
        if users_collection.find_one({'email': 'test@example.com'}) is None:
            users_collection.insert_one({'email': 'test@example.com', 'password': 'password'})
        
        print("MongoDB Atlas connected successfully!")
    else:
        # No credentials provided - run in development mode
        print("No MongoDB credentials found. Running in development mode with sample data.")
        users_collection = None
        schedules_collection = None
        tasks_collection = None
except Exception as e:
    print(f"MongoDB connection failed: {e}")
    print("Running in development mode with sample data.")
    # Continue without database for development
    users_collection = None
    schedules_collection = None
    tasks_collection = None

@app.route('/', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']
        
        if users_collection is not None:
            user = users_collection.find_one({'email': email, 'password': password})
        else:
            # Development mode: allow test login
            user = {'email': email} if email == 'test@example.com' and password == 'password' else None
        
        if user:
            session['user'] = email
            return redirect(url_for('dashboard'))
        else:
            return render_template('login.html', error='Invalid email or password')
    return render_template('login.html')

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']
        confirm_password = request.form['confirm_password']
        
        if password != confirm_password:
            return render_template('signup.html', error='Passwords do not match')
        
        if users_collection is not None:
            if users_collection.find_one({'email': email}):
                return render_template('signup.html', error='Email already registered')
            users_collection.insert_one({'email': email, 'password': password})
        
        return redirect(url_for('login'))
    return render_template('signup.html')

@app.route('/dashboard')
def dashboard():
    if 'user' not in session:
        return redirect(url_for('login'))
    
    # Get user's tasks
    if tasks_collection is not None:
        tasks = list(tasks_collection.find({'user': session['user']}).limit(5))
        for task in tasks:
            task['_id'] = str(task['_id'])
    else:
        # Sample data for development
        tasks = [
            {'name': 'Math Homework', 'priority': 'high'},
            {'name': 'Read Chapter 5', 'priority': 'medium'},
            {'name': 'Physics Quiz Prep', 'priority': 'low'}
        ]
    
    # Calculate progress (sample calculation)
    progress = 75
    
    return render_template('dashboard.html', progress=progress, tasks=tasks)

@app.route('/schedule')
def schedule():
    if 'user' not in session:
        return redirect(url_for('login'))
    
    # Get user's schedules
    if schedules_collection is not None:
        schedules = list(schedules_collection.find({'user': session['user']}))
        for schedule in schedules:
            schedule['_id'] = str(schedule['_id'])
    else:
        schedules = []
    
    return render_template('schedule.html', schedules=schedules)

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
            'created_at': datetime.now()
        }
        
        if schedules_collection is not None:
            result = schedules_collection.insert_one(schedule_item)
            schedule_item['_id'] = str(result.inserted_id)
        else:
            schedule_item['_id'] = 'temp_id'
        
        return jsonify(schedule_item), 201
    
    else:  # GET
        if schedules_collection is not None:
            schedules = list(schedules_collection.find({'user': session['user']}))
            for schedule in schedules:
                schedule['_id'] = str(schedule['_id'])
        else:
            schedules = []
        
        return jsonify(schedules)

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
            'completed': False,
            'created_at': datetime.now()
        }
        
        if tasks_collection is not None:
            result = tasks_collection.insert_one(task_item)
            task_item['_id'] = str(result.inserted_id)
        else:
            task_item['_id'] = 'temp_id'
        
        return jsonify(task_item), 201
    
    else:  # GET
        if tasks_collection is not None:
            tasks = list(tasks_collection.find({'user': session['user']}))
            for task in tasks:
                task['_id'] = str(task['_id'])
        else:
            tasks = []
        
        return jsonify(tasks)

@app.route('/logout')
def logout():
    session.pop('user', None)
    return redirect(url_for('login'))

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)

