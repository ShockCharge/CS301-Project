import re
from datetime import datetime

from bson import ObjectId
from flask import Blueprint, jsonify, request, session

from common import NZ_TZ, vacations_collection


vacation_bp = Blueprint('vacation', __name__)


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


@vacation_bp.route('/api/vacations', methods=['GET', 'POST'])
def api_vacations():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    if request.method == 'POST':
        data = request.json or {}
        title = sanitize(data.get('title', ''))
        start_date = sanitize(data.get('start_date', ''))
        end_date = sanitize(data.get('end_date', ''))

        if not title:
            return jsonify({'error': 'Vacation title is required.'}), 400
        if start_date and not validate_date(start_date):
            return jsonify({'error': 'Invalid start date format. Use YYYY-MM-DD.'}), 400
        if end_date and not validate_date(end_date):
            return jsonify({'error': 'Invalid end date format. Use YYYY-MM-DD.'}), 400

        vacation_item = {
            'user': session['user'],
            'title': title,
            'start_date': start_date or None,
            'end_date': end_date or None,
            'description': sanitize(data.get('description', '')),
            'reflection': sanitize(data.get('reflection', '')),
            'status': sanitize(data.get('status', 'planned')) or 'planned',
            'completed': (sanitize(data.get('status', 'planned')) == 'completed') or bool(data.get('completed', False)),
            'created_at': datetime.now(NZ_TZ)
        }
        if vacations_collection is not None:
            result = vacations_collection.insert_one(vacation_item)
            vacation_item['_id'] = str(result.inserted_id)
        else:
            vacation_item['_id'] = 'temp_id'
        return jsonify(vacation_item), 201

    if vacations_collection is not None:
        vacations = list(vacations_collection.find({'user': session['user']}))
        for vacation in vacations:
            vacation['_id'] = str(vacation['_id'])
    else:
        vacations = []
    return jsonify(vacations)


@vacation_bp.route('/api/vacations/<vacation_id>', methods=['PUT', 'PATCH', 'DELETE'])
def api_single_vacation(vacation_id):
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    if request.method == 'PATCH':
        data = request.json or {}
        patch_data = {'updated_at': datetime.now()}
        if 'completed' in data:
            patch_data['completed'] = bool(data['completed'])
            patch_data['status'] = 'completed' if bool(data['completed']) else 'planned'
        if 'status' in data:
            patch_data['status'] = sanitize(data.get('status', 'planned')) or 'planned'
            patch_data['completed'] = patch_data['status'] == 'completed'
        if 'reflection' in data:
            patch_data['reflection'] = sanitize(data.get('reflection', ''))
        if vacations_collection is not None:
            result = vacations_collection.update_one(
                {'_id': ObjectId(vacation_id), 'user': session['user']},
                {'$set': patch_data}
            )
            if result.matched_count > 0:
                return jsonify({'success': True})
            return jsonify({'error': 'Vacation not found'}), 404
        return jsonify({'success': True})

    if request.method == 'PUT':
        data = request.json or {}
        update_data = {
            'title': sanitize(data.get('title', '')),
            'start_date': sanitize(data.get('start_date', '')),
            'end_date': sanitize(data.get('end_date', '')),
            'description': sanitize(data.get('description', '')),
            'reflection': sanitize(data.get('reflection', '')),
            'status': sanitize(data.get('status', 'planned')) or 'planned',
            'completed': (sanitize(data.get('status', 'planned')) == 'completed') or bool(data.get('completed', False)),
            'updated_at': datetime.now()
        }
        if vacations_collection is not None:
            result = vacations_collection.update_one(
                {'_id': ObjectId(vacation_id), 'user': session['user']},
                {'$set': update_data}
            )
            if result.matched_count > 0:
                return jsonify({'success': True, 'message': 'Vacation updated successfully'})
            return jsonify({'error': 'Vacation not found'})
        return jsonify({'success': True, 'message': 'Vacation updated (dev mode)'})

    if vacations_collection is not None:
        result = vacations_collection.delete_one({'_id': ObjectId(vacation_id), 'user': session['user']})
        if result.deleted_count > 0:
            return jsonify({'success': True, 'message': 'Vacation deleted successfully'})
        return jsonify({'error': 'Vacation not found'})
    return jsonify({'success': True, 'message': 'Vacation deleted (dev mode)'})
