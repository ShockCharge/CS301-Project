from flask import Blueprint, render_template, redirect, url_for, session, jsonify, request
from bson import ObjectId
from datetime import datetime
import re

from common import users_collection, social_connections_collection


collaboration_bp = Blueprint('collaboration_bp', __name__)


def sanitize(value):
    """Basic sanitization helper for user-provided values."""
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


def serialize_connection_request(connection):
    """Return a safe JSON version of a connection request."""
    return {
        'id': str(connection.get('_id')),
        'requester_email': connection.get('requester_email', ''),
        'receiver_email': connection.get('receiver_email', ''),
        'status': connection.get('status', ''),
        'created_at': connection.get('created_at').isoformat() if connection.get('created_at') else '',
        'updated_at': connection.get('updated_at').isoformat() if connection.get('updated_at') else '',
    }


def get_existing_connection(email_one, email_two):
    """Find an existing connection/request between two users in either direction."""
    if social_connections_collection is None:
        return None

    return social_connections_collection.find_one({
        '$or': [
            {'requester_email': email_one, 'receiver_email': email_two},
            {'requester_email': email_two, 'receiver_email': email_one},
        ]
    })


def get_request_by_id(request_id):
    """Safely find a connection request by MongoDB ObjectId."""
    if social_connections_collection is None:
        return None

    try:
        return social_connections_collection.find_one({'_id': ObjectId(request_id)})
    except Exception:
        return None


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


@collaboration_bp.route('/api/collaboration/requests', methods=['POST'])
def send_connection_request():
    """Send a pending connection request to another student."""
    current_user = get_current_user_email()

    if not current_user:
        return jsonify({'error': 'Not logged in'}), 401

    if users_collection is None or social_connections_collection is None:
        return jsonify({'error': 'Database is not connected.'}), 503

    data = request.get_json(silent=True) or {}
    receiver_email = sanitize(data.get('receiver_email', '')).lower()

    if not receiver_email:
        return jsonify({'error': 'Receiver email is required.'}), 400

    if receiver_email == current_user.lower():
        return jsonify({'error': 'You cannot send a request to yourself.'}), 400

    receiver = users_collection.find_one({'email': receiver_email})

    if not receiver:
        return jsonify({'error': 'User not found.'}), 404

    existing_connection = get_existing_connection(current_user, receiver_email)

    if existing_connection:
        existing_status = existing_connection.get('status', 'pending')
        return jsonify({
            'error': f'A connection or request already exists with status: {existing_status}.'
        }), 409

    now = datetime.utcnow()

    connection_doc = {
        'requester_email': current_user,
        'receiver_email': receiver_email,
        'status': 'pending',
        'created_at': now,
        'updated_at': now,
    }

    result = social_connections_collection.insert_one(connection_doc)
    connection_doc['_id'] = result.inserted_id

    return jsonify({
        'message': 'Connection request sent successfully.',
        'request': serialize_connection_request(connection_doc)
    }), 201


@collaboration_bp.route('/api/collaboration/requests/incoming', methods=['GET'])
def get_incoming_connection_requests():
    """Return pending requests received by the current user."""
    current_user = get_current_user_email()

    if not current_user:
        return jsonify({'error': 'Not logged in'}), 401

    if social_connections_collection is None:
        return jsonify({'requests': [], 'message': 'Database is not connected.'})

    requests_cursor = social_connections_collection.find({
        'receiver_email': current_user,
        'status': 'pending'
    }).sort('created_at', -1)

    requests_list = []

    for item in requests_cursor:
        request_data = serialize_connection_request(item)
        requester_email = item.get('requester_email', '')
        requester = users_collection.find_one({'email': requester_email}) if users_collection is not None else None

        if requester:
            public_requester = serialize_public_user(requester)
            request_data['requester_name'] = public_requester.get('name', requester_email)
            request_data['requester_institution'] = public_requester.get('institution', '')
            request_data['requester_major'] = public_requester.get('major', '')
        else:
            request_data['requester_name'] = requester_email or 'Study Planner User'
            request_data['requester_institution'] = ''
            request_data['requester_major'] = ''

        requests_list.append(request_data)

    return jsonify({'requests': requests_list})


@collaboration_bp.route('/api/collaboration/requests/outgoing', methods=['GET'])
def get_outgoing_connection_requests():
    """Return pending requests sent by the current user."""
    current_user = get_current_user_email()

    if not current_user:
        return jsonify({'error': 'Not logged in'}), 401

    if social_connections_collection is None:
        return jsonify({'requests': [], 'message': 'Database is not connected.'})

    requests_cursor = social_connections_collection.find({
        'requester_email': current_user,
        'status': 'pending'
    }).sort('created_at', -1)

    return jsonify({
        'requests': [serialize_connection_request(item) for item in requests_cursor]
    })


@collaboration_bp.route('/api/collaboration/connections', methods=['GET'])
def get_accepted_connections():
    """Return accepted connections for the current user."""
    current_user = get_current_user_email()

    if not current_user:
        return jsonify({'error': 'Not logged in'}), 401

    if social_connections_collection is None:
        return jsonify({'connections': [], 'message': 'Database is not connected.'})

    connections_cursor = social_connections_collection.find({
        'status': 'accepted',
        '$or': [
            {'requester_email': current_user},
            {'receiver_email': current_user},
        ]
    }).sort('updated_at', -1)

    return jsonify({
        'connections': [serialize_connection_request(item) for item in connections_cursor]
    })


@collaboration_bp.route('/api/collaboration/requests/<request_id>/accept', methods=['POST'])
def accept_connection_request(request_id):
    """Accept a pending connection request received by the current user."""
    current_user = get_current_user_email()

    if not current_user:
        return jsonify({'error': 'Not logged in'}), 401

    if social_connections_collection is None:
        return jsonify({'error': 'Database is not connected.'}), 503

    connection = get_request_by_id(request_id)

    if not connection:
        return jsonify({'error': 'Connection request not found.'}), 404

    if connection.get('receiver_email') != current_user:
        return jsonify({'error': 'You can only accept requests sent to you.'}), 403

    if connection.get('status') != 'pending':
        return jsonify({'error': 'Only pending requests can be accepted.'}), 400

    social_connections_collection.update_one(
        {'_id': connection['_id']},
        {'$set': {'status': 'accepted', 'updated_at': datetime.utcnow()}}
    )

    return jsonify({'message': 'Connection request accepted successfully.'})


@collaboration_bp.route('/api/collaboration/requests/<request_id>/reject', methods=['POST'])
def reject_connection_request(request_id):
    """Reject a pending connection request received by the current user."""
    current_user = get_current_user_email()

    if not current_user:
        return jsonify({'error': 'Not logged in'}), 401

    if social_connections_collection is None:
        return jsonify({'error': 'Database is not connected.'}), 503

    connection = get_request_by_id(request_id)

    if not connection:
        return jsonify({'error': 'Connection request not found.'}), 404

    if connection.get('receiver_email') != current_user:
        return jsonify({'error': 'You can only reject requests sent to you.'}), 403

    if connection.get('status') != 'pending':
        return jsonify({'error': 'Only pending requests can be rejected.'}), 400

    social_connections_collection.update_one(
        {'_id': connection['_id']},
        {'$set': {'status': 'rejected', 'updated_at': datetime.utcnow()}}
    )

    return jsonify({'message': 'Connection request rejected successfully.'})


@collaboration_bp.route('/api/collaboration/requests/<request_id>/cancel', methods=['POST'])
def cancel_connection_request(request_id):
    """Cancel a pending connection request sent by the current user."""
    current_user = get_current_user_email()

    if not current_user:
        return jsonify({'error': 'Not logged in'}), 401

    if social_connections_collection is None:
        return jsonify({'error': 'Database is not connected.'}), 503

    connection = get_request_by_id(request_id)

    if not connection:
        return jsonify({'error': 'Connection request not found.'}), 404

    if connection.get('requester_email') != current_user:
        return jsonify({'error': 'You can only cancel requests you sent.'}), 403

    if connection.get('status') != 'pending':
        return jsonify({'error': 'Only pending requests can be cancelled.'}), 400

    social_connections_collection.update_one(
        {'_id': connection['_id']},
        {'$set': {'status': 'cancelled', 'updated_at': datetime.utcnow()}}
    )

    return jsonify({'message': 'Connection request cancelled successfully.'})
