document.addEventListener('DOMContentLoaded', () => {

    // ==================== DOM ELEMENTS ====================
    const searchInput = document.getElementById('userSearch');
    const searchButton = document.getElementById('searchUsersBtn');
    const peopleList = document.getElementById('peopleList');
    const peopleStatus = document.getElementById('peopleStatus');

    const incomingRequestsList = document.getElementById('incomingRequestsList');
    const incomingStatus = document.getElementById('incomingStatus');
    const refreshIncomingBtn = document.getElementById('refreshIncomingBtn');

    const friendsList = document.getElementById('friendsList');
    const friendsStatus = document.getElementById('friendsStatus');
    const refreshFriendsBtn = document.getElementById('refreshFriendsBtn');

    const chatTitle = document.getElementById('chatTitle');
    const chatSubtitle = document.getElementById('chatSubtitle');
    const messagesList = document.getElementById('messagesList');
    const messagesStatus = document.getElementById('messagesStatus');
    const messageForm = document.getElementById('messageForm');
    const messageInput = document.getElementById('messageInput');
    const sendMessageBtn = document.getElementById('sendMessageBtn');
    const refreshMessagesBtn = document.getElementById('refreshMessagesBtn');

    // Group Elements
    const groupsList = document.getElementById('groupsList');
    const groupsStatus = document.getElementById('groupsStatus');
    const refreshGroupsBtn = document.getElementById('refreshGroupsBtn');

    const groupChatTitle = document.getElementById('groupChatTitle');
    const groupChatSubtitle = document.getElementById('groupChatSubtitle');
    const groupMessagesList = document.getElementById('groupMessagesList');
    const groupMessagesStatus = document.getElementById('groupMessagesStatus');
    const groupMessageForm = document.getElementById('groupMessageForm');
    const groupMessageInput = document.getElementById('groupMessageInput');
    const sendGroupMessageBtn = document.getElementById('sendGroupMessageBtn');

    const createGroupModalEl = document.getElementById('createGroupModal');
    const createGroupForm = document.getElementById('createGroupForm');

    let selectedFriend = null;
    let selectedGroup = null;


    const formatDateTime = (isoValue) => {
        if (!isoValue) return '';
        const date = new Date(isoValue);
        if (isNaN(date.getTime())) return '';
        return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const escapeHtml = (value) => {
        const div = document.createElement('div');
        div.textContent = value || '';
        return div.innerHTML;
    };

    // ==================== CREATE GROUP ====================
    if (createGroupForm) {
        createGroupForm.onsubmit = async (e) => {
            e.preventDefault();

            const name = document.getElementById('groupName').value.trim();
            const description = document.getElementById('groupDescription').value.trim();

            if (!name) {
                alert("Please enter a group name!");
                return;
            }

            try {
                const res = await fetch('/api/collaboration/groups', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, description })
                });

                if (res.ok) {
                    // Close modal safely
                    if (typeof bootstrap !== 'undefined') {
                        const modal = bootstrap.Modal.getInstance(createGroupModalEl);
                        if (modal) modal.hide();
                    }
                    createGroupModalEl.style.display = 'none';
                    document.body.classList.remove('modal-open');
                    const backdrops = document.querySelectorAll('.modal-backdrop');
                    backdrops.forEach(b => b.remove());

                    createGroupForm.reset();
                    loadGroups();
                } else {
                    const err = await res.json().catch(() => ({}));
                    alert(err.error || "Failed to create group");
                }
            } catch (err) {
                console.error(err);
                alert("Connection error. Please try again.");
            }
        };
    }

    // ==================== LOAD GROUPS ====================
    const loadGroups = async () => {
        if (!groupsStatus) return;
        groupsStatus.textContent = 'Loading groups...';

        try {
            const res = await fetch('/api/collaboration/groups');
            const data = await res.json();

            groupsList.innerHTML = '';

            if (data.groups && data.groups.length > 0) {
                data.groups.forEach(group => {
                    const card = document.createElement('button');
                    card.className = `friend-card group-card`;
                    card.innerHTML = `
                        <span class="friend-avatar" style="background:#764ba2;">G</span>
                        <span class="friend-details">
                            <strong>${escapeHtml(group.name)}</strong>
                            <small>${escapeHtml(group.description || 'Study Group')}</small>
                        </span>
                    `;
                    card.onclick = () => setSelectedGroup(group);
                    groupsList.appendChild(card);
                });
            } else {
                groupsList.innerHTML = `<p class="text-muted">No groups yet. Create your first group!</p>`;
            }
            groupsStatus.textContent = '';
        } catch (e) {
            console.error(e);
            groupsStatus.textContent = "Error loading groups.";
        }
    };

    const setSelectedGroup = (group) => {
        selectedGroup = group;
        groupChatTitle.textContent = group.name;
        groupChatSubtitle.textContent = "Group Discussion";
        groupMessageInput.disabled = false;
        sendGroupMessageBtn.disabled = false;
        loadGroupMessages();
    };

    const loadGroupMessages = async () => {
        if (!selectedGroup) return;
        groupMessagesStatus.textContent = 'Loading messages...';

        try {
            const res = await fetch(`/api/collaboration/groups/${selectedGroup.id}/messages`);
            const data = await res.json();

            groupMessagesList.innerHTML = '';
            data.messages.forEach(msg => {
                const div = document.createElement('div');
                div.className = `message-bubble ${msg.is_mine ? 'sent' : 'received'}`;
                div.innerHTML = `
                    <small><strong>${escapeHtml(msg.sender_name || 'Member')}</strong></small>
                    <p>${escapeHtml(msg.body)}</p>
                    <small>${formatDateTime(msg.created_at)}</small>
                `;
                groupMessagesList.appendChild(div);
            });
            groupMessagesList.scrollTop = groupMessagesList.scrollHeight;
            groupMessagesStatus.textContent = '';
        } catch (e) {
            groupMessagesStatus.textContent = "Error loading group messages.";
        }
    };

    // ==================== YOUR ORIGINAL WORKING CODE ====================
    const renderUsers = (users) => {
        peopleList.innerHTML = '';
        if (!users || users.length === 0) {
            peopleList.innerHTML = `<div class="placeholder-card"><strong>No students found.</strong><p>Try searching by a different name or email.</p></div>`;
            return;
        }
        const fragment = document.createDocumentFragment();
        users.forEach((user) => {
            const card = document.createElement('article');
            card.className = 'person-card';
            const profileText = [user.major, user.institution].filter(Boolean).join(' · ');
            card.innerHTML = `
                <div class="person-info">
                    <p class="person-name">${escapeHtml(user.name || 'Study Planner User')}</p>
                    <p class="person-email">${escapeHtml(user.email || '')}</p>
                    <p class="person-meta">${escapeHtml(profileText || 'Student')}</p>
                </div>
                <button class="btn btn-primary btn-sm connect-btn" type="button" data-email="${escapeHtml(user.email || '')}">Connect</button>
            `;
            fragment.appendChild(card);
        });
        peopleList.appendChild(fragment);
    };

    const loadUsers = async () => {
        const query = searchInput.value.trim();
        const url = query ? `/api/collaboration/users?q=${encodeURIComponent(query)}` : '/api/collaboration/users';
        peopleStatus.textContent = 'Loading users...';
        try {
            const response = await fetch(url);
            const data = await response.json();
            renderUsers(data.users || []);
            peopleStatus.textContent = `${(data.users || []).length} student(s) found.`;
        } catch (error) {
            peopleStatus.textContent = 'Could not load users.';
        }
    };

    const sendConnectionRequest = async (button) => {
        const receiverEmail = button.dataset.email;
        if (!receiverEmail) return;

        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = 'Sending...';

        try {
            const response = await fetch('/api/collaboration/requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ receiver_email: receiverEmail })
            });
            const data = await response.json();

            if (response.ok) {
                button.textContent = 'Request Sent';
                await loadIncomingRequests();
                await loadFriends();
            } else {
                alert(data.error || 'Failed to send request');
                button.textContent = originalText;
                button.disabled = false;
            }
        } catch (error) {
            button.textContent = originalText;
            button.disabled = false;
        }
    };

    const renderIncomingRequests = (requests) => {
        incomingRequestsList.innerHTML = '';
        if (!requests || requests.length === 0) {
            incomingRequestsList.innerHTML = `<div class="placeholder-card"><strong>No incoming requests.</strong></div>`;
            return;
        }
        const fragment = document.createDocumentFragment();
        requests.forEach((request) => {
            const card = document.createElement('article');
            card.className = 'request-card';
            card.innerHTML = `
                <div class="request-info">
                    <p class="person-name">${escapeHtml(request.requester_name || 'User')}</p>
                    <p class="person-email">${escapeHtml(request.requester_email)}</p>
                </div>
                <div class="request-actions">
                    <button class="btn btn-primary btn-sm accept-request-btn" data-id="${request.id}">Accept</button>
                    <button class="btn btn-outline-danger btn-sm reject-request-btn" data-id="${request.id}">Reject</button>
                </div>
            `;
            fragment.appendChild(card);
        });
        incomingRequestsList.appendChild(fragment);
    };

    const loadIncomingRequests = async () => {
        incomingStatus.textContent = 'Loading...';
        try {
            const res = await fetch('/api/collaboration/requests/incoming');
            const data = await res.json();
            renderIncomingRequests(data.requests || []);
        } catch (e) {
            incomingStatus.textContent = "Error loading requests.";
        }
    };

    const updateConnectionRequest = async (button, action) => {
        const requestId = button.dataset.id;
        if (!requestId) return;

        button.disabled = true;
        button.textContent = action === 'accept' ? 'Accepting...' : 'Rejecting...';

        try {
            await fetch(`/api/collaboration/requests/${requestId}/${action}`, { method: 'POST' });
            await loadIncomingRequests();
            await loadFriends();
        } catch (e) {
            console.error(e);
        }
    };

    const renderFriends = (friends) => {
        friendsList.innerHTML = '';
        if (!friends || friends.length === 0) {
            friendsList.innerHTML = `<div class="placeholder-card"><strong>No friends yet.</strong></div>`;
            return;
        }
        const fragment = document.createDocumentFragment();
        friends.forEach(friend => {
            const card = document.createElement('button');
            card.className = 'friend-card';
            card.dataset.email = friend.email;
            card.dataset.name = friend.name;
            card.innerHTML = `
                <span class="friend-avatar">${escapeHtml(friend.name?.charAt(0) || 'F')}</span>
                <span class="friend-details">
                    <strong>${escapeHtml(friend.name)}</strong>
                    <small>${escapeHtml(friend.email)}</small>
                </span>
            `;
            card.onclick = () => setSelectedFriend(friend);
            fragment.appendChild(card);
        });
        friendsList.appendChild(fragment);
    };

    const loadFriends = async () => {
        friendsStatus.textContent = 'Loading friends...';
        try {
            const res = await fetch('/api/collaboration/connections');
            const data = await res.json();
            renderFriends(data.connections || []);
        } catch (e) {
            friendsStatus.textContent = "Error loading friends.";
        }
    };

    const setSelectedFriend = async (friend) => {
        selectedFriend = friend;
        chatTitle.textContent = friend.name || 'Friend';
        chatSubtitle.textContent = friend.email || '';
        messageInput.disabled = false;
        sendMessageBtn.disabled = false;
        await loadMessages();
    };

    const renderMessages = (messages) => {
        messagesList.innerHTML = '';
        if (!messages || messages.length === 0) {
            messagesList.innerHTML = `<div class="placeholder-card"><strong>No messages yet.</strong></div>`;
            return;
        }
        messages.forEach(msg => {
            const div = document.createElement('div');
            div.className = `message-bubble ${msg.is_mine ? 'sent' : 'received'}`;
            div.innerHTML = `<p>${escapeHtml(msg.body)}</p><small>${formatDateTime(msg.created_at)}</small>`;
            messagesList.appendChild(div);
        });
        messagesList.scrollTop = messagesList.scrollHeight;
    };

    const loadMessages = async () => {
        if (!selectedFriend) return;
        messagesStatus.textContent = 'Loading...';
        try {
            const res = await fetch(`/api/collaboration/messages?friend_email=${encodeURIComponent(selectedFriend.email)}`);
            const data = await res.json();
            renderMessages(data.messages || []);
        } catch (e) {
            messagesStatus.textContent = "Error loading messages.";
        }
    };

    const sendMessage = async () => {
        if (!selectedFriend) return;
        const body = messageInput.value.trim();
        if (!body) return;

        try {
            await fetch('/api/collaboration/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ receiver_email: selectedFriend.email, body })
            });
            messageInput.value = '';
            loadMessages();
        } catch (e) {
            console.error(e);
        }
    };

    // ==================== EVENT LISTENERS ====================
    searchButton?.addEventListener('click', loadUsers);
    searchInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadUsers(); });

    peopleList?.addEventListener('click', (e) => {
        const btn = e.target.closest('.connect-btn');
        if (btn) sendConnectionRequest(btn);
    });

    incomingRequestsList?.addEventListener('click', (e) => {
        const accept = e.target.closest('.accept-request-btn');
        const reject = e.target.closest('.reject-request-btn');
        if (accept) updateConnectionRequest(accept, 'accept');
        if (reject) updateConnectionRequest(reject, 'reject');
    });

    friendsList?.addEventListener('click', (e) => {
        const card = e.target.closest('.friend-card');
        if (card) setSelectedFriend({ email: card.dataset.email, name: card.dataset.name });
    });

    refreshIncomingBtn?.addEventListener('click', loadIncomingRequests);
    refreshFriendsBtn?.addEventListener('click', loadFriends);
    refreshMessagesBtn?.addEventListener('click', loadMessages);
    messageForm?.addEventListener('submit', (e) => { e.preventDefault(); sendMessage(); });

    refreshGroupsBtn?.addEventListener('click', loadGroups);

    // ==================== INITIAL LOAD ====================
    loadUsers();
    loadIncomingRequests();
    loadFriends();
    loadGroups();
});