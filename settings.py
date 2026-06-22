import json
import re

from flask import Blueprint, Response, jsonify, redirect, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

from common import (
    classes_collection,
    exams_collection,
    schedules_collection,
    tasks_collection,
    users_collection,
    vacations_collection,
)


settings_bp = Blueprint('settings', __name__)


@settings_bp.route('/api/settings', methods=['GET', 'POST'])
def api_settings():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    if users_collection is None:
        if request.method == 'GET':
            return jsonify({'dark_mode': False, 'task_reminders': True, 'exam_alerts': True,
                            'study_duration': '60', 'break_duration': '10', 'default_view': 'week'})
        return jsonify({'success': True})

    if request.method == 'GET':
        user = users_collection.find_one({'email': session['user']}, {'settings': 1})
        s = user.get('settings', {}) if user else {}
        return jsonify({
            'dark_mode': s.get('dark_mode', False),
            'task_reminders': s.get('task_reminders', True),
            'exam_alerts': s.get('exam_alerts', True),
            'study_duration': s.get('study_duration', '60'),
            'break_duration': s.get('break_duration', '10'),
            'default_view': s.get('default_view', 'week')
        })

    data = request.json or {}
    users_collection.update_one(
        {'email': session['user']},
        {'$set': {
            'settings.dark_mode': bool(data.get('dark_mode', False)),
            'settings.task_reminders': bool(data.get('task_reminders', True)),
            'settings.exam_alerts': bool(data.get('exam_alerts', True)),
            'settings.study_duration': str(data.get('study_duration', '60')),
            'settings.break_duration': str(data.get('break_duration', '10')),
            'settings.default_view': str(data.get('default_view', 'week'))
        }}
    )
    return jsonify({'success': True})


@settings_bp.route('/api/export', methods=['GET'])
def api_export_data():
    if 'user' not in session:
        return redirect(url_for('login'))

    user_email = session['user']
    export_data = {'user': user_email}

    if tasks_collection is not None:
        export_data['tasks'] = list(tasks_collection.find({'user': user_email}, {'_id': 0}))
        export_data['exams'] = list(exams_collection.find({'user': user_email}, {'_id': 0}))
        export_data['classes'] = list(classes_collection.find({'user': user_email}, {'_id': 0}))
        export_data['schedules'] = list(schedules_collection.find({'user': user_email}, {'_id': 0}))

    response = Response(
        json.dumps(export_data, indent=4, default=str),
        mimetype='application/json',
        headers={'Content-Disposition': 'attachment;filename=study_planner_export.json'}
    )
    return response


@settings_bp.route('/api/clear-all', methods=['POST'])
def api_clear_all_data():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    user_email = session['user']

    if tasks_collection is not None:
        tasks_collection.delete_many({'user': user_email})
        exams_collection.delete_many({'user': user_email})
        classes_collection.delete_many({'user': user_email})
        schedules_collection.delete_many({'user': user_email})
        vacations_collection.delete_many({'user': user_email})

    return jsonify({'success': True, 'message': 'All user data cleared'})


@settings_bp.route('/api/change_password', methods=['POST'])
def api_change_password():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    data = request.json or {}
    current_password = data.get('current_password', '')
    new_password = data.get('new_password', '')

    if not current_password or not new_password:
        return jsonify({'error': 'Both current and new password are required.'}), 400
    if len(new_password) < 8:
        return jsonify({'error': 'New password must be at least 8 characters.'}), 400
    if not re.search(r'[A-Z]', new_password):
        return jsonify({'error': 'New password must contain at least one uppercase letter.'}), 400
    if not re.search(r'[0-9]', new_password):
        return jsonify({'error': 'New password must contain at least one number.'}), 400

    if users_collection is None:
        return jsonify({'error': 'Database connection is unavailable.'}), 500

    user = users_collection.find_one({'email': session['user']})
    if not user or not check_password_hash(user.get('password', ''), current_password):
        return jsonify({'error': 'Current password is incorrect.'}), 403

    users_collection.update_one(
        {'email': session['user']},
        {'$set': {'password': generate_password_hash(new_password)}}
    )
    return jsonify({'success': True})


@settings_bp.route('/api/account', methods=['DELETE'])
def api_delete_account():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    user_email = session['user']

    if users_collection is not None:
        tasks_collection.delete_many({'user': user_email})
        exams_collection.delete_many({'user': user_email})
        classes_collection.delete_many({'user': user_email})
        schedules_collection.delete_many({'user': user_email})
        vacations_collection.delete_many({'user': user_email})
        users_collection.delete_one({'email': user_email})

    session.pop('user', None)
    return jsonify({'success': True})
