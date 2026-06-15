import re
from datetime import datetime

from bson import ObjectId
from flask import Blueprint, jsonify, request, session

from common import NZ_TZ, tasks_collection, users_collection


task_bp = Blueprint('task', __name__)


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


@task_bp.route('/api/tasks', methods=['GET', 'POST'])
def api_tasks():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    if request.method == 'POST':
        data = request.json or {}
        name = sanitize(data.get('name', ''))
        priority = sanitize(data.get('priority', 'medium'))
        date = sanitize(data.get('date', ''))

        if not name:
            return jsonify({'error': 'Task name is required.'}), 400
        if len(name) > 200:
            return jsonify({'error': 'Task name must be under 200 characters.'}), 400
        if priority not in ('high', 'medium', 'low'):
            return jsonify({'error': 'Invalid priority value.'}), 400
        if date and not validate_date(date):
            return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD.'}), 400

        # Get logged-in user's phone number if it exists.
        # IMPORTANT: task_item must be created even if the user has no phone number
        # or the user document cannot be found. Otherwise Add Task can fail with
        # "local variable 'task_item' referenced before assignment".
        phone_number = ''
        if users_collection is not None:
            user_data = users_collection.find_one({'email': session['user']})
            if user_data:
                phone_number = user_data.get('phone', '') or ''

        task_item = {
            'user': session['user'],
            'name': name,
            'priority': priority,
            'date': date or None,
            'time': sanitize(data.get('time', '23:59')) or '23:59',
            'phone_number': phone_number,
            'description': sanitize(data.get('description', '')),
            'completed': False,
            'created_at': datetime.now(NZ_TZ),
            'updated_at': datetime.now(NZ_TZ),
            'reminder_12h_sent': False,
            'reminder_6h_sent': False
        }

        if tasks_collection is not None:
            result = tasks_collection.insert_one(task_item)
            task_item['_id'] = str(result.inserted_id)
        else:
            task_item['_id'] = 'temp_id'
        return jsonify(task_item), 201

    if tasks_collection is not None:
        tasks = list(tasks_collection.find({'user': session['user']}))
        for task in tasks:
            task['_id'] = str(task['_id'])
    else:
        tasks = []
    return jsonify(tasks)


@task_bp.route('/api/tasks/<task_id>', methods=['PUT', 'PATCH', 'DELETE'])
def api_single_task(task_id):
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    if request.method == 'PUT':
        data = request.json or {}

        update_data = {
            'name': sanitize(data.get('name', '')),
            'priority': sanitize(data.get('priority', 'medium')),
            'date': sanitize(data.get('date', '')) or None,
            'time': sanitize(data.get('time', '23:59')) or '23:59',
            'description': sanitize(data.get('description', '')),
            'updated_at': datetime.now(NZ_TZ),
            'reminder_12h_sent': False,
            'reminder_6h_sent': False
        }

        if 'completed' in data:
            update_data['completed'] = bool(data.get('completed'))

        if tasks_collection is not None:
            result = tasks_collection.update_one(
                {'_id': ObjectId(task_id), 'user': session['user']},
                {'$set': update_data}
            )
            if result.matched_count > 0:
                return jsonify({'success': True, 'message': 'Task updated successfully'})
            return jsonify({'error': 'Task not found'}), 404
        return jsonify({'success': True, 'message': 'Task updated (dev mode)'})

    if request.method == 'PATCH':
        data = request.json or {}
        patch_data = {'updated_at': datetime.now(NZ_TZ)}
        unset_data = {}

        if 'completed' in data:
            is_completed = bool(data.get('completed'))
            patch_data['completed'] = is_completed

            if is_completed:
                patch_data['completed_at'] = datetime.now(NZ_TZ)
            else:
                unset_data['completed_at'] = ''

        update_query = {'$set': patch_data}
        if unset_data:
            update_query['$unset'] = unset_data

        if tasks_collection is not None:
            result = tasks_collection.update_one(
                {'_id': ObjectId(task_id), 'user': session['user']},
                update_query
            )
            if result.matched_count > 0:
                return jsonify({'success': True, 'message': 'Task updated'})
            return jsonify({'error': 'Task not found'}), 404
        return jsonify({'success': True, 'message': 'Task updated (dev mode)'})

    if tasks_collection is not None:
        result = tasks_collection.delete_one({'_id': ObjectId(task_id), 'user': session['user']})
        if result.deleted_count > 0:
            return jsonify({'success': True, 'message': 'Task deleted successfully'})
        return jsonify({'error': 'Task not found'})
    return jsonify({'success': True, 'message': 'Task deleted (dev mode)'})
