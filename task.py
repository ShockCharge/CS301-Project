from celery import Celery
from datetime import datetime
from celery_app import celery_app
from common import NZ_TZ, tasks_collection, exams_collection, chain
import os
from celery_app import celery
from notification import send_task_reminder

# Initialize Celery app
celery_app = Celery(
    'study_planner',
    broker=os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0'),
    backend=os.environ.get('CELERY_RESULT_BACKEND', 'redis://localhost:6379/0')
)

@celery.task
def send_reminder_async(email, task_name):
    send_task_reminder(email, task_name)

@celery_app.task
def get_ai_suggestions_task(user_email):
    today = datetime.now(NZ_TZ).strftime('%Y-%m-%d')
    tasks = list(tasks_collection.find({
        'user': user_email,
        'date': {'$gte': today},
        'completed': {'$ne': True}
    }))
    exams = list(exams_collection.find({
        'user': user_email,
        'date': {'$gte': today},
        'completed': {'$ne': True}
    }))
    context = f"""
    Today's date: {today}
    Tasks: {tasks}
    Exams: {exams}
    """
    suggestions = chain.invoke({
        "question": "Suggest new study tasks the student should add",
        "user_context": context
    })
    return {"suggestions": suggestions}

@celery_app.task
def get_ai_study_plan_task(user_email):
    today = datetime.now(NZ_TZ).strftime('%Y-%m-%d')
    tasks = list(tasks_collection.find({
        'user': user_email,
        'date': {'$gte': today},
        'completed': {'$ne': True}
    }))
    exams = list(exams_collection.find({
        'user': user_email,
        'date': {'$gte': today},
        'completed': {'$ne': True}
    }))
    context = f"""
    Today's date: {today}
    Tasks: {tasks}
    Exams: {exams}
    """.strip()
    plan = chain.invoke({
        "question": "Create a detailed weekly study schedule",
        "user_context": context
    })
    return {"plan": plan}

@celery_app.task
def get_chatbot_response(user_email, user_message):
    from datetime import datetime
    from common import NZ_TZ, tasks_collection, exams_collection, classes_collection, schedules_collection, chain

    today = datetime.now(NZ_TZ).strftime('%Y-%m-%d')

    user_tasks = list(tasks_collection.find({
        'user': user_email,
        'date': {'$gte': today},
        'completed': {'$ne': True}
    }))

    user_exams = list(exams_collection.find({
        'user': user_email,
        'date': {'$gte': today},
        'completed': {'$ne': True}
    }))

    user_classes = list(classes_collection.find({'user': user_email}))
    user_schedules = list(schedules_collection.find({
        'user': user_email,
        'date': {'$gte': today}
    }))

    # Convert ObjectId to string (IMPORTANT)
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
    """

    response = chain.invoke({
        "question": user_message,
        "user_context": context
    })

    return response