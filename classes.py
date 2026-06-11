import re
from datetime import datetime

from bson import ObjectId
from flask import Blueprint, jsonify, request, session

from common import classes_collection


class_bp = Blueprint('class', __name__)


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


@class_bp.route('/api/classes', methods=['GET', 'POST'])
def api_classes():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    if request.method == 'POST':
        data = request.json or {}
        name = sanitize(data.get('name', ''))
        date = sanitize(data.get('date', ''))

        if not name:
            return jsonify({'error': 'Class name is required.'}), 400
        if len(name) > 200:
            return jsonify({'error': 'Class name must be under 200 characters.'}), 400
        if date and not validate_date(date):
            return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD.'}), 400

        class_item = {
            'user': session['user'],
            'name': name,
            'instructor': sanitize(data.get('instructor', '')),
            'day': sanitize(data.get('day', '')),
            'date': date or None,
            'time': sanitize(data.get('time', '')),
            'duration': data.get('duration'),
            'room': sanitize(data.get('room', '')),
            'repeat': sanitize(data.get('repeat', 'never')) or 'never',
            'repeat_until': sanitize(data.get('repeat_until', '')) or None,
            'completed': False,
            'created_at': datetime.now()
        }
        if classes_collection is not None:
            result = classes_collection.insert_one(class_item)
            class_item['_id'] = str(result.inserted_id)
        else:
            class_item['_id'] = 'temp_id'
        return jsonify(class_item), 201

    if classes_collection is not None:
        classes = list(classes_collection.find({'user': session['user']}))
        for class_item in classes:
            class_item['_id'] = str(class_item['_id'])
    else:
        classes = []
    return jsonify(classes)


@class_bp.route('/api/classes/<class_id>', methods=['PUT', 'PATCH', 'DELETE'])
def api_single_class(class_id):
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    if request.method == 'PATCH':
        data = request.json or {}
        patch_data = {'updated_at': datetime.now()}
        if 'completed' in data:
            patch_data['completed'] = bool(data['completed'])
        if classes_collection is not None:
            result = classes_collection.update_one(
                {'_id': ObjectId(class_id), 'user': session['user']},
                {'$set': patch_data}
            )
            if result.matched_count > 0:
                return jsonify({'success': True})
            return jsonify({'error': 'Class not found'}), 404
        return jsonify({'success': True})

    if request.method == 'PUT':
        data = request.json or {}
        update_data = {
            'name': sanitize(data.get('name', '')),
            'instructor': sanitize(data.get('instructor', '')),
            'day': sanitize(data.get('day', '')),
            'date': sanitize(data.get('date', '')),
            'time': sanitize(data.get('time', '')),
            'duration': data.get('duration'),
            'room': sanitize(data.get('room', '')),
            'repeat': sanitize(data.get('repeat', 'never')) or 'never',
            'repeat_until': sanitize(data.get('repeat_until', '')) or None,
            'completed': bool(data.get('completed', False)),
            'updated_at': datetime.now()
        }
        if classes_collection is not None:
            result = classes_collection.update_one(
                {'_id': ObjectId(class_id), 'user': session['user']},
                {'$set': update_data}
            )
            if result.matched_count > 0:
                return jsonify({'success': True, 'message': 'Class updated successfully'})
            return jsonify({'error': 'Class not found'})
        return jsonify({'success': True, 'message': 'Class updated (dev mode)'})

    if classes_collection is not None:
        result = classes_collection.delete_one({'_id': ObjectId(class_id), 'user': session['user']})
        if result.deleted_count > 0:
            return jsonify({'success': True, 'message': 'Class deleted successfully'})
        return jsonify({'error': 'Class not found'})
    return jsonify({'success': True, 'message': 'Class deleted (dev mode)'})
