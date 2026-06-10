import re
from datetime import datetime

from bson import ObjectId
from flask import Blueprint, jsonify, request, session

from common import NZ_TZ, schedules_collection


schedule_bp = Blueprint('schedule', __name__)


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


@schedule_bp.route('/api/schedules', methods=['GET', 'POST'])
def api_schedules():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    if request.method == 'POST':
        data = request.json or {}
        title = sanitize(data.get('title', ''))
        date = sanitize(data.get('date', ''))

        if not title:
            return jsonify({'error': 'Schedule title is required.'}), 400
        if len(title) > 200:
            return jsonify({'error': 'Title must be under 200 characters.'}), 400
        if date and not validate_date(date):
            return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD.'}), 400

        allowed_repeat = {'never', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly', 'custom'}
        repeat = sanitize(data.get('repeat', 'never')) or 'never'
        if repeat not in allowed_repeat:
            repeat = 'never'

        repeat_until = sanitize(data.get('repeat_until', ''))
        if repeat_until and not validate_date(repeat_until):
            return jsonify({'error': 'Invalid repeat-until date format. Use YYYY-MM-DD.'}), 400

        repeat_interval = data.get('repeat_interval') or 1
        try:
            repeat_interval = max(1, min(365, int(repeat_interval)))
        except (TypeError, ValueError):
            repeat_interval = 1

        repeat_unit = sanitize(data.get('repeat_unit', 'weeks')) or 'weeks'
        if repeat_unit not in {'days', 'weeks', 'months', 'years'}:
            repeat_unit = 'weeks'

        schedule_item = {
            'user': session['user'],
            'title': title,
            'date': date or None,
            'time': sanitize(data.get('time', '')),
            'duration': data.get('duration'),
            'description': sanitize(data.get('description', '')),
            'repeat': repeat,
            'repeat_until': repeat_until or None,
            'repeat_interval': repeat_interval,
            'repeat_unit': repeat_unit,
            'completed': False,
            'created_at': datetime.now()
        }
        if schedules_collection is not None:
            result = schedules_collection.insert_one(schedule_item)
            schedule_item['_id'] = str(result.inserted_id)
        else:
            schedule_item['_id'] = 'temp_id'
        return jsonify(schedule_item), 201

    if schedules_collection is not None:
        status = request.args.get('status', 'all')
        schedules = list(schedules_collection.find({'user': session['user']}))
        filtered_schedules = []
        for schedule in schedules:
            schedule['_id'] = str(schedule['_id'])
            schedule_status = get_task_status(schedule.get('date'))
            schedule['status'] = schedule_status
            if status == 'current' and schedule_status == 'outdated':
                continue
            if status == 'outdated' and schedule_status != 'outdated':
                continue
            filtered_schedules.append(schedule)
        schedules = filtered_schedules
    else:
        schedules = []
    return jsonify(schedules)


@schedule_bp.route('/api/schedules/<schedule_id>', methods=['PUT', 'DELETE'])
def api_single_schedule(schedule_id):
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    if request.method == 'PUT':
        data = request.json or {}
        allowed_repeat = {'never', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly', 'custom'}
        repeat = sanitize(data.get('repeat', 'never')) or 'never'
        if repeat not in allowed_repeat:
            repeat = 'never'

        repeat_until = sanitize(data.get('repeat_until', ''))
        if repeat_until and not validate_date(repeat_until):
            return jsonify({'error': 'Invalid repeat-until date format. Use YYYY-MM-DD.'}), 400

        repeat_interval = data.get('repeat_interval') or 1
        try:
            repeat_interval = max(1, min(365, int(repeat_interval)))
        except (TypeError, ValueError):
            repeat_interval = 1

        repeat_unit = sanitize(data.get('repeat_unit', 'weeks')) or 'weeks'
        if repeat_unit not in {'days', 'weeks', 'months', 'years'}:
            repeat_unit = 'weeks'

        update_data = {
            'title': sanitize(data.get('title', '')),
            'date': sanitize(data.get('date', '')),
            'time': sanitize(data.get('time', '')),
            'duration': data.get('duration'),
            'description': sanitize(data.get('description', '')),
            'repeat': repeat,
            'repeat_until': repeat_until or None,
            'repeat_interval': repeat_interval,
            'repeat_unit': repeat_unit,
            'updated_at': datetime.now()
        }
        if schedules_collection is not None:
            result = schedules_collection.update_one(
                {'_id': ObjectId(schedule_id), 'user': session['user']},
                {'$set': update_data}
            )
            if result.matched_count > 0:
                return jsonify({'success': True, 'message': 'Schedule updated successfully'})
            return jsonify({'error': 'Schedule not found'})
        return jsonify({'success': True, 'message': 'Schedule updated (dev mode)'})

    if schedules_collection is not None:
        result = schedules_collection.delete_one({'_id': ObjectId(schedule_id), 'user': session['user']})
        if result.deleted_count > 0:
            return jsonify({'success': True, 'message': 'Schedule deleted successfully'})
        return jsonify({'error': 'Schedule not found'})
    return jsonify({'success': True, 'message': 'Schedule deleted (dev mode)'})
