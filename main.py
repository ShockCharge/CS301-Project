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
        client.server_info()
        db = client["study_planner_db"]
        users_collection = db["users"]
        schedules_collection = db["schedules"]
        tasks_collection = db["tasks"]
        exams_collection = db["exams"]
        classes_collection = db["classes"]
        vacations_collection = db["vacations"]
        
        if users_collection.find_one({'email': 'test@example.com'}) is None:
            users_collection.insert_one({'email': 'test@example.com', 'password': 'password'})
        
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
    
    # Get user's tasks
    if tasks_collection is not None:
        tasks = list(tasks_collection.find({'user': session['user']}).limit(5))
        for task in tasks:
            task['_id'] = str(task['_id'])
        
        # Calculate progress from ALL activities
        total_items = 0
        completed_items = 0
        
        # Count tasks
        all_tasks = list(tasks_collection.find({'user': session['user']}))
        total_items += len(all_tasks)
        completed_items += len([t for t in all_tasks if t.get('completed', False)])
        
        # Count exams
        all_exams = list(exams_collection.find({'user': session['user']}))
        total_items += len(all_exams)
        completed_items += len([e for e in all_exams if e.get('completed', False)])
        
        # Count classes
        all_classes = list(classes_collection.find({'user': session['user']}))
        total_items += len(all_classes)
        completed_items += len([c for c in all_classes if c.get('completed', False)])
        
        # Count schedules
        all_schedules = list(schedules_collection.find({'user': session['user']}))
        total_items += len(all_schedules)
        completed_items += len([s for s in all_schedules if s.get('completed', False)])
        
        # Calculate percentage
        if total_items > 0:
            progress = int((completed_items / total_items) * 100)
        else:
            progress = 0
    else:
        tasks = []
        progress = 0
    
    # Get user's exams
    if exams_collection is not None:
        exams = list(exams_collection.find({'user': session['user']}).limit(3))
        for exam in exams:
            exam['_id'] = str(exam['_id'])
    else:
        exams = []
    
    return render_template('dashboard.html', progress=progress, tasks=tasks, exams=exams)



@app.route('/schedule')
def schedule():
    if 'user' not in session:
        return redirect(url_for('login'))
    
    if schedules_collection is not None:
        schedules = list(schedules_collection.find({'user': session['user']}))
        for schedule in schedules:
            schedule['_id'] = str(schedule['_id'])
    else:
        schedules = []
    
    return render_template('schedule.html', schedules=schedules)

@app.route('/tasks')
def tasks():
    if 'user' not in session:
        return redirect(url_for('login'))
    return render_template('tasks.html')

@app.route('/exams')
def exams():
    if 'user' not in session:
        return redirect(url_for('login'))
    return render_template('exams.html')

@app.route('/classes')
def classes():
    if 'user' not in session:
        return redirect(url_for('login'))
    return render_template('classes.html')

@app.route('/vacations')
def vacations():
    if 'user' not in session:
        return redirect(url_for('login'))
    return render_template('vacations.html')

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
    if users_collection is not None:
        user_data = users_collection.find_one({'email': session['user']})
        if user_data:
            user_data['_id'] = str(user_data['_id'])
    
    return render_template('profile.html', user=user_data)


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
    
    else:
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
        from bson import ObjectId
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

@app.route('/logout')
def logout():
    session.pop('user', None)
    return redirect(url_for('login'))

if __name__ == '__main__':
    app.run(debug=True, port=5000)

