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




# ====================== COLLABORATION NOTIFICATIONS ======================

def get_current_user_group_ids(user_email):
    """Return ObjectIds for study groups the current user belongs to."""
    if group_members_collection is None:
        return []
    memberships = group_members_collection.find({'user_email': user_email}, {'group_id': 1})
    return [item.get('group_id') for item in memberships if item.get('group_id')]


def count_unread_direct_messages(user_email):
    """Count direct messages sent to the user that have not been read yet."""
    if group_messages_collection is None:
        return 0
    return group_messages_collection.count_documents({
        'conversation_type': 'direct',
        'receiver_email': user_email,
        'read_at': None,
    })


def count_unread_group_messages(user_email):
    """Count group messages in the user's groups that the user has not read yet."""
    if group_messages_collection is None or group_members_collection is None:
        return 0

    group_ids = get_current_user_group_ids(user_email)
    if not group_ids:
        return 0

    group_id_strings = [str(group_id) for group_id in group_ids]
    return group_messages_collection.count_documents({
        'conversation_type': 'group',
        'conversation_id': {'$in': group_id_strings},
        'sender_email': {'$ne': user_email},
        '$or': [
            {'read_by': {'$exists': False}},
            {'read_by': {'$ne': user_email}},
        ],
    })


def count_pending_connection_requests(user_email):
    """Count pending connection requests received by the user."""
    if social_connections_collection is None:
        return 0
    return social_connections_collection.count_documents({
        'receiver_email': user_email,
        'status': 'pending',
    })


def count_unread_direct_messages_from_friend(user_email, friend_email):
    """Count unread direct messages sent by one friend to the current user."""
    if group_messages_collection is None:
        return 0
    return group_messages_collection.count_documents({
        'conversation_type': 'direct',
        'conversation_id': direct_conversation_id(user_email, friend_email),
        'sender_email': friend_email,
        'receiver_email': user_email,
        'read_at': None,
    })


def count_unread_group_messages_for_group(user_email, group_id):
    """Count unread group messages for one group for the current user."""
    if group_messages_collection is None:
        return 0
    return group_messages_collection.count_documents({
        'conversation_type': 'group',
        'conversation_id': str(group_id),
        'sender_email': {'$ne': user_email},
        '$or': [
            {'read_by': {'$exists': False}},
            {'read_by': {'$ne': user_email}},
        ],
    })


@collaboration_bp.route('/collaboration/notifications/count', methods=['GET'])
@collaboration_bp.route('/notifications/count', methods=['GET'])
@collaboration_bp.route('/api/collaboration/notifications/count', methods=['GET'])
@collaboration_bp.route('/api/notifications/count', methods=['GET'])
def get_collaboration_notification_count():
    """Return the unread collaboration notification count for the sidebar badge."""
    current_user = get_current_user_email()
    if not current_user:
        return jsonify({'count': 0, 'messages': 0, 'group_messages': 0, 'connection_requests': 0}), 401

    direct_count = count_unread_direct_messages(current_user)
    group_count = count_unread_group_messages(current_user)
    request_count = count_pending_connection_requests(current_user)

    return jsonify({
        'count': direct_count + group_count + request_count,
        'messages': direct_count,
        'group_messages': group_count,
        'connection_requests': request_count,
    })

@collaboration_bp.route('/api/collaboration/users', methods=['GET'])
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


@collaboration_bp.route('/api/collaboration/requests', methods=['POST'])
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


@collaboration_bp.route('/api/collaboration/requests/incoming', methods=['GET'])
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


@collaboration_bp.route('/api/collaboration/requests/outgoing', methods=['GET'])
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


@collaboration_bp.route('/api/collaboration/connections', methods=['GET'])
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

    friends = []
    for item in connections_cursor:
        friend = build_friend_from_connection(item, current_user)
        friend['unread_count'] = count_unread_direct_messages_from_friend(current_user, friend.get('email', ''))
        friends.append(friend)

    friends.sort(key=lambda friend: (friend.get('unread_count', 0), friend.get('connected_at', '')), reverse=True)

    return jsonify({'connections': friends})


@collaboration_bp.route('/api/collaboration/requests/<request_id>/accept', methods=['POST'])
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


@collaboration_bp.route('/api/collaboration/requests/<request_id>/reject', methods=['POST'])
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


@collaboration_bp.route('/api/collaboration/requests/<request_id>/cancel', methods=['POST'])
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


@collaboration_bp.route('/api/collaboration/messages', methods=['GET'])
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

    group_messages_collection.update_many(
        {
            'conversation_type': 'direct',
            'conversation_id': conversation_id,
            'receiver_email': current_user,
            'read_at': None,
        },
        {'$set': {'read_at': datetime.utcnow()}}
    )

    messages_cursor = group_messages_collection.find({
        'conversation_type': 'direct',
        'conversation_id': conversation_id,
    }).sort('created_at', 1).limit(100)
    return jsonify({
       'messages': [serialize_message(message, current_user ) for message in messages_cursor]
    })


@collaboration_bp.route('/api/collaboration/messages', methods=['POST'])
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

def get_group_object_id(group_id):
    """Safely convert a group id string to ObjectId."""
    try:
        return ObjectId(group_id)
    except Exception:
        return None


def get_group_membership(group_object_id, user_email):
    """Return the current user's group membership document, if one exists."""
    if group_members_collection is None:
        return None
    return group_members_collection.find_one({
        'group_id': group_object_id,
        'user_email': user_email
    })


def serialize_group(group_doc, current_user=None):
    """Return a safe JSON version of a study group."""
    group_id = group_doc.get('_id')
    member_count = group_members_collection.count_documents({'group_id': group_id}) if group_members_collection is not None else group_doc.get('member_count', 1)
    unread_count = count_unread_group_messages_for_group(current_user, group_id) if current_user else 0
    return {
        'id': str(group_id),
        'name': sanitize(group_doc.get('name', '') or ''),
        'description': sanitize(group_doc.get('description', '') or ''),
        'creator': group_doc.get('creator', ''),
        'member_count': member_count,
        'unread_count': unread_count,
        'created_at': group_doc.get('created_at').isoformat() if group_doc.get('created_at') else ''
    }


def serialize_group_member(member_doc):
    """Return a safe JSON version of a group member, including profile details when available."""
    email = member_doc.get('user_email', '')
    user_doc = users_collection.find_one({'email': email}) if users_collection is not None else None
    profile = serialize_public_user(user_doc) if user_doc else {
        'id': '',
        'name': email or 'Study Planner User',
        'email': email,
        'institution': '',
        'major': ''
    }
    profile['role'] = member_doc.get('role', 'member')
    profile['joined_at'] = member_doc.get('joined_at').isoformat() if member_doc.get('joined_at') else ''
    return profile


@collaboration_bp.route('/api/collaboration/groups', methods=['GET'])
@collaboration_bp.route('/collaboration/groups', methods=['GET'])
def get_groups():
    """Get all groups the current user is a member of."""
    current_user = get_current_user_email()
    if not current_user:
        return jsonify({'error': 'Not logged in'}), 401

    if study_groups_collection is None or group_members_collection is None:
        return jsonify({'groups': [], 'message': 'Database not connected'})

    memberships = list(group_members_collection.find({'user_email': current_user}))
    group_ids = [m.get('group_id') for m in memberships if m.get('group_id')]
    if not group_ids:
        return jsonify({'groups': []})

    groups_cursor = study_groups_collection.find({'_id': {'$in': group_ids}}).sort('created_at', -1)
    groups = [serialize_group(group, current_user) for group in groups_cursor]
    groups.sort(key=lambda group: (group.get('unread_count', 0), group.get('created_at', '')), reverse=True)
    return jsonify({'groups': groups})


@collaboration_bp.route('/api/collaboration/groups', methods=['POST'])
@collaboration_bp.route('/collaboration/groups', methods=['POST'])
def create_group():
    """Create a new study group and make the creator an admin member."""
    current_user = get_current_user_email()
    if not current_user:
        return jsonify({'error': 'Not logged in'}), 401

    if study_groups_collection is None or group_members_collection is None:
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
    group_doc['_id'] = result.inserted_id

    group_members_collection.update_one(
        {'group_id': result.inserted_id, 'user_email': current_user},
        {'$setOnInsert': {
            'group_id': result.inserted_id,
            'user_email': current_user,
            'role': 'admin',
            'joined_at': now
        }},
        upsert=True
    )

    return jsonify({'message': 'Group created successfully', 'group': serialize_group(group_doc, current_user)}), 201


@collaboration_bp.route('/api/collaboration/groups/<group_id>/members', methods=['GET'])
@collaboration_bp.route('/collaboration/groups/<group_id>/members', methods=['GET'])
def get_group_members(group_id):
    """Return the members of a group. Only group members can see this list."""
    current_user = get_current_user_email()
    if not current_user:
        return jsonify({'error': 'Not logged in'}), 401

    if study_groups_collection is None or group_members_collection is None:
        return jsonify({'members': [], 'message': 'Database not connected'}), 503

    group_object_id = get_group_object_id(group_id)
    if group_object_id is None:
        return jsonify({'error': 'Invalid group ID'}), 400

    group = study_groups_collection.find_one({'_id': group_object_id})
    if not group:
        return jsonify({'error': 'Group not found'}), 404

    if not get_group_membership(group_object_id, current_user):
        return jsonify({'error': 'You are not a member of this group'}), 403

    members_cursor = group_members_collection.find({'group_id': group_object_id}).sort('joined_at', 1)
    return jsonify({'members': [serialize_group_member(member) for member in members_cursor]})


@collaboration_bp.route('/api/collaboration/groups/<group_id>/members', methods=['POST'])
@collaboration_bp.route('/collaboration/groups/<group_id>/members', methods=['POST'])
def add_group_member(group_id):
    """Add an accepted friend to a group. Only group admins/creators can add members."""
    current_user = get_current_user_email()
    if not current_user:
        return jsonify({'error': 'Not logged in'}), 401

    if users_collection is None or study_groups_collection is None or group_members_collection is None:
        return jsonify({'error': 'Database not connected'}), 503

    group_object_id = get_group_object_id(group_id)
    if group_object_id is None:
        return jsonify({'error': 'Invalid group ID'}), 400

    group = study_groups_collection.find_one({'_id': group_object_id})
    if not group:
        return jsonify({'error': 'Group not found'}), 404

    current_membership = get_group_membership(group_object_id, current_user)
    if not current_membership:
        return jsonify({'error': 'You are not a member of this group'}), 403

    if current_membership.get('role') != 'admin' and group.get('creator') != current_user:
        return jsonify({'error': 'Only the group creator/admin can add members'}), 403

    data = request.get_json(silent=True) or {}
    user_email = normalize_email(data.get('user_email', ''))

    if not user_email:
        return jsonify({'error': 'Please choose a user to add'}), 400
    if user_email == current_user.lower():
        return jsonify({'error': 'You are already in this group'}), 400

    user = users_collection.find_one({'email': user_email})
    if not user:
        return jsonify({'error': 'User not found'}), 404

    if not are_connected(current_user, user_email):
        return jsonify({'error': 'You can only add accepted friends to a group. Send and accept a connection request first.'}), 403

    if get_group_membership(group_object_id, user_email):
        return jsonify({'error': 'This user is already a member of the group'}), 409

    now = datetime.utcnow()
    member_doc = {'group_id': group_object_id, 'user_email': user_email, 'role': 'member', 'joined_at': now}
    group_members_collection.insert_one(member_doc)

    member_count = group_members_collection.count_documents({'group_id': group_object_id})
    study_groups_collection.update_one({'_id': group_object_id}, {'$set': {'member_count': member_count, 'updated_at': now}})

    return jsonify({'message': 'Member added successfully', 'member': serialize_group_member(member_doc), 'member_count': member_count}), 201


@collaboration_bp.route('/api/collaboration/groups/<group_id>/messages', methods=['GET'])
@collaboration_bp.route('/collaboration/groups/<group_id>/messages', methods=['GET'])
def get_group_messages(group_id):
    """Get messages for a specific group. Only members can read group messages."""
    current_user = get_current_user_email()
    if not current_user:
        return jsonify({'error': 'Not logged in'}), 401

    if group_messages_collection is None or group_members_collection is None:
        return jsonify({'messages': [], 'message': 'Database not connected'}), 503

    group_object_id = get_group_object_id(group_id)
    if group_object_id is None:
        return jsonify({'error': 'Invalid group ID'}), 400

    if not get_group_membership(group_object_id, current_user):
        return jsonify({'error': 'You are not a member of this group'}), 403

    group_messages_collection.update_many(
        {
            'conversation_type': 'group',
            'conversation_id': group_id,
            'sender_email': {'$ne': current_user},
            '$or': [
                {'read_by': {'$exists': False}},
                {'read_by': {'$ne': current_user}},
            ],
        },
        {'$addToSet': {'read_by': current_user}, '$set': {'updated_at': datetime.utcnow()}}
    )

    messages_cursor = group_messages_collection.find({'conversation_type': 'group', 'conversation_id': group_id}).sort('created_at', 1).limit(100)
    return jsonify({'messages': [serialize_message(msg, current_user) for msg in messages_cursor]})


@collaboration_bp.route('/api/collaboration/groups/<group_id>/messages', methods=['POST'])
@collaboration_bp.route('/collaboration/groups/<group_id>/messages', methods=['POST'])
def send_group_message(group_id):
    """Send a message to a group. Membership is checked before saving the message."""
    current_user = get_current_user_email()
    if not current_user:
        return jsonify({'error': 'Not logged in'}), 401

    if group_messages_collection is None or group_members_collection is None:
        return jsonify({'error': 'Database not connected'}), 503

    group_object_id = get_group_object_id(group_id)
    if group_object_id is None:
        return jsonify({'error': 'Invalid group ID'}), 400

    if not get_group_membership(group_object_id, current_user):
        return jsonify({'error': 'You are not a member of this group'}), 403

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
        'created_at': now,
        'updated_at': now,
        'read_by': [current_user],
    }
    result = group_messages_collection.insert_one(message_doc)
    message_doc['_id'] = result.inserted_id
    return jsonify({'message': 'Message sent successfully', 'chat_message': serialize_message(message_doc, current_user)}), 201

