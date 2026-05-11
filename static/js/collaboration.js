document.addEventListener('DOMContentLoaded', () => {
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
    const messagesStatus = document.getElementById('messagesStatus');
    const messagesList = document.getElementById('messagesList');
    const refreshMessagesBtn = document.getElementById('refreshMessagesBtn');
    const messageForm = document.getElementById('messageForm');
    const messageInput = document.getElementById('messageInput');
    const sendMessageBtn = document.getElementById('sendMessageBtn');

    if (
        !searchInput || !searchButton || !peopleList || !peopleStatus ||
        !incomingRequestsList || !incomingStatus || !refreshIncomingBtn ||
        !friendsList || !friendsStatus || !refreshFriendsBtn ||
        !chatTitle || !chatSubtitle || !messagesStatus || !messagesList ||
        !refreshMessagesBtn || !messageForm || !messageInput || !sendMessageBtn
    ) {
        return;
    }

    let selectedFriend = null;

    const escapeHtml = (value) => {
        const div = document.createElement('div');
        div.textContent = value || '';
        return div.innerHTML;
    };

    const formatDateTime = (isoValue) => {
        if (!isoValue) {
            return '';
        }

        const date = new Date(isoValue);

        if (Number.isNaN(date.getTime())) {
            return '';
        }

        return date.toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const renderUsers = (users) => {
        peopleList.innerHTML = '';

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
            const card = document.createElement('article');
            card.className = 'person-card';

            const profileText = [user.major, user.institution].filter(Boolean).join(' · ');

            card.innerHTML = `
                <div class="person-info">
                    <p class="person-name">${escapeHtml(user.name || 'Study Planner User')}</p>
                    <p class="person-email">${escapeHtml(user.email || '')}</p>
                    <p class="person-meta">${escapeHtml(profileText || 'Student')}</p>
                </div>
                <button class="btn btn-primary btn-sm connect-btn" type="button" data-email="${escapeHtml(user.email || '')}">
                    Connect
                </button>
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

            if (!response.ok || data.error) {
                throw new Error(data.error || 'Unable to load users.');
            }

            renderUsers(data.users || []);
            peopleStatus.textContent = `${(data.users || []).length} student(s) found.`;
        } catch (error) {
            peopleStatus.textContent = error.message || 'Could not load users.';
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
            peopleStatus.textContent = 'User email not found. Please refresh and try again.';
            return;
        }

        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = 'Sending...';

        try {
            const response = await fetch('/api/collaboration/requests', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ receiver_email: receiverEmail })
            });

            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || 'Unable to send request.');
            }

            button.textContent = 'Request Sent';
            peopleStatus.textContent = data.message || 'Connection request sent successfully.';
            await loadIncomingRequests();
            await loadFriends();
        } catch (error) {
            button.disabled = false;
            button.textContent = originalText;
            peopleStatus.textContent = error.message || 'Could not send request.';
        }
    };

    const renderIncomingRequests = (requests) => {
        incomingRequestsList.innerHTML = '';

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
            const card = document.createElement('article');
            card.className = 'request-card';

            const profileText = [request.requester_major, request.requester_institution].filter(Boolean).join(' · ');

            card.innerHTML = `
                <div class="request-info">
                    <p class="person-name">${escapeHtml(request.requester_name || 'Study Planner User')}</p>
                    <p class="person-email">${escapeHtml(request.requester_email || '')}</p>
                    <p class="person-meta">${escapeHtml(profileText || 'Wants to connect with you')}</p>
                </div>
                <div class="request-actions">
                    <button class="btn btn-primary btn-sm accept-request-btn" type="button" data-id="${escapeHtml(request.id || '')}">
                        Accept
                    </button>
                    <button class="btn btn-outline-danger btn-sm reject-request-btn" type="button" data-id="${escapeHtml(request.id || '')}">
                        Reject
                    </button>
                </div>
            `;

            fragment.appendChild(card);
        });

        incomingRequestsList.appendChild(fragment);
    };

    const loadIncomingRequests = async () => {
        incomingStatus.textContent = 'Loading incoming requests...';

        try {
            const response = await fetch('/api/collaboration/requests/incoming');
            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || 'Unable to load incoming requests.');
            }

            renderIncomingRequests(data.requests || []);
            incomingStatus.textContent = `${(data.requests || []).length} pending request(s).`;
        } catch (error) {
            incomingStatus.textContent = error.message || 'Could not load incoming requests.';
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
            incomingStatus.textContent = 'Request id not found. Please refresh and try again.';
            return;
        }

        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = action === 'accept' ? 'Accepting...' : 'Rejecting...';

        try {
            const response = await fetch(`/api/collaboration/requests/${requestId}/${action}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
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

    const renderFriends = (friends) => {
        friendsList.innerHTML = '';

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
            const card = document.createElement('button');
            card.className = 'friend-card';
            card.type = 'button';
            card.dataset.email = friend.email || '';
            card.dataset.name = friend.name || friend.email || 'Study Planner User';

            if (selectedFriend && selectedFriend.email === friend.email) {
                card.classList.add('active');
            }

            const profileText = [friend.major, friend.institution].filter(Boolean).join(' · ');

            card.innerHTML = `
                <span class="friend-avatar">${escapeHtml((friend.name || friend.email || 'S').charAt(0).toUpperCase())}</span>
                <span class="friend-details">
                    <strong>${escapeHtml(friend.name || 'Study Planner User')}</strong>
                    <small>${escapeHtml(friend.email || '')}</small>
                    <small>${escapeHtml(profileText || 'Friend')}</small>
                </span>
            `;

            fragment.appendChild(card);
        });

        friendsList.appendChild(fragment);
    };

    const loadFriends = async () => {
        friendsStatus.textContent = 'Loading friends...';

        try {
            const response = await fetch('/api/collaboration/connections');
            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || 'Unable to load friends.');
            }

            renderFriends(data.connections || []);
            friendsStatus.textContent = `${(data.connections || []).length} friend(s).`;
        } catch (error) {
            friendsStatus.textContent = error.message || 'Could not load friends.';
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
        chatTitle.textContent = friend.name || 'Friend Messages';
        chatSubtitle.textContent = friend.email || 'Selected friend';
        messageInput.disabled = false;
        sendMessageBtn.disabled = false;
        refreshMessagesBtn.disabled = false;

        document.querySelectorAll('.friend-card').forEach((card) => {
            card.classList.toggle('active', card.dataset.email === friend.email);
        });

        await loadMessages();
    };

    const renderMessages = (messages) => {
        messagesList.innerHTML = '';

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
            const bubble = document.createElement('article');
            bubble.className = message.is_mine ? 'message-bubble mine' : 'message-bubble theirs';

            bubble.innerHTML = `
                <p>${escapeHtml(message.body || '')}</p>
                <small>${escapeHtml(formatDateTime(message.created_at))}</small>
            `;

            fragment.appendChild(bubble);
        });

        messagesList.appendChild(fragment);
        messagesList.scrollTop = messagesList.scrollHeight;
    };

    const loadMessages = async () => {
        if (!selectedFriend || !selectedFriend.email) {
            messagesStatus.textContent = 'No friend selected.';
            return;
        }

        messagesStatus.textContent = 'Loading messages...';

        try {
            const response = await fetch(`/api/collaboration/messages?friend_email=${encodeURIComponent(selectedFriend.email)}`);
            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || 'Unable to load messages.');
            }

            renderMessages(data.messages || []);
            messagesStatus.textContent = `${(data.messages || []).length} message(s).`;
        } catch (error) {
            messagesStatus.textContent = error.message || 'Could not load messages.';
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
            messagesStatus.textContent = 'Select a friend first.';
            return;
        }

        const body = messageInput.value.trim();

        if (!body) {
            messagesStatus.textContent = 'Message cannot be empty.';
            return;
        }

        sendMessageBtn.disabled = true;
        sendMessageBtn.textContent = 'Sending...';

        try {
            const response = await fetch('/api/collaboration/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    receiver_email: selectedFriend.email,
                    body
                })
            });

            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || 'Unable to send message.');
            }

            messageInput.value = '';
            messagesStatus.textContent = data.message || 'Message sent successfully.';
            await loadMessages();
        } catch (error) {
            messagesStatus.textContent = error.message || 'Could not send message.';
        } finally {
            sendMessageBtn.disabled = false;
            sendMessageBtn.textContent = 'Send';
            messageInput.focus();
        }
    };

    searchButton.addEventListener('click', loadUsers);

    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            loadUsers();
        }
    });

    peopleList.addEventListener('click', (event) => {
        const button = event.target.closest('.connect-btn');

        if (button) {
            sendConnectionRequest(button);
        }
    });

    incomingRequestsList.addEventListener('click', (event) => {
        const acceptButton = event.target.closest('.accept-request-btn');
        const rejectButton = event.target.closest('.reject-request-btn');

        if (acceptButton) {
            updateConnectionRequest(acceptButton, 'accept');
            return;
        }

        if (rejectButton) {
            updateConnectionRequest(rejectButton, 'reject');
        }
    });

    friendsList.addEventListener('click', (event) => {
        const card = event.target.closest('.friend-card');

        if (!card) {
            return;
        }

        setSelectedFriend({
            email: card.dataset.email,
            name: card.dataset.name
        });
    });

    refreshIncomingBtn.addEventListener('click', loadIncomingRequests);
    refreshFriendsBtn.addEventListener('click', loadFriends);
    refreshMessagesBtn.addEventListener('click', loadMessages);

    messageForm.addEventListener('submit', (event) => {
        event.preventDefault();
        sendMessage();
    });

    loadUsers();
    loadIncomingRequests();
    loadFriends();
});
