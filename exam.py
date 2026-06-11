import re
from datetime import datetime

from bson import ObjectId
from flask import Blueprint, jsonify, request, session

from common import exams_collection


exam_bp = Blueprint('exam', __name__)


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


@exam_bp.route('/api/exams', methods=['GET', 'POST'])
def api_exams():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    if request.method == 'POST':
        data = request.json or {}
        subject = sanitize(data.get('subject', ''))
        date = sanitize(data.get('date', ''))

        if not subject:
            return jsonify({'error': 'Subject name is required.'}), 400
        if len(subject) > 200:
            return jsonify({'error': 'Subject name must be under 200 characters.'}), 400
        if date and not validate_date(date):
            return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD.'}), 400

        exam_item = {
            'user': session['user'],
            'subject': subject,
            'date': date or None,
            'time': sanitize(data.get('time', '')),
            'duration': data.get('duration'),
            'notes': sanitize(data.get('notes', '')),
            'reflection': sanitize(data.get('reflection', '')),
            'completed': bool(data.get('completed', False)),
            'created_at': datetime.now()
        }
        if exams_collection is not None:
            result = exams_collection.insert_one(exam_item)
            exam_item['_id'] = str(result.inserted_id)
        else:
            exam_item['_id'] = 'temp_id'
        return jsonify(exam_item), 201

    if exams_collection is not None:
        exams = list(exams_collection.find({'user': session['user']}))
        for exam in exams:
            exam['_id'] = str(exam['_id'])
    else:
        exams = []
    return jsonify(exams)


@exam_bp.route('/api/exams/<exam_id>', methods=['PUT', 'PATCH', 'DELETE'])
def api_single_exam(exam_id):
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    if request.method == 'PATCH':
        # Lightweight update — only update the fields that are sent.
        data = request.json or {}
        patch_data = {'updated_at': datetime.now()}
        if 'completed' in data:
            patch_data['completed'] = bool(data['completed'])
        if 'reflection' in data:
            patch_data['reflection'] = sanitize(data.get('reflection', ''))
        if exams_collection is not None:
            result = exams_collection.update_one(
                {'_id': ObjectId(exam_id), 'user': session['user']},
                {'$set': patch_data}
            )
            if result.matched_count > 0:
                return jsonify({'success': True})
            return jsonify({'error': 'Exam not found'}), 404
        return jsonify({'success': True})

    if request.method == 'PUT':
        data = request.json or {}
        update_data = {
            'subject': sanitize(data.get('subject', '')),
            'date': sanitize(data.get('date', '')),
            'time': sanitize(data.get('time', '')),
            'duration': data.get('duration'),
            'notes': sanitize(data.get('notes', '')),
            'reflection': sanitize(data.get('reflection', '')),
            'completed': bool(data.get('completed', False)),
            'updated_at': datetime.now()
        }
        if exams_collection is not None:
            result = exams_collection.update_one(
                {'_id': ObjectId(exam_id), 'user': session['user']},
                {'$set': update_data}
            )
            if result.matched_count > 0:
                return jsonify({'success': True, 'message': 'Exam updated successfully'})
            return jsonify({'error': 'Exam not found'})
        return jsonify({'success': True, 'message': 'Exam updated (dev mode)'})

    if exams_collection is not None:
        result = exams_collection.delete_one({'_id': ObjectId(exam_id), 'user': session['user']})
        if result.deleted_count > 0:
            return jsonify({'success': True, 'message': 'Exam deleted successfully'})
        return jsonify({'error': 'Exam not found'})
    return jsonify({'success': True, 'message': 'Exam deleted (dev mode)'})
