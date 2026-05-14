from celery import Celery
import os
from datetime import datetime
from common import NZ_TZ, tasks_collection, exams_collection, classes_collection, schedules_collection, chain, get_task_status
import traceback
from bson import ObjectId

# ========================= CELERY CONFIG =========================
celery_app = Celery(
    'study_planner',
    broker=os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0'),
    backend=os.environ.get('CELERY_RESULT_BACKEND', 'redis://localhost:6379/0')
)

celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='Pacific/Auckland',
    enable_utc=False,
    broker_connection_retry_on_startup=True,
    task_track_started=True,
    task_time_limit=300,        # 5 minutes max
    task_soft_time_limit=240,
)


# ========================= UTILITY =========================
def convert_objectids(items):
    """Convert MongoDB ObjectIds to strings for JSON serialization"""
    for item in items:
        if '_id' in item:
            item['_id'] = str(item['_id'])
    return items


# ========================= TASKS =========================

@celery_app.task
def send_reminder_async(email, task_name):
    from notification import send_task_reminder
    send_task_reminder(email, task_name)


@celery_app.task
def get_ai_suggestions_task(user_email):
    try:
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

        context = {
            "today": today,
            "tasks": convert_objectids(tasks),
            "exams": convert_objectids(exams)
        }

        suggestions = chain.invoke({
            "question": "Suggest new study tasks the student should add to improve their productivity.",
            "user_context": context
        })

        return {"success": True, "suggestions": suggestions}
    except Exception as e:
        traceback.print_exc()
        return {"success": False, "error": str(e)}


# ==================== MAIN STUDY PLAN TASK ====================
@celery_app.task(bind=True, max_retries=2)
def get_ai_study_plan_task(self, user_email: str):
    """Rich study plan generation task"""
    try:
        today_str = datetime.now(NZ_TZ).strftime('%Y-%m-%d')

        # Fetch data
        upcoming_tasks = list(tasks_collection.find({'user': user_email, 'completed': {'$ne': True}}))
        upcoming_exams = list(exams_collection.find({'user': user_email, 'completed': {'$ne': True}}))
        upcoming_classes = list(classes_collection.find({'user': user_email}))

        # Filter outdated
        upcoming_tasks = [t for t in upcoming_tasks if get_task_status(t.get('date')) != 'outdated']
        upcoming_exams = [e for e in upcoming_exams if get_task_status(e.get('date')) != 'outdated']
        upcoming_classes = [c for c in upcoming_classes if get_task_status(c.get('date')) != 'outdated']

        # Find nearest deadline
        all_dates = []
        for items in (upcoming_tasks, upcoming_exams, upcoming_classes):
            for item in items:
                if item.get('date'):
                    all_dates.append(item['date'])

        nearest_date = min(all_dates) if all_dates else None

        # Build question
        if nearest_date:
            question = (
                f"Today is {today_str}. The student's nearest upcoming deadline is on {nearest_date}. "
                f"Create a focused, day-by-day study plan ONLY from today ({today_str}) up to and including {nearest_date}. "
                f"Do NOT plan any days beyond {nearest_date}. "
                f"After the plan section, add a separate section titled 'Coming Up Next' "
                f"that briefly lists all remaining tasks, exams, and classes due AFTER {nearest_date}, "
                f"sorted by their due date. Keep the tone clear, practical, and motivating."
            )
        else:
            question = (
                f"Today is {today_str}. The student has no immediate deadlines. "
                f"Create a general 7-day study plan to help them stay productive. "
                f"Keep it clear and motivating."
            )

        user_context = {
            "today": today_str,
            "nearest_deadline": nearest_date,
            "upcoming_tasks": convert_objectids(upcoming_tasks),
            "upcoming_exams": convert_objectids(upcoming_exams),
            "upcoming_classes": convert_objectids(upcoming_classes)
        }

        plan = chain.invoke({
            "question": question,
            "user_context": user_context
        })

        return {
            "success": True,
            "plan": plan,
            "generated_at": today_str,
            "nearest_deadline": nearest_date
        }

    except Exception as exc:
        traceback.print_exc()
        raise self.retry(exc=exc, countdown=10)


# ==================== CHATBOT TASK ====================
@celery_app.task
def get_chatbot_response(user_email: str, user_message: str):
    try:
        today = datetime.now(NZ_TZ).strftime('%Y-%m-%d')

        user_tasks = list(tasks_collection.find({
            'user': user_email, 'date': {'$gte': today}, 'completed': {'$ne': True}
        }))
        user_exams = list(exams_collection.find({
            'user': user_email, 'date': {'$gte': today}, 'completed': {'$ne': True}
        }))
        user_classes = list(classes_collection.find({'user': user_email}))
        user_schedules = list(schedules_collection.find({
            'user': user_email, 'date': {'$gte': today}
        }))

        convert_objectids(user_tasks)
        convert_objectids(user_exams)
        convert_objectids(user_classes)
        convert_objectids(user_schedules)

        context = {
            "today": today,
            "tasks": user_tasks,
            "exams": user_exams,
            "classes": user_classes,
            "schedules": user_schedules
        }

        response = chain.invoke({
            "question": user_message,
            "user_context": context
        })

        return {"success": True, "response": response}

    except Exception as e:
        traceback.print_exc()
        return {"success": False, "error": str(e)}