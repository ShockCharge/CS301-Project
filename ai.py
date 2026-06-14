import os
import re
from datetime import datetime

import redis
from flask import Blueprint, jsonify, request, session

from common import (
    NZ_TZ,
    chain,
    classes_collection,
    exams_collection,
    get_ai_suggestion_sync,
    get_task_status,
    safe_ai_invoke,
    schedules_collection,
    tasks_collection,
)
from task import celery_app, get_ai_study_plan_task
from web_aware_ai import answer_with_web_awareness


ai_bp = Blueprint('ai', __name__)


redis_client = redis.from_url(
    os.environ.get('REDIS_URL', os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0'))
)


def sanitize(value):
    """Strip HTML tags and dangerous characters to prevent XSS."""
    if not value or not isinstance(value, str):
        return value
    value = re.sub(r'<[^>]+>', '', value)
    return value.strip()


def validate_date(date_str):
    """Return True if date is in YYYY-MM-DD format."""
    if not date_str:
        return True
    try:
        datetime.strptime(date_str, '%Y-%m-%d')
        return True
    except ValueError:
        return False


@ai_bp.route('/get_ai_suggestions')
def get_ai_suggestions():
    if 'user' not in session:
        return jsonify({"error": "User not logged in"}), 401

    try:
        user_email = session['user']
        today = datetime.now(NZ_TZ)
        today_str = today.strftime('%Y-%m-%d')
        priority_order = {'high': 0, 'medium': 1, 'low': 2}

        today_tasks = list(tasks_collection.find({
            "user": user_email,
            "date": today_str,
            "completed": {"$ne": True}
        })) if tasks_collection is not None else []
        today_tasks.sort(key=lambda x: priority_order.get(x.get('priority', 'medium').lower(), 1))

        today_exams = list(exams_collection.find({
            "user": user_email,
            "completed": {"$ne": True}
        }).limit(3)) if exams_collection is not None else []

        filtered_exams = []
        for exam in today_exams:
            exam_date_str = exam.get('date', '')
            try:
                exam_date = datetime.strptime(exam_date_str, '%Y-%m-%d')
                if exam_date.date() >= today.date():
                    filtered_exams.append(exam)
            except Exception:
                pass

        context = {
            "exams": [{"name": e.get("subject"), "date": e.get("date")} for e in filtered_exams],
            "tasks": [{"name": t.get("name"), "priority": t.get("priority", "medium")} for t in today_tasks]
        }

        ai_response = get_ai_suggestion_sync(context)
        return jsonify({"suggestions": ai_response})

    except Exception as e:
        print(f"Error in get_ai_suggestions: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)})


@ai_bp.route('/api/suggestions')
def api_suggestions_alias():
    """Compatibility route for frontend JavaScript that calls /api/suggestions."""
    return get_ai_suggestions()


@ai_bp.route('/api/ai-task-status/<task_id>')
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


@ai_bp.route('/api/daily-advice')
def daily_advice():
    if 'user' not in session:
        return jsonify({'error': 'Not logged in'})

    tasks_data = list(tasks_collection.find({'user': session['user']})) if tasks_collection is not None else []
    exams_data = list(exams_collection.find({'user': session['user']})) if exams_collection is not None else []
    context = f"Tasks: {tasks_data}\nExams: {exams_data}"
    advice = safe_ai_invoke({"question": "Give the student helpful study advice for today", "user_context": context})
    return jsonify({"advice": advice})


@ai_bp.route('/api/study_plan', methods=['POST'])
def api_study_plan():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    try:
        user_email = session['user']

        # Keep this route lightweight: the heavy AI work is handled by Celery.
        task = get_ai_study_plan_task.delay(user_email)

        return jsonify({
            'task_id': task.id,
            'status': 'processing',
            'message': 'Generating your personalized study plan... (this may take 15-40 seconds)'
        }), 202

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@ai_bp.route('/api/task/<task_id>')
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


@ai_bp.route('/api/chat', methods=['POST'])
def chat():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    data = request.json or {}
    user_message = sanitize(data.get('message', ''))

    if not user_message:
        return jsonify({'error': 'No message provided'}), 400

    today = datetime.now(NZ_TZ).strftime('%Y-%m-%d')

    user_tasks = list(tasks_collection.find({
        'user': session['user'],
        'completed': {'$ne': True},
        '$or': [{'date': {'$gte': today}}, {'date': None}, {'date': ''}, {'date': {'$exists': False}}]
    })) if tasks_collection is not None else []
    user_exams = list(exams_collection.find({'user': session['user'], 'date': {'$gte': today}, 'completed': {'$ne': True}})) if exams_collection is not None else []
    user_classes = list(classes_collection.find({'user': session['user']})) if classes_collection is not None else []
    user_schedules = list(schedules_collection.find({'user': session['user'], '$or': [{'date': {'$gte': today}}, {'date': None}, {'date': ''}, {'date': {'$exists': False}}]})) if schedules_collection is not None else []

    for collection_items in [user_tasks, user_exams, user_classes, user_schedules]:
        for item in collection_items:
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
