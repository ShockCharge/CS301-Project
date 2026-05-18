from flask import Blueprint, render_template, redirect, url_for, session, jsonify, request
from bson import ObjectId
from datetime import datetime
import re

from common import users_collection, social_connections_collection

try:
    from common import group_messages_collection
except ImportError:
    group_messages_collection = None

try:
    from common import study_groups_collection
except ImportError:
    study_groups_collection = None

try:
    from common import group_members_collection
except ImportError:
    group_members_collection = None


collaboration_bp = Blueprint("collaboration_bp", __name__)


def sanitize(value):
    """Basic sanitization helper for user-provided values."""
    if not isinstance(value, str):
        return value
    return re.sub(r"[<>\"\\]", "", value).strip()


def get_current_user_email():
    """Return the logged-in user's email, or None when the user is not authenticated."""
    return session.get("user")


def serialize_public_user(user):
    """Return only safe public profile fields for collaboration user listing."""
    first_name = sanitize(user.get("first_name", "") or "")
    last_name = sanitize(user.get("last_name", "") or "")
    full_name = f"{first_name} {last_name}".strip() or user.get("email", "Study Planner User")

    return {
        "email": sanitize(user.get("email")), # Email is public for collaboration
        "name": full_name,
        "major": sanitize(user.get("major", "")), # Public profile field
        "institution": sanitize(user.get("institution", "")), # Public profile field
    }


@collaboration_bp.route("/collaboration")
def collaboration():
    if "user" not in session:
        return redirect(url_for("login"))
    return render_template("collaboration.html")


@collaboration_bp.route("/api/collaboration/users")
def list_users():
    current_user_email = get_current_user_email()
    if not current_user_email:
        return jsonify({"error": "Unauthorized"}), 401

    query = request.args.get("q", "").strip()
    search_filter = {}
    if query:
        # Search by email or name (case-insensitive regex)
        search_filter["$or"] = [
            {"email": {"$regex": query, "$options": "i"}},
            {"first_name": {"$regex": query, "$options": "i"}},
            {"last_name": {"$regex": query, "$options": "i"}}
        ]

    # Exclude current user from search results
    search_filter["email"] = {"$ne": current_user_email}

    users = users_collection.find(search_filter, {"password": 0})
    serialized_users = [serialize_public_user(user) for user in users]

    # Filter out users who already have a pending or accepted connection with the current user
    existing_connections = social_connections_collection.find({
        "$or": [
            {"requester_email": current_user_email},
            {"receiver_email": current_user_email}
        ],
        "status": {"$in": ["pending", "accepted"]}
    })

    connected_emails = set()
    for conn in existing_connections:
        if conn["requester_email"] == current_user_email:
            connected_emails.add(conn["receiver_email"])
        else:
            connected_emails.add(conn["requester_email"])

    filtered_users = [user for user in serialized_users if user["email"] not in connected_emails]

    return jsonify({"users": filtered_users})


@collaboration_bp.route("/api/collaboration/requests", methods=["POST"])
def send_connection_request():
    current_user_email = get_current_user_email()
    if not current_user_email:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json()
    receiver_email = sanitize(data.get("receiver_email"))

    if not receiver_email:
        return jsonify({"error": "Receiver email is required"}), 400

    if current_user_email == receiver_email:
        return jsonify({"error": "Cannot send a connection request to yourself"}), 400

    # Check if receiver exists
    receiver = users_collection.find_one({"email": receiver_email})
    if not receiver:
        return jsonify({"error": "Receiver not found"}), 404

    # Check for existing request (pending or accepted)
    existing_request = social_connections_collection.find_one({
        "$or": [
            {"requester_email": current_user_email, "receiver_email": receiver_email},
            {"requester_email": receiver_email, "receiver_email": current_user_email}
        ],
        "status": {"$in": ["pending", "accepted"]}
    })

    if existing_request:
        if existing_request["status"] == "pending":
            return jsonify({"error": "A pending request already exists with this user"}), 409
        else:
            return jsonify({"error": "You are already connected with this user"}), 409

    social_connections_collection.insert_one({
        "requester_email": current_user_email,
        "receiver_email": receiver_email,
        "status": "pending",
        "created_at": datetime.utcnow()
    })

    return jsonify({"message": "Connection request sent successfully"}), 201


@collaboration_bp.route("/api/collaboration/requests/incoming")
def get_incoming_requests():
    current_user_email = get_current_user_email()
    if not current_user_email:
        return jsonify({"error": "Unauthorized"}), 401

    incoming_requests = social_connections_collection.find({
        "receiver_email": current_user_email,
        "status": "pending"
    })

    requests_data = []
    for req in incoming_requests:
        requester = users_collection.find_one({"email": req["requester_email"]})
        if requester:
            requests_data.append({
                "id": str(req["_id"]),
                "requester_email": req["requester_email"],
                "requester_name": serialize_public_user(requester).get("name", "Study Planner User"),
                "requester_major": serialize_public_user(requester).get("major", ""),
                "requester_institution": serialize_public_user(requester).get("institution", ""),
                "created_at": req["created_at"].isoformat()
            })
    return jsonify({"requests": requests_data})


@collaboration_bp.route("/api/collaboration/requests/<request_id>/<action>", methods=["POST"])
def handle_connection_request(request_id, action):
    current_user_email = get_current_user_email()
    if not current_user_email:
        return jsonify({"error": "Unauthorized"}), 401

    if action not in ["accept", "reject"]:
        return jsonify({"error": "Invalid action"}), 400

    try:
        obj_id = ObjectId(request_id)
    except:
        return jsonify({"error": "Invalid request ID"}), 400

    request_doc = social_connections_collection.find_one({"_id": obj_id, "receiver_email": current_user_email, "status": "pending"})

    if not request_doc:
        return jsonify({"error": "Request not found or already handled"}), 404

    if action == "accept":
        social_connections_collection.update_one({"_id": obj_id}, {"$set": {"status": "accepted", "accepted_at": datetime.utcnow()}})
        message = "Connection request accepted"
    else: # reject
        social_connections_collection.update_one({"_id": obj_id}, {"$set": {"status": "rejected", "rejected_at": datetime.utcnow()}})
        message = "Connection request rejected"

    return jsonify({"message": message})


@collaboration_bp.route("/api/collaboration/connections")
def get_connections():
    current_user_email = get_current_user_email()
    if not current_user_email:
        return jsonify({"error": "Unauthorized"}), 401

    accepted_connections = social_connections_collection.find({
        "$or": [
            {"requester_email": current_user_email},
            {"receiver_email": current_user_email}
        ],
        "status": "accepted"
    })

    connections_data = []
    for conn in accepted_connections:
        other_user_email = conn["receiver_email"] if conn["requester_email"] == current_user_email else conn["requester_email"]
        other_user = users_collection.find_one({"email": other_user_email})
        if other_user:
            connections_data.append(serialize_public_user(other_user))

    return jsonify({"connections": connections_data})


@collaboration_bp.route("/api/collaboration/messages", methods=["GET", "POST"])
def handle_direct_messages():
    current_user_email = get_current_user_email()
    if not current_user_email:
        return jsonify({"error": "Unauthorized"}), 401

    if not group_messages_collection:
        return jsonify({"error": "Database is not connected for messages"}), 500

    if request.method == "POST":
        data = request.get_json()
        receiver_email = sanitize(data.get("receiver_email"))
        body = sanitize(data.get("body"))

        if not receiver_email or not body:
            return jsonify({"error": "Receiver email and message body are required"}), 400

        # Check if they are connected
        is_connected = social_connections_collection.find_one({
            "$or": [
                {"requester_email": current_user_email, "receiver_email": receiver_email, "status": "accepted"},
                {"requester_email": receiver_email, "receiver_email": current_user_email, "status": "accepted"}
            ]
        })

        if not is_connected:
            return jsonify({"error": "You are not connected with this user"}), 403

        group_messages_collection.insert_one({
            "sender_email": current_user_email,
            "receiver_email": receiver_email,
            "body": body,
            "created_at": datetime.utcnow(),
            "message_type": "direct" # Differentiate from group messages
        })
        return jsonify({"message": "Message sent successfully"}), 201

    else: # GET request
        friend_email = request.args.get("friend_email")
        if not friend_email:
            return jsonify({"error": "Friend email is required"}), 400

        # Check if they are connected
        is_connected = social_connections_collection.find_one({
            "$or": [
                {"requester_email": current_user_email, "receiver_email": friend_email, "status": "accepted"},
                {"requester_email": friend_email, "receiver_email": current_user_email, "status": "accepted"}
            ]
        })

        if not is_connected:
            return jsonify({"error": "You are not connected with this user"}), 403

        messages = group_messages_collection.find({
            "$or": [
                {"sender_email": current_user_email, "receiver_email": friend_email},
                {"sender_email": friend_email, "receiver_email": current_user_email}
            ],
            "message_type": "direct"
        }).sort("created_at", 1)

        messages_data = []
        for msg in messages:
            messages_data.append({
                "sender_email": msg["sender_email"],
                "body": msg["body"],
                "created_at": msg["created_at"].isoformat(),
                "is_mine": msg["sender_email"] == current_user_email
            })
        return jsonify({"messages": messages_data})


# --- Study Group Routes ---
@collaboration_bp.route('/api/collaboration/groups', methods=['GET'])
def get_groups():
    """Return collaboration groups"""

    current_user = get_current_user_email()

    if not current_user:
        return jsonify({'error': 'Not logged in'}), 401

    # Temporary empty groups list
    groups = []

    return jsonify({
        'groups': groups
    })




@collaboration_bp.route("/api/collaboration/groups", methods=["GET", "POST"])
def handle_study_groups():
    current_user_email = get_current_user_email()
    if not current_user_email:
        return jsonify({"error": "Unauthorized"}), 401

    if not study_groups_collection or not group_members_collection:
        return jsonify({"error": "Database is not connected for study groups"}), 500

    if request.method == "POST":
        data = request.get_json()
        group_name = sanitize(data.get("name"))
        group_description = sanitize(data.get("description", ""))

        if not group_name:
            return jsonify({"error": "Group name is required"}), 400

        # Create the group
        new_group = {
            "name": group_name,
            "description": group_description,
            "created_by": current_user_email,
            "created_at": datetime.utcnow()
        }
        result = study_groups_collection.insert_one(new_group)
        group_id = result.inserted_id

        # Add creator as a member
        group_members_collection.insert_one({
            "group_id": group_id,
            "member_email": current_user_email,
            "joined_at": datetime.utcnow(),
            "role": "admin" # Creator is admin
        })

        return jsonify({"message": "Study group created successfully", "group_id": str(group_id)}), 201

    else: # GET request - list groups current user is a member of
        member_of_groups = group_members_collection.find({"member_email": current_user_email})
        group_ids = [member["group_id"] for member in member_of_groups]

        groups_data = []
        for group_id in group_ids:
            group = study_groups_collection.find_one({"_id": group_id})
            if group:
                groups_data.append({
                    "id": str(group["_id"]),
                    "name": group["name"],
                    "description": group.get("description", ""),
                    "created_by": group["created_by"],
                    "created_at": group["created_at"].isoformat()
                })
        return jsonify({"groups": groups_data})


@collaboration_bp.route("/api/collaboration/groups/<group_id>/members")
def get_group_members(group_id):
    current_user_email = get_current_user_email()
    if not current_user_email:
        return jsonify({"error": "Unauthorized"}), 401

    if not group_members_collection:
        return jsonify({"error": "Database is not connected for group members"}), 500

    try:
        obj_group_id = ObjectId(group_id)
    except:
        return jsonify({"error": "Invalid group ID"}), 400

    # Check if current user is a member of this group
    is_member = group_members_collection.find_one({"group_id": obj_group_id, "member_email": current_user_email})
    if not is_member:
        return jsonify({"error": "Not a member of this group"}), 403

    members = group_members_collection.find({"group_id": obj_group_id})
    members_data = []
    for member in members:
        user = users_collection.find_one({"email": member["member_email"]})
        if user:
            members_data.append({
                "email": user["email"],
                "name": serialize_public_user(user).get("name", "Study Planner User"),
                "role": member.get("role", "member"),
                "joined_at": member["joined_at"].isoformat()
            })
    return jsonify({"members": members_data})


@collaboration_bp.route("/api/collaboration/groups/<group_id>/invite", methods=["POST"])
def invite_to_group(group_id):
    current_user_email = get_current_user_email()
    if not current_user_email:
        return jsonify({"error": "Unauthorized"}), 401

    if not group_members_collection or not study_groups_collection:
        return jsonify({"error": "Database is not connected for group invitations"}), 500

    try:
        obj_group_id = ObjectId(group_id)
    except:
        return jsonify({"error": "Invalid group ID"}), 400

    data = request.get_json()
    invitee_email = sanitize(data.get("invitee_email"))

    if not invitee_email:
        return jsonify({"error": "Invitee email is required"}), 400

    # Check if current user is an admin of this group
    is_admin = group_members_collection.find_one({"group_id": obj_group_id, "member_email": current_user_email, "role": "admin"})
    if not is_admin:
        return jsonify({"error": "Only group admins can invite members"}), 403

    # Check if invitee is an existing user and a friend
    invitee_user = users_collection.find_one({"email": invitee_email})
    if not invitee_user:
        return jsonify({"error": "Invitee user not found"}), 404

    is_friend = social_connections_collection.find_one({
        "$or": [
            {"requester_email": current_user_email, "receiver_email": invitee_email, "status": "accepted"},
            {"requester_email": invitee_email, "receiver_email": current_user_email, "status": "accepted"}
        ]
    })
    if not is_friend:
        return jsonify({"error": "You can only invite friends to a group"}), 403

    # Check if invitee is already a member
    already_member = group_members_collection.find_one({"group_id": obj_group_id, "member_email": invitee_email})
    if already_member:
        return jsonify({"error": "User is already a member of this group"}), 409

    group_members_collection.insert_one({
        "group_id": obj_group_id,
        "member_email": invitee_email,
        "joined_at": datetime.utcnow(),
        "role": "member"
    })

    return jsonify({"message": f"{invitee_email} invited to the group successfully"}), 200


@collaboration_bp.route("/api/collaboration/groups/<group_id>/messages", methods=["GET", "POST"])
def handle_group_messages(group_id):
    current_user_email = get_current_user_email()
    if not current_user_email:
        return jsonify({"error": "Unauthorized"}), 401

    if not group_messages_collection or not group_members_collection:
        return jsonify({"error": "Database is not connected for group messages"}), 500

    try:
        obj_group_id = ObjectId(group_id)
    except:
        return jsonify({"error": "Invalid group ID"}), 400

    # Check if current user is a member of this group
    is_member = group_members_collection.find_one({"group_id": obj_group_id, "member_email": current_user_email})
    if not is_member:
        return jsonify({"error": "Not a member of this group"}), 403

    if request.method == "POST":
        data = request.get_json()
        body = sanitize(data.get("body"))

        if not body:
            return jsonify({"error": "Message body is required"}), 400

        group_messages_collection.insert_one({
            "group_id": obj_group_id,
            "sender_email": current_user_email,
            "body": body,
            "created_at": datetime.NZ_TZ(),
            "message_type": "group"
        })
        return jsonify({"message": "Group message sent successfully"}), 201

    else: # GET request
        messages = group_messages_collection.find({
            "group_id": obj_group_id,
            "message_type": "group"
        }).sort("created_at", 1)

        messages_data = []
        for msg in messages:
            sender_user = users_collection.find_one({"email": msg["sender_email"]})
            sender_name = serialize_public_user(sender_user).get("name", "Study Planner User") if sender_user else "Unknown User"
            messages_data.append({
                "sender_email": msg["sender_email"],
                "sender_name": sender_name,
                "body": msg["body"],
                "created_at": msg["created_at"].isoformat(),
                "is_mine": msg["sender_email"] == current_user_email
            })
        return jsonify({"messages": messages_data})
