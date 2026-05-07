from flask import Blueprint, render_template, redirect, url_for, session, jsonify, request
import re

from common import users_collection


collaboration_bp = Blueprint('collaboration_bp', __name__)


def sanitize(value):
    """Basic sanitization helper for user-provided search values."""
    if not isinstance(value, str):
        return value
    return re.sub(r'[<>"\']', '', value).strip()


def get_current_user_email():
    """Return the logged-in user's email, or None when the user is not authenticated."""
    return session.get('user')


def serialize_public_user(user):
    """Return only safe public profile fields for collaboration user listing."""
    first_name = sanitize(user.get('first_name', '') or '')
    last_name = sanitize(user.get('last_name', '') or '')
    full_name = f"{first_name} {last_name}".strip() or user.get('email', 'Study Planner User')

    return {
        'id': str(user.get('_id')),
        'name': full_name,
        'email': user.get('email', ''),
        'institution': sanitize(user.get('institution', '') or ''),
        'major': sanitize(user.get('major', '') or ''),
    }


@collaboration_bp.route('/collaboration')
def collaboration():
    """Render the collaboration hub foundation page."""
    if 'user' not in session:
        return redirect(url_for('login'))
    return render_template('collaboration.html')


@collaboration_bp.route('/api/collaboration/users', methods=['GET'])
def api_collaboration_users():
    """Return safe public user records for the collaboration people list."""
    current_user = get_current_user_email()
    if not current_user:
        return jsonify({'error': 'Not logged in'}), 401

    if users_collection is None:
        return jsonify({'users': [], 'message': 'Database is not connected.'})

    search_query = sanitize(request.args.get('q', '')).lower()
    mongo_filter = {'email': {'$ne': current_user}}

    if search_query:
        mongo_filter['$or'] = [
            {'first_name': {'$regex': search_query, '$options': 'i'}},
            {'last_name': {'$regex': search_query, '$options': 'i'}},
            {'email': {'$regex': search_query, '$options': 'i'}},
        ]

    users = users_collection.find(
        mongo_filter,
        {'password': 0, 'settings': 0, 'phone': 0}
    ).sort('first_name', 1).limit(25)

    return jsonify({'users': [serialize_public_user(user) for user in users]})