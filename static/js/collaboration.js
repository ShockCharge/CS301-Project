document.addEventListener("DOMContentLoaded", () => {
    const searchInput = document.getElementById("userSearch");
    const searchButton = document.getElementById("searchUsersBtn");
    const peopleList = document.getElementById("peopleList");
    const peopleStatus = document.getElementById("peopleStatus");

    const incomingRequestsList = document.getElementById("incomingRequestsList");
    const incomingStatus = document.getElementById("incomingStatus");
    const refreshIncomingBtn = document.getElementById("refreshIncomingBtn");

    const friendsList = document.getElementById("friendsList");
    const friendsStatus = document.getElementById("friendsStatus");
    const refreshFriendsBtn = document.getElementById("refreshFriendsBtn");

    const chatTitle = document.getElementById("chatTitle");
    const chatSubtitle = document.getElementById("chatSubtitle");
    const messagesStatus = document.getElementById("messagesStatus");
    const messagesList = document.getElementById("messagesList");
    const refreshMessagesBtn = document.getElementById("refreshMessagesBtn");
    const messageForm = document.getElementById("messageForm");
    const messageInput = document.getElementById("messageInput");
    const sendMessageBtn = document.getElementById("sendMessageBtn");

    // Study Group elements
    const createGroupModal = new bootstrap.Modal(document.getElementById("createGroupModal"));
    const createGroupForm = document.getElementById("createGroupForm");
    const groupNameInput = document.getElementById("groupName");
    const groupDescriptionInput = document.getElementById("groupDescription");
    const inviteFriendsList = document.getElementById("inviteFriendsList");
    const groupsList = document.getElementById("groupsList");
    const groupsStatus = document.getElementById("groupsStatus");
    const refreshGroupsBtn = document.getElementById("refreshGroupsBtn");

    const groupChatTitle = document.getElementById("groupChatTitle");
    const groupChatSubtitle = document.getElementById("groupChatSubtitle");
    const groupMessagesStatus = document.getElementById("groupMessagesStatus");
    const groupMessagesList = document.getElementById("groupMessagesList");
    const refreshGroupMessagesBtn = document.getElementById("refreshGroupMessagesBtn");
    const groupMessageForm = document.getElementById("groupMessageForm");
    const groupMessageInput = document.getElementById("groupMessageInput");
    const sendGroupMessageBtn = document.getElementById("sendGroupMessageBtn");


    if (
        !searchInput || !searchButton || !peopleList || !peopleStatus ||
        !incomingRequestsList || !incomingStatus || !refreshIncomingBtn ||
        !friendsList || !friendsStatus || !refreshFriendsBtn ||
        !chatTitle || !chatSubtitle || !messagesStatus || !messagesList ||
        !refreshMessagesBtn || !messageForm || !messageInput || !sendMessageBtn ||
        !createGroupModal || !createGroupForm || !groupNameInput || !groupDescriptionInput || !inviteFriendsList ||
        !groupsList || !groupsStatus || !refreshGroupsBtn ||
        !groupChatTitle || !groupChatSubtitle || !groupMessagesStatus || !groupMessagesList ||
        !refreshGroupMessagesBtn || !groupMessageForm || !groupMessageInput || !sendGroupMessageBtn
    ) {
        console.error("One or more required DOM elements not found. Collaboration features may not work correctly.");
        return;
    }

    let selectedFriend = null;
    let selectedGroup = null;

    const escapeHtml = (value) => {
        const div = document.createElement("div");
        div.textContent = value || "";
        return div.innerHTML;
    };

    const formatDateTime = (isoValue) => {
        if (!isoValue) {
            return "";
        }

        const date = new Date(isoValue);

        if (Number.isNaN(date.getTime())) {
            return "";
        }

        return date.toLocaleString([], {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    };

    // --- People Search ---
    const renderUsers = (users) => {
        peopleList.innerHTML = "";

        if (!users || users.length === 0) {
            peopleList.innerHTML = `
                <div class="placeholder-card">
                    <strong>No students found.</strong>
                    <p>Try searching by a different name or email address.</p>
                </div>
            `;
            return;
        }

        const fragment = document.createDocumentFragment();

        users.forEach((user) => {
            const card = document.createElement("article");
            card.className = "person-card";

            const profileText = [user.major, user.institution].filter(Boolean).join(" · ");

            card.innerHTML = `
                <div class="person-info">
                    <p class="person-name">${escapeHtml(user.name || "Study Planner User")}</p>
                    <p class="person-email">${escapeHtml(user.email || "")}</p>
                    <p class="person-meta">${escapeHtml(profileText || "Student")}</p>
                </div>
                <button class="btn btn-primary btn-sm connect-btn" type="button" data-email="${escapeHtml(user.email || "")}">
                    Connect
                </button>
            `;

            fragment.appendChild(card);
        });

        peopleList.appendChild(fragment);
    };

    const loadUsers = async () => {
        const query = searchInput.value.trim();
        const url = query ? `/api/collaboration/users?q=${encodeURIComponent(query)}` : "/api/collaboration/users";

        peopleStatus.textContent = "Loading users...";

        try {
            const response = await fetch(url);
            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || "Unable to load users.");
            }

            renderUsers(data.users || []);
            peopleStatus.textContent = `${(data.users || []).length} student(s) found.`;
        } catch (error) {
            peopleStatus.textContent = error.message || "Could not load users.";
            peopleList.innerHTML = `
                <div class="placeholder-card">
                    <strong>Unable to load users.</strong>
                    <p>Please refresh and try again.</p>
                </div>
            `;
        }
    };

    const sendConnectionRequest = async (button) => {
        const receiverEmail = button.dataset.email;

        if (!receiverEmail) {
            peopleStatus.textContent = "User email not found. Please refresh and try again.";
            return;
        }

        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = "Sending...";

        try {
            const response = await fetch("/api/collaboration/requests", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ receiver_email: receiverEmail })
            });

            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || "Unable to send request.");
            }

            button.textContent = "Request Sent";
            peopleStatus.textContent = data.message || "Connection request sent successfully.";
            await loadIncomingRequests();
            await loadFriends();
        } catch (error) {
            button.disabled = false;
            button.textContent = originalText;
            peopleStatus.textContent = error.message || "Could not send request.";
        }
    };

    // --- Incoming Requests ---
    const renderIncomingRequests = (requests) => {
        incomingRequestsList.innerHTML = "";

        if (!requests || requests.length === 0) {
            incomingRequestsList.innerHTML = `
                <div class="placeholder-card">
                    <strong>No incoming requests.</strong>
                    <p>You do not have any pending connection requests right now.</p>
                </div>
            `;
            return;
        }

        const fragment = document.createDocumentFragment();

        requests.forEach((request) => {
            const card = document.createElement("article");
            card.className = "request-card";

            const profileText = [request.requester_major, request.requester_institution].filter(Boolean).join(" · ");

            card.innerHTML = `
                <div class="request-info">
                    <p class="person-name">${escapeHtml(request.requester_name || "Study Planner User")}</p>
                    <p class="person-email">${escapeHtml(request.requester_email || "")}</p>
                    <p class="person-meta">${escapeHtml(profileText || "Wants to connect with you")}</p>
                </div>
                <div class="request-actions">
                    <button class="btn btn-primary btn-sm accept-request-btn" type="button" data-id="${escapeHtml(request.id || "")}">
                        Accept
                    </button>
                    <button class="btn btn-outline-danger btn-sm reject-request-btn" type="button" data-id="${escapeHtml(request.id || "")}">
                        Reject
                    </button>
                </div>
            `;

            fragment.appendChild(card);
        });

        incomingRequestsList.appendChild(fragment);
    };

    const loadIncomingRequests = async () => {
        incomingStatus.textContent = "Loading incoming requests...";

        try {
            const response = await fetch("/api/collaboration/requests/incoming");
            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || "Unable to load incoming requests.");
            }

            renderIncomingRequests(data.requests || []);
            incomingStatus.textContent = `${(data.requests || []).length} pending request(s).`;
        } catch (error) {
            incomingStatus.textContent = error.message || "Could not load incoming requests.";
            incomingRequestsList.innerHTML = `
                <div class="placeholder-card">
                    <strong>Unable to load requests.</strong>
                    <p>Please refresh and try again.</p>
                </div>
            `;
        }
    };

    const updateConnectionRequest = async (button, action) => {
        const requestId = button.dataset.id;

        if (!requestId) {
            incomingStatus.textContent = "Request id not found. Please refresh and try again.";
            return;
        }

        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = action === "accept" ? "Accepting..." : "Rejecting...";

        try {
            const response = await fetch(`/api/collaboration/requests/${requestId}/${action}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                }
            });

            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || `Unable to ${action} request.`);
            }

            incomingStatus.textContent = data.message || `Request ${action}ed successfully.`;
            await loadIncomingRequests();
            await loadFriends();
        } catch (error) {
            button.disabled = false;
            button.textContent = originalText;
            incomingStatus.textContent = error.message || `Could not ${action} request.`;
        }
    };

    // --- My Friends ---
    const renderFriends = (friends) => {
        friendsList.innerHTML = "";

        if (!friends || friends.length === 0) {
            friendsList.innerHTML = `
                <div class="placeholder-card">
                    <strong>No friends yet.</strong>
                    <p>Accepted connection requests will appear here.</p>
                </div>
            `;
            return;
        }

        const fragment = document.createDocumentFragment();

        friends.forEach((friend) => {
            const card = document.createElement("button");
            card.className = "friend-card";
            card.type = "button";
            card.dataset.email = friend.email || "";
            card.dataset.name = friend.name || friend.email || "Study Planner User";

            if (selectedFriend && selectedFriend.email === friend.email) {
                card.classList.add("active");
            }

            const profileText = [friend.major, friend.institution].filter(Boolean).join(" · ");

            card.innerHTML = `
                <span class="friend-avatar">${escapeHtml((friend.name || friend.email || "S").charAt(0).toUpperCase())}</span>
                <span class="friend-details">
                    <strong>${escapeHtml(friend.name || "Study Planner User")}</strong>
                    <small>${escapeHtml(friend.email || "")}</small>
                    <small>${escapeHtml(profileText || "Friend")}</small>
                </span>
            `;

            fragment.appendChild(card);
        });

        friendsList.appendChild(fragment);
    };

    const loadFriends = async () => {
        friendsStatus.textContent = "Loading friends...";

        try {
            const response = await fetch("/api/collaboration/connections");
            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || "Unable to load friends.");
            }

            renderFriends(data.connections || []);
            friendsStatus.textContent = `${(data.connections || []).length} friend(s).`;
        } catch (error) {
            friendsStatus.textContent = error.message || "Could not load friends.";
            friendsList.innerHTML = `
                <div class="placeholder-card">
                    <strong>Unable to load friends.</strong>
                    <p>Please refresh and try again.</p>
                </div>
            `;
        }
    };

    const setSelectedFriend = async (friend) => {
        selectedFriend = friend;
        selectedGroup = null; // Deselect group when a friend is selected

        chatTitle.textContent = friend.name || "Friend Messages";
        chatSubtitle.textContent = friend.email || "Selected friend";
        messageInput.disabled = false;
        sendMessageBtn.disabled = false;
        refreshMessagesBtn.disabled = false;

        groupChatTitle.textContent = "Group Messages";
        groupChatSubtitle.textContent = "Select a group to start chatting.";
        groupMessageInput.disabled = true;
        sendGroupMessageBtn.disabled = true;
        refreshGroupMessagesBtn.disabled = true;

        document.querySelectorAll(".friend-card").forEach((card) => {
            card.classList.toggle("active", card.dataset.email === friend.email);
        });
        document.querySelectorAll(".group-card").forEach((card) => {
            card.classList.remove("active");
        });

        await loadMessages();
    };

    // --- Direct Messages ---
    const renderMessages = (messages) => {
        messagesList.innerHTML = "";

        if (!messages || messages.length === 0) {
            messagesList.innerHTML = `
                <div class="placeholder-card">
                    <strong>No messages yet.</strong>
                    <p>Send the first message to start the conversation.</p>
                </div>
            `;
            return;
        }

        const fragment = document.createDocumentFragment();

        messages.forEach((message) => {
            const bubble = document.createElement("article");
            bubble.className = message.is_mine ? "message-bubble mine" : "message-bubble theirs";

            bubble.innerHTML = `
                <p>${escapeHtml(message.body || "")}</p>
                <small>${escapeHtml(formatDateTime(message.created_at))}</small>
            `;

            fragment.appendChild(bubble);
        });

        messagesList.appendChild(fragment);
        messagesList.scrollTop = messagesList.scrollHeight;
    };

    const loadMessages = async () => {
        if (!selectedFriend || !selectedFriend.email) {
            messagesStatus.textContent = "No friend selected.";
            messagesList.innerHTML = `
                <div class="placeholder-card">
                    <strong>Select a friend.</strong>
                    <p>Your messages will appear here after you choose a friend from the My Friends list.</p>
                </div>
            `;
            return;
        }

        messagesStatus.textContent = "Loading messages...";

        try {
            const response = await fetch(`/api/collaboration/messages?friend_email=${encodeURIComponent(selectedFriend.email)}`);
            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || "Unable to load messages.");
            }

            renderMessages(data.messages || []);
            messagesStatus.textContent = `${(data.messages || []).length} message(s).`;
        } catch (error) {
            messagesStatus.textContent = error.message || "Could not load messages.";
            messagesList.innerHTML = `
                <div class="placeholder-card">
                    <strong>Unable to load messages.</strong>
                    <p>Please refresh and try again.</p>
                </div>
            `;
        }
    };

    const sendMessage = async () => {
        if (!selectedFriend || !selectedFriend.email) {
            messagesStatus.textContent = "Select a friend first.";
            return;
        }

        const body = messageInput.value.trim();

        if (!body) {
            messagesStatus.textContent = "Message cannot be empty.";
            return;
        }

        sendMessageBtn.disabled = true;
        sendMessageBtn.textContent = "Sending...";

        try {
            const response = await fetch("/api/collaboration/messages", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    receiver_email: selectedFriend.email,
                    body
                })
            });

            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || "Unable to send message.");
            }

            messageInput.value = "";
            messagesStatus.textContent = data.message || "Message sent successfully.";
            await loadMessages();
        } catch (error) {
            messagesStatus.textContent = error.message || "Could not send message.";
        } finally {
            sendMessageBtn.disabled = false;
            sendMessageBtn.textContent = "Send";
            messageInput.focus();
        }
    };

    // --- Study Groups ---
    const renderGroups = (groups) => {
        groupsList.innerHTML = "";

        if (!groups || groups.length === 0) {
            groupsList.innerHTML = `
                <div class="placeholder-card">
                    <strong>No study groups yet.</strong>
                    <p>Create a new group to start collaborating.</p>
                </div>
            `;
            return;
        }

        const fragment = document.createDocumentFragment();

        groups.forEach((group) => {
            const card = document.createElement("button");
            card.className = "group-card";
            card.type = "button";
            card.dataset.id = group.id || "";
            card.dataset.name = group.name || "Study Group";

            if (selectedGroup && selectedGroup.id === group.id) {
                card.classList.add("active");
            }

            card.innerHTML = `
                <span class="group-icon"><i class="bi bi-people"></i></span>
                <span class="group-details">
                    <strong>${escapeHtml(group.name || "Study Group")}</strong>
                    <small>${escapeHtml(group.description || "No description")}</small>
                </span>
            `;

            fragment.appendChild(card);
        });

        groupsList.appendChild(fragment);
    };

    const loadGroups = async () => {
        groupsStatus.textContent = "Loading groups...";

        try {
            const response = await fetch("/api/collaboration/groups");
            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || "Unable to load groups.");
            }

            renderGroups(data.groups || []);
            groupsStatus.textContent = `${(data.groups || []).length} group(s).`;
        } catch (error) {
            groupsStatus.textContent = error.message || "Could not load groups.";
            groupsList.innerHTML = `
                <div class="placeholder-card">
                    <strong>Unable to load groups.</strong>
                    <p>Please refresh and try again.</p>
                </div>
            `;
        }
    };

    const setSelectedGroup = async (group) => {
        selectedGroup = group;
        selectedFriend = null; // Deselect friend when a group is selected

        groupChatTitle.textContent = group.name || "Group Messages";
        groupChatSubtitle.textContent = group.description || "Selected group";
        groupMessageInput.disabled = false;
        sendGroupMessageBtn.disabled = false;
        refreshGroupMessagesBtn.disabled = false;

        chatTitle.textContent = "Friend Messages";
        chatSubtitle.textContent = "Select a friend to start messaging.";
        messageInput.disabled = true;
        sendMessageBtn.disabled = true;
        refreshMessagesBtn.disabled = true;

        document.querySelectorAll(".group-card").forEach((card) => {
            card.classList.toggle("active", card.dataset.id === group.id);
        });
        document.querySelectorAll(".friend-card").forEach((card) => {
            card.classList.remove("active");
        });

        await loadGroupMessages();
    };

    // --- Group Messages ---
    const renderGroupMessages = (messages) => {
        groupMessagesList.innerHTML = "";

        if (!messages || messages.length === 0) {
            groupMessagesList.innerHTML = `
                <div class="placeholder-card">
                    <strong>No group messages yet.</strong>
                    <p>Send the first message to start the group conversation.</p>
                </div>
            `;
            return;
        }

        const fragment = document.createDocumentFragment();

        messages.forEach((message) => {
            const bubble = document.createElement("article");
            bubble.className = message.is_mine ? "message-bubble mine" : "message-bubble theirs";

            const senderName = message.is_mine ? "You" : escapeHtml(message.sender_name || "Unknown User");

            bubble.innerHTML = `
                <small class="message-sender">${senderName}</small>
                <p>${escapeHtml(message.body || "")}</p>
                <small>${escapeHtml(formatDateTime(message.created_at))}</small>
            `;

            fragment.appendChild(bubble);
        });

        groupMessagesList.appendChild(fragment);
        groupMessagesList.scrollTop = groupMessagesList.scrollHeight;
    };

    const loadGroupMessages = async () => {
        if (!selectedGroup || !selectedGroup.id) {
            groupMessagesStatus.textContent = "No group selected.";
            groupMessagesList.innerHTML = `
                <div class="placeholder-card">
                    <strong>Select a group.</strong>
                    <p>Group messages will appear here after you choose a group from the My Study Groups list.</p>
                </div>
            `;
            return;
        }

        groupMessagesStatus.textContent = "Loading group messages...";

        try {
            const response = await fetch(`/api/collaboration/groups/${selectedGroup.id}/messages`);
            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || "Unable to load group messages.");
            }

            renderGroupMessages(data.messages || []);
            groupMessagesStatus.textContent = `${(data.messages || []).length} message(s).`;
        } catch (error) {
            groupMessagesStatus.textContent = error.message || "Could not load group messages.";
            groupMessagesList.innerHTML = `
                <div class="placeholder-card">
                    <strong>Unable to load group messages.</strong>
                    <p>Please refresh and try again.</p>
                </div>
            `;
        }
    };

    const sendGroupMessage = async () => {
        if (!selectedGroup || !selectedGroup.id) {
            groupMessagesStatus.textContent = "Select a group first.";
            return;
        }

        const body = groupMessageInput.value.trim();

        if (!body) {
            groupMessagesStatus.textContent = "Message cannot be empty.";
            return;
        }

        sendGroupMessageBtn.disabled = true;
        sendGroupMessageBtn.textContent = "Sending...";

        try {
            const response = await fetch(`/api/collaboration/groups/${selectedGroup.id}/messages`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ body })
            });

            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || "Unable to send group message.");
            }

            groupMessageInput.value = "";
            groupMessagesStatus.textContent = data.message || "Group message sent successfully.";
            await loadGroupMessages();
        } catch (error) {
            groupMessagesStatus.textContent = error.message || "Could not send group message.";
        } finally {
            sendGroupMessageBtn.disabled = false;
            sendGroupMessageBtn.textContent = "Send";
            groupMessageInput.focus();
        }
    };

    // --- Create Group Modal ---
    const loadFriendsForInvite = async () => {
        inviteFriendsList.innerHTML = "";
        try {
            const response = await fetch("/api/collaboration/connections");
            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || "Unable to load friends for invite.");
            }

            if (data.connections && data.connections.length > 0) {
                data.connections.forEach(friend => {
                    const div = document.createElement("div");
                    div.className = "form-check";
                    div.innerHTML = `
                        <input class="form-check-input" type="checkbox" value="${escapeHtml(friend.email)}" id="inviteFriend_${escapeHtml(friend.email)}">
                        <label class="form-check-label" for="inviteFriend_${escapeHtml(friend.email)}">
                            ${escapeHtml(friend.name || friend.email)}
                        </label>
                    `;
                    inviteFriendsList.appendChild(div);
                });
            } else {
                inviteFriendsList.innerHTML = 
                    `<p class="text-muted">You don't have any friends to invite yet. Connect with students first!</p>`;
            }
        } catch (error) {
            inviteFriendsList.innerHTML = 
                `<p class="text-danger">Error loading friends: ${escapeHtml(error.message)}</p>`;
        }
    };

    createGroupModal._element.addEventListener("show.bs.modal", loadFriendsForInvite);

    createGroupForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const groupName = groupNameInput.value.trim();
        const groupDescription = groupDescriptionInput.value.trim();
        const invitedFriends = Array.from(inviteFriendsList.querySelectorAll("input[type=\"checkbox\"]:checked"))
                                    .map(checkbox => checkbox.value);

        if (!groupName) {
            alert("Group name cannot be empty.");
            return;
        }

        try {
            const response = await fetch("/api/collaboration/groups", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    name: groupName,
                    description: groupDescription
                })
            });

            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || "Unable to create group.");
            }

            const newGroupId = data.group_id;

            // Invite selected friends
            for (const friendEmail of invitedFriends) {
                await fetch(`/api/collaboration/groups/${newGroupId}/invite`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ invitee_email: friendEmail })
                });
            }

            alert(data.message || "Group created successfully!");
            createGroupModal.hide();
            createGroupForm.reset();
            await loadGroups();
        } catch (error) {
            alert(error.message || "Could not create group.");
        }
    });

    // --- Event Listeners ---
    searchButton.addEventListener("click", loadUsers);

    searchInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            loadUsers();
        }
    });

    peopleList.addEventListener("click", (event) => {
        const button = event.target.closest(".connect-btn");

        if (button) {
            sendConnectionRequest(button);
        }
    });

    incomingRequestsList.addEventListener("click", (event) => {
        const acceptButton = event.target.closest(".accept-request-btn");
        const rejectButton = event.target.closest(".reject-request-btn");

        if (acceptButton) {
            updateConnectionRequest(acceptButton, "accept");
            return;
        }

        if (rejectButton) {
            updateConnectionRequest(rejectButton, "reject");
        }
    });

    friendsList.addEventListener("click", (event) => {
        const card = event.target.closest(".friend-card");

        if (!card) {
            return;
        }

        setSelectedFriend({
            email: card.dataset.email,
            name: card.dataset.name
        });
    });

    groupsList.addEventListener("click", (event) => {
        const card = event.target.closest(".group-card");

        if (!card) {
            return;
        }

        setSelectedGroup({
            id: card.dataset.id,
            name: card.dataset.name
        });
    });

    refreshIncomingBtn.addEventListener("click", loadIncomingRequests);
    refreshFriendsBtn.addEventListener("click", loadFriends);
    refreshMessagesBtn.addEventListener("click", loadMessages);
    refreshGroupsBtn.addEventListener("click", loadGroups);
    refreshGroupMessagesBtn.addEventListener("click", loadGroupMessages);

    messageForm.addEventListener("submit", (event) => {
        event.preventDefault();
        sendMessage();
    });

    groupMessageForm.addEventListener("submit", (event) => {
        event.preventDefault();
        sendGroupMessage();
    });

    // Initial loads
    loadUsers();
    loadIncomingRequests();
    loadFriends();
    loadGroups();
});
