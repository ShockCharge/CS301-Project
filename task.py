from celery import Celery
import os
from datetime import datetime
from common import NZ_TZ, users_collection, tasks_collection, exams_collection, classes_collection, schedules_collection, chain, safe_ai_invoke, get_task_status
from web_aware_ai import answer_with_web_awareness
from notification import send_task_reminder
from celery.schedules import crontab

import traceback
from bson import ObjectId

# ========================= CELERY CONFIG =========================
celery_app = Celery(
    'study_planner',
    broker=os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0'),
    backend=os.environ.get('CELERY_RESULT_BACKEND', 'redis://localhost:6379/1')
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

celery_app.conf.beat_schedule = {
    'check-upcoming-tasks-every-5-minutes': {
        'task': 'task.check_upcoming_tasks',
        'schedule': 300.0,
    },
}

# ========================= UTILITY =========================
def convert_objectids(items):
    """Convert MongoDB ObjectIds to strings for JSON serialization"""
    for item in items:
        if '_id' in item:
            item['_id'] = str(item['_id'])
    return items


def database_unavailable_response():
    """Return a consistent Celery result when MongoDB did not connect."""
    return {
        "success": False,
        "error": "Database not connected. Please check MONGO_URI, your MongoDB Atlas network access, and dnspython installation."
    }


# ========================= TASKS =========================

@celery_app.task
def send_reminder_async(email, phone_number, task_name, due_datetime, reminder_type):
    """Send one reminder asynchronously through the shared notification helper."""
    return send_task_reminder(
        email=email,
        phone_number=phone_number,
        task_name=task_name,
        due_datetime=due_datetime,
        reminder_type=reminder_type,
    )

@celery_app.task
def get_ai_suggestions_task(user_email):
    try:
        if tasks_collection is None or exams_collection is None:
            return database_unavailable_response()

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

        suggestions = safe_ai_invoke({
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
        if tasks_collection is None or exams_collection is None or classes_collection is None:
            return database_unavailable_response()

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

        plan = safe_ai_invoke({
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
        if tasks_collection is None or exams_collection is None or classes_collection is None or schedules_collection is None:
            return database_unavailable_response()

        today = datetime.now(NZ_TZ).strftime('%Y-%m-%d')

        user_tasks = list(tasks_collection.find({
            'user': user_email,
            'completed': {'$ne': True},
            '$or': [{'date': {'$gte': today}}, {'date': None}, {'date': ''}, {'date': {'$exists': False}}]
        }))
        user_exams = list(exams_collection.find({
            'user': user_email, 'date': {'$gte': today}, 'completed': {'$ne': True}
        }))
        user_classes = list(classes_collection.find({'user': user_email}))
        user_schedules = list(schedules_collection.find({
            'user': user_email,
            '$or': [{'date': {'$gte': today}}, {'date': None}, {'date': ''}, {'date': {'$exists': False}}]
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

        ai_result = answer_with_web_awareness(chain, user_message, context)
        return {
            "success": True,
            "response": ai_result.get("response", ""),
            "web_used": ai_result.get("web_used", False),
            "sources": ai_result.get("sources", []),
            "web_error": ai_result.get("web_error")
        }

    except Exception as e:
        traceback.print_exc()
        return {"success": False, "error": str(e)}
    
# ================= AUTOMATIC TASK REMINDER CHECKER =================
@celery_app.task
def check_upcoming_tasks():
    """Check unfinished tasks and send 12-hour and 6-hour reminders.

    This task must be run by Celery Beat every few minutes. It sends reminders
    through whatever contact details are available. The user's email is stored
    in the task's user field, and phone_number is copied from the profile when
    the task is created.
    """

    try:
        if tasks_collection is None:
            print("Reminder checker skipped: tasks_collection is not connected.")
            return {"success": False, "error": "Database not connected"}

        now = datetime.now(NZ_TZ)
        tasks = list(tasks_collection.find({"completed": {"$ne": True}}))
        checked = 0
        sent = 0

        for task in tasks:
            try:
                checked += 1
                task_date = task.get("date")
                task_time = task.get("time") or "23:59"

                if not task_date:
                    continue

                try:
                    task_datetime = datetime.strptime(
                        f"{task_date} {task_time}",
                        "%Y-%m-%d %H:%M"
                    )
                except ValueError:
                    print(f"Reminder skipped: invalid task date/time for {task.get('_id')}: {task_date} {task_time}")
                    continue

                task_datetime = task_datetime.replace(tzinfo=NZ_TZ)
                remaining_hours = (task_datetime - now).total_seconds() / 3600

                if remaining_hours <= 0:
                    continue

                task_name = task.get("name") or task.get("title") or "Unnamed Task"
                email = task.get("user") or task.get("email") or ""
                phone_number = task.get("phone_number") or ""

                if not phone_number and users_collection is not None and email:
                    user_data = users_collection.find_one({"email": email})
                    if user_data:
                        phone_number = user_data.get("phone", "")

                if not email and not phone_number:
                    print(f"Reminder skipped: no email or phone number for task {task.get('_id')}")
                    continue

                due_text = task_datetime.strftime("%Y-%m-%d %I:%M %p")

                if 0 < remaining_hours <= 12 and not task.get("reminder_12h_sent", False):
                    success = send_task_reminder(
                        email=email,
                        phone_number=phone_number,
                        task_name=task_name,
                        due_datetime=due_text,
                        reminder_type="Task is due within 12 hours",
                    )

                    if success:
                        sent += 1
                        tasks_collection.update_one(
                            {"_id": task["_id"]},
                            {"$set": {"reminder_12h_sent": True}}
                        )
                        print(f"12-hour reminder sent: {task_name}")

                if 0 < remaining_hours <= 6 and not task.get("reminder_6h_sent", False):
                    success = send_task_reminder(
                        email=email,
                        phone_number=phone_number,
                        task_name=task_name,
                        due_datetime=due_text,
                        reminder_type="Task is due within 6 hours",
                    )

                    if success:
                        sent += 1
                        tasks_collection.update_one(
                            {"_id": task["_id"]},
                            {"$set": {"reminder_6h_sent": True}}
                        )
                        print(f"6-hour reminder sent: {task_name}")

            except Exception as inner_error:
                print(f"Task processing error: {inner_error}")

        return {"success": True, "checked": checked, "sent": sent}

    except Exception as error:
        print(f"Reminder checker failed: {error}")
        return {"success": False, "error": str(error)}
