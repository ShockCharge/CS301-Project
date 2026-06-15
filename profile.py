import re
from datetime import datetime

from flask import Blueprint, jsonify, request, session

from common import users_collection


profile_bp = Blueprint('profile', __name__)


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


@profile_bp.route('/api/profile', methods=['PUT'])
def api_profile():
    """
    Update the current user's profile fields.
    Accepts both personal info (first_name, last_name, phone, date_of_birth, gender, address)
    and study info (institution, student_id, major, year_level, daily_study_goal, preferred_study_time).
    Both forms on the profile page send updates to this single endpoint.
    """
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    data = request.json or {}

    # Whitelist fields that are allowed to be updated to prevent mass-assignment attacks.
    allowed_fields = [
        'first_name', 'last_name', 'phone', 'date_of_birth',
        'gender', 'address', 'institution', 'student_id',
        'major', 'year_level', 'daily_study_goal', 'preferred_study_time',
        'profile_picture'
    ]

    update_data = {}
    for key, value in data.items():
        if key in allowed_fields:
            if key == 'profile_picture':
                # Profile photos are saved as browser-generated data URLs so they can
                # be shown to friends on the collaboration page. Keep only image data
                # URLs and limit the stored size to avoid very large profile payloads.
                if isinstance(value, str) and value.startswith('data:image/') and len(value) <= 2_000_000:
                    update_data[key] = value
            else:
                # Sanitize strings; leave numbers/booleans as-is.
                update_data[key] = sanitize(str(value)) if isinstance(value, str) else value

    if not update_data:
        return jsonify({'error': 'No valid fields to update'})

    if users_collection is not None:
        users_collection.update_one({'email': session['user']}, {'$set': update_data})

    return jsonify({'success': True})
