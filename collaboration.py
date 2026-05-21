from flask import Blueprint, render_template, redirect, url_for, session, jsonify, request
from bson import ObjectId
from datetime import datetime
import re

from common import (
    users_collection, 
    social_connections_collection,
    study_groups_collection,
    group_members_collection,
    group_messages_collection
)

try:
    from common import group_messages_collection, study_groups_collection, group_members_collection
except ImportError:
    group_messages_collection = None
    study_groups_collection = None
    group_members_collection = None


collaboration_bp = Blueprint('collaboration_bp', __name__)


def sanitize(value):
    """Basic sanitization helper for user-provided values."""
    if not isinstance(value, str):
        return value
    return re.sub(r'[<>"\']', '', value).strip()


def get_current_user_email():
    """Return the logged-in user's email, or None when the user is not authenticated."""
    return session.get('user')


def normalize_email(email):
    """Return a clean lowercase email string."""
    return sanitize(email or '').lower()


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


def serialize_message(message, current_user):
    """Return a safe JSON version of a message with sender name."""
    sender_email = message.get('sender_email', '')
    
    sender_name = sender_email
    if users_collection is not None:
        sender = users_collection.find_one({'email': sender_email})
        if sender:
            first = sanitize(sender.get('first_name', '') or '')
            last = sanitize(sender.get('last_name', '') or '')
            sender_name = f"{first} {last}".strip() or sender_email

    return {
        'id': str(message.get('_id')),
        'sender_email': sender_email,
        'sender_name': sender_name,
        'receiver_email': message.get('receiver_email', ''),
        'body': sanitize(message.get('body', '') or ''),
        'created_at': message.get('created_at').isoformat() if message.get('created_at') else '',
        'is_mine': sender_email.lower() == current_user.lower(),
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


def are_connected(email_one, email_two):
    """Return True when two users have an accepted social connection."""
    if social_connections_collection is None:
        return False

    return social_connections_collection.find_one({
        'status': 'accepted',
        '$or': [
            {'requester_email': email_one, 'receiver_email': email_two},
            {'requester_email': email_two, 'receiver_email': email_one},
        ]
    }) is not None


def direct_conversation_id(email_one, email_two):
    """Create a stable conversation id for two users."""
    emails = sorted([email_one.lower(), email_two.lower()])
    return f"direct::{emails[0]}::{emails[1]}"


def build_friend_from_connection(connection, current_user):
    """Build a friend profile object from an accepted connection document."""
    requester_email = connection.get('requester_email', '')
    receiver_email = connection.get('receiver_email', '')
    friend_email = receiver_email if requester_email == current_user else requester_email

    friend_user = users_collection.find_one({'email': friend_email}) if users_collection is not None else None

    if friend_user:
        friend_profile = serialize_public_user(friend_user)
    else:
        friend_profile = {
            'id': '',
            'name': friend_email or 'Study Planner User',
            'email': friend_email,
            'institution': '',
            'major': '',
        }

    friend_profile['connection_id'] = str(connection.get('_id'))
    friend_profile['connected_at'] = connection.get('updated_at').isoformat() if connection.get('updated_at') else ''

    return friend_profile


@collaboration_bp.route('/collaboration')
def collaboration():
    """Render the collaboration hub page."""
    if 'user' not in session:
        return redirect(url_for('login'))
    return render_template('collaboration.html')


@collaboration_bp.route('/collaboration/users', methods=['GET'])
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


@collaboration_bp.route('/collaboration/requests', methods=['POST'])
def send_connection_request():
    """Send a pending connection request to another student."""
    current_user = get_current_user_email()

    if not current_user:
        return jsonify({'error': 'Not logged in'}), 401

    if users_collection is None or social_connections_collection is None:
        return jsonify({'error': 'Database is not connected.'}), 503

    data = request.get_json(silent=True) or {}
    receiver_email = normalize_email(data.get('receiver_email', ''))

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


@collaboration_bp.route('/collaboration/requests/incoming', methods=['GET'])
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


@collaboration_bp.route('/collaboration/requests/outgoing', methods=['GET'])
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


@collaboration_bp.route('/collaboration/connections', methods=['GET'])
def get_accepted_connections():
    """Return accepted friends for the current user."""
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

    friends = [build_friend_from_connection(item, current_user) for item in connections_cursor]

    return jsonify({'connections': friends})


@collaboration_bp.route('/collaboration/requests/<request_id>/accept', methods=['POST'])
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


@collaboration_bp.route('/collaboration/requests/<request_id>/reject', methods=['POST'])
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


@collaboration_bp.route('/collaboration/requests/<request_id>/cancel', methods=['POST'])
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


@collaboration_bp.route('/collaboration/messages', methods=['GET'])
def get_direct_messages():
    """Return direct messages between the current user and one accepted friend."""
    current_user = get_current_user_email()

    if not current_user:
        return jsonify({'error': 'Not logged in'}), 401

    if group_messages_collection is None:
        return jsonify({'messages': [], 'message': 'Database is not connected.'})

    friend_email = normalize_email(request.args.get('friend_email', ''))

    if not friend_email:
        return jsonify({'error': 'Friend email is required.'}), 400

    if friend_email == current_user.lower():
        return jsonify({'error': 'You cannot message yourself.'}), 400

    if not are_connected(current_user, friend_email):
        return jsonify({'error': 'You can only message accepted friends.'}), 403

    conversation_id = direct_conversation_id(current_user, friend_email)

    messages_cursor = group_messages_collection.find({
        'conversation_type': 'direct',
        'conversation_id': conversation_id,
    }).sort('created_at', 1).limit(100)
    return jsonify({
       'messages': [serialize_message(message, current_user ) for message in messages_cursor]
    })


@collaboration_bp.route('/collaboration/messages', methods=['POST'])
def send_direct_message():
    """Send a direct message to an accepted friend."""
    current_user = get_current_user_email()

    if not current_user:
        return jsonify({'error': 'Not logged in'}), 401

    if group_messages_collection is None:
        return jsonify({'error': 'Database is not connected.'}), 503

    data = request.get_json(silent=True) or {}
    receiver_email = normalize_email(data.get('receiver_email', ''))
    body = sanitize(data.get('body', '') or '')

    if not receiver_email:
        return jsonify({'error': 'Receiver email is required.'}), 400

    if receiver_email == current_user.lower():
        return jsonify({'error': 'You cannot message yourself.'}), 400

    if not body:
        return jsonify({'error': 'Message cannot be empty.'}), 400

    if len(body) > 1000:
        return jsonify({'error': 'Message is too long. Please keep it under 1000 characters.'}), 400

    if not are_connected(current_user, receiver_email):
        return jsonify({'error': 'You can only message accepted friends.'}), 403

    now = datetime.utcnow()

    message_doc = {
        'conversation_type': 'direct',
        'conversation_id': direct_conversation_id(current_user, receiver_email),
        'sender_email': current_user,
        'receiver_email': receiver_email,
        'body': body,
        'created_at': now,
        'updated_at': now,
        'read_at': None,
    }

    result = group_messages_collection.insert_one(message_doc)
    message_doc['_id'] = result.inserted_id

    return jsonify({
        'message': 'Message sent successfully.',
        'chat_message': serialize_message(message_doc, current_user)
    }), 201


# ====================== GROUP ROUTES ======================

@collaboration_bp.route('/collaboration/groups', methods=['GET'])
def get_groups():
    """Get all groups the current user is a member of."""
    current_user = get_current_user_email()
    if not current_user:
        return jsonify({'error': 'Not logged in'}), 401

    if study_groups_collection is None:
        return jsonify({'groups': [], 'message': 'Database not connected'})

    # Find groups where user is a member
    pipeline = [
        {
            '$lookup': {
                'from': 'group_members',
                'localField': '_id',
                'foreignField': 'group_id',
                'as': 'membership'
            }
        },
        {
            '$match': {
                'membership.user_email': current_user
            }
        },
        {'$sort': {'created_at': -1}}
    ]

    groups_cursor = study_groups_collection.aggregate(pipeline)

    result = []
    for g in groups_cursor:
        result.append({
            'id': str(g['_id']),
            'name': sanitize(g.get('name', '')),
            'description': sanitize(g.get('description', '')),
            'member_count': g.get('member_count', 1),
            'created_at': g.get('created_at').isoformat() if g.get('created_at') else ''
        })

    return jsonify({'groups': result})


@collaboration_bp.route('/collaboration/groups', methods=['POST'])
def create_group():
    """Create a new study group."""
    current_user = get_current_user_email()
    if not current_user:
        return jsonify({'error': 'Not logged in'}), 401

    if study_groups_collection is None:
        return jsonify({'error': 'Database not connected'}), 503

    data = request.get_json(silent=True) or {}
    name = sanitize(data.get('name', ''))
    description = sanitize(data.get('description', ''))

    if not name or len(name) < 3:
        return jsonify({'error': 'Group name must be at least 3 characters long'}), 400

    now = datetime.utcnow()

    group_doc = {
        'name': name,
        'description': description,
        'creator': current_user,
        'member_count': 1,
        'created_at': now,
        'updated_at': now
    }

    result = study_groups_collection.insert_one(group_doc)
    group_id = result.inserted_id

    # Add creator to group_members_collection
    if group_members_collection is not None:
     group_members_collection.insert_one({
        'group_id': group_id,
        'user_email': current_user,
        'role': 'admin',
        'joined_at': now
    })

    return jsonify({
        'message': 'Group created successfully',
        'group': {
            'id': str(group_id),
            'name': name,
            'description': description
        }
    }), 201


@collaboration_bp.route('/collaboration/groups/<group_id>/messages', methods=['GET'])
def get_group_messages(group_id):
    """Get messages for a specific group."""
    current_user = get_current_user_email()
    if not current_user:
        return jsonify({'error': 'Not logged in'}), 401

    if group_messages_collection is None:
        return jsonify({'messages': []})

    try:
        ObjectId(group_id)
    except:
        return jsonify({'error': 'Invalid group ID'}), 400

    # Optional: Check if user is member of the group (recommended)
    # You can add this check later

    messages_cursor = group_messages_collection.find({
        'conversation_type': 'group',
        'conversation_id': group_id
    }).sort('created_at', 1).limit(100)

    return jsonify({
        'messages': [serialize_message(msg, current_user) for msg in messages_cursor]
    })


@collaboration_bp.route('/collaboration/groups/<group_id>/messages', methods=['POST'])
def send_group_message(group_id):
    """Send a message to a group."""
    current_user = get_current_user_email()
    if not current_user:
        return jsonify({'error': 'Not logged in'}), 401

    if group_messages_collection is None:
        return jsonify({'error': 'Database not connected'}), 503

    data = request.get_json(silent=True) or {}
    body = sanitize(data.get('body', ''))

    if not body:
        return jsonify({'error': 'Message body cannot be empty'}), 400
    if len(body) > 1000:
        return jsonify({'error': 'Message is too long (max 1000 characters)'}), 400

    now = datetime.utcnow()

    message_doc = {
        'conversation_type': 'group',
        'conversation_id': group_id,
        'sender_email': current_user,
        'body': body,
        'created_at': now
    }

    group_messages_collection.insert_one(message_doc)

    membership = group_members_collection.find_one({
    'group_id': ObjectId(group_id),
    'user_email': current_user
})

    if not membership:
      return jsonify({'error': 'You are not a member of this group'}), 403

    return jsonify({'message': 'Message sent successfully'}), 201