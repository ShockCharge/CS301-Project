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
    const directChatPopup = document.getElementById('directChatPopup');
    const closeDirectChatBtn = document.getElementById('closeDirectChatBtn');
    const directChatAvatar = document.getElementById('directChatAvatar');

    // Group Elements
    const groupsList = document.getElementById('groupsList');
    const groupsStatus = document.getElementById('groupsStatus');
    const refreshGroupsBtn = document.getElementById('refreshGroupsBtn');
    const groupChatShell = document.getElementById('groupChatShell');

    const groupChatTitle = document.getElementById('groupChatTitle');
    const groupChatSubtitle = document.getElementById('groupChatSubtitle');
    const groupMessagesList = document.getElementById('groupMessagesList');
    const groupMessagesStatus = document.getElementById('groupMessagesStatus');
    const groupMessageForm = document.getElementById('groupMessageForm');
    const groupMessageInput = document.getElementById('groupMessageInput');
    const sendGroupMessageBtn = document.getElementById('sendGroupMessageBtn');
    const groupMembersBox = document.getElementById('groupMembersBox');
    const groupMembersList = document.getElementById('groupMembersList');
    const groupMembersStatus = document.getElementById('groupMembersStatus');
    const groupMemberSelect = document.getElementById('groupMemberSelect');
    const addGroupMemberBtn = document.getElementById('addGroupMemberBtn');

    const openCreateGroupBtn = document.getElementById('openCreateGroupBtn');
    const cancelCreateGroupBtn = document.getElementById('cancelCreateGroupBtn');
    const createGroupBox = document.getElementById('createGroupBox');
    const createGroupForm = document.getElementById('createGroupForm');
    const refreshGroupMessagesBtn = document.getElementById('refreshGroupMessagesBtn');
    const closeGroupChatBtn = document.getElementById('closeGroupChatBtn');

    let selectedFriend = null;
    let selectedGroup = null;
    let acceptedFriends = [];
    let selectedGroupMembers = [];

    // ==================== HELPER FUNCTIONS ====================
    const formatDateTime = (isoValue) => {
        if (!isoValue) return '';
        const date = new Date(isoValue);
        if (isNaN(date.getTime())) return '';
        return date.toLocaleString([], { 
            month: 'short', 
            day: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    };

    const escapeHtml = (value) => {
        const div = document.createElement('div');
        div.textContent = value || '';
        return div.innerHTML;
    };

    const isSafeImageDataUrl = (value) => typeof value === 'string' && value.startsWith('data:image/');

    const renderAvatar = (profile, className = 'friend-avatar') => {
        const name = profile?.name || profile?.requester_name || profile?.sender_name || 'User';
        const picture = profile?.profile_picture || profile?.requester_profile_picture || profile?.sender_profile_picture || '';
        if (isSafeImageDataUrl(picture)) {
            return `<span class="${className} image-avatar"><img src="${picture}" alt="${escapeHtml(name)} profile picture"></span>`;
        }
        return `<span class="${className}">${escapeHtml(name.charAt(0).toUpperCase() || 'U')}</span>`;
    };

    const moveFocusOutOfPopup = (popup) => {
        if (!popup || !popup.contains(document.activeElement)) return;
        const activeFriend = document.querySelector('#friendsList .friend-card.active');
        const activeGroup = document.querySelector('#groupsList .group-card.active');
        const fallbackFocus = activeFriend || activeGroup || document.querySelector('.main-content') || document.body;
        if (typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
        }
        if (fallbackFocus && fallbackFocus !== document.body && typeof fallbackFocus.focus === 'function') {
            fallbackFocus.focus({ preventScroll: true });
        }
    };

    const openDirectChatPopup = () => {
        moveFocusOutOfPopup(groupChatShell);
        directChatPopup?.classList.add('open');
        directChatPopup?.setAttribute('aria-hidden', 'false');
        groupChatShell?.classList.remove('open');
        groupChatShell?.setAttribute('aria-hidden', 'true');
        document.querySelectorAll('#groupsList .group-card').forEach(card => card.classList.remove('active'));
        setTimeout(() => messageInput?.focus(), 120);
    };

    const openGroupChatPopup = () => {
        moveFocusOutOfPopup(directChatPopup);
        groupChatShell?.classList.add('open');
        groupChatShell?.setAttribute('aria-hidden', 'false');
        directChatPopup?.classList.remove('open');
        directChatPopup?.setAttribute('aria-hidden', 'true');
        document.querySelectorAll('#friendsList .friend-card').forEach(card => card.classList.remove('active'));
        setTimeout(() => groupMessageInput?.focus(), 120);
    };

    const closeDirectChatPopup = () => {
        moveFocusOutOfPopup(directChatPopup);
        directChatPopup?.classList.remove('open');
        directChatPopup?.setAttribute('aria-hidden', 'true');
        document.querySelectorAll('#friendsList .friend-card').forEach(card => card.classList.remove('active'));
    };

    const closeGroupChatPopup = () => {
        moveFocusOutOfPopup(groupChatShell);
        groupChatShell?.classList.remove('open');
        groupChatShell?.setAttribute('aria-hidden', 'true');
        document.querySelectorAll('#groupsList .group-card').forEach(card => card.classList.remove('active'));
    };

    // ==================== CREATE GROUP ====================
    if (createGroupForm) {
        createGroupForm.addEventListener('submit', async (e) => {
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

                const data = await res.json().catch(() => ({}));
                if (res.ok) {
                    createGroupForm.reset();
                    if (createGroupBox) createGroupBox.style.display = 'none';
                    await loadGroups();
                    if (data.group) setSelectedGroup(data.group);
                } else {
                    alert(data.error || "Failed to create group");
                }
            } catch (err) {
                console.error(err);
                alert("Connection error. Please try again.");
            }
        });
    }

    // ==================== GROUPS ====================
    const loadGroups = async () => {
        if (!groupsStatus) return;
        groupsStatus.textContent = 'Loading groups...';

        try {
            const res = await fetch('/api/collaboration/groups');
            const data = await res.json();

            groupsList.innerHTML = '';
            if (data.groups && data.groups.length > 0) {
                const unreadGroups = data.groups.filter(group => Number(group.unread_count || 0) > 0);
                groupsStatus.textContent = unreadGroups.length > 0
                    ? `${unreadGroups.length} group(s) have unread messages.`
                    : '';
                data.groups.forEach(group => {
                    const card = document.createElement('button');
                    const unreadCount = Number(group.unread_count || 0);
                    card.className = `friend-card group-card${unreadCount > 0 ? ' unread-card' : ''}`;
                    card.dataset.id = group.id;
                    card.dataset.name = group.name;
                    card.dataset.description = group.description || '';
                    card.innerHTML = `
                        <span class="friend-avatar" style="background:#764ba2;">G</span>
                        <span class="friend-details">
                            <strong>${escapeHtml(group.name)}</strong>
                            <small>${escapeHtml(group.description || 'Study Group')} • ${group.member_count || 1} member(s)</small>
                        </span>
                        ${unreadCount > 0 ? `<span class="conversation-unread-badge" title="Unread group messages">${unreadCount}</span>` : ''}
                    `;
                    groupsList.appendChild(card);
                });
                if (selectedGroup?.id) {
                    document.querySelector(`#groupsList .group-card[data-id="${CSS.escape(selectedGroup.id || '')}"]`)?.classList.add('active');
                }
            } else {
                groupsStatus.textContent = '';
                groupsList.innerHTML = `<p class="text-muted">No groups yet. Create your first group!</p>`;
            }
        } catch (e) {
            console.error(e);
            groupsStatus.textContent = "Error loading groups.";
        }
    };

    const setSelectedGroup = (group) => {
        selectedGroup = group;
        document.querySelectorAll('#groupsList .group-card').forEach(card => card.classList.remove('active'));
        document.querySelector(`#groupsList .group-card[data-id="${CSS.escape(group.id || '')}"]`)?.classList.add('active');
        groupChatTitle.textContent = group.name;
        groupChatSubtitle.textContent = "Group Discussion";
        groupMessageInput.disabled = false;
        sendGroupMessageBtn.disabled = false;
        if (refreshGroupMessagesBtn) refreshGroupMessagesBtn.disabled = false;
        openGroupChatPopup();
        if (groupMembersBox) groupMembersBox.style.display = 'block';
        if (groupMemberSelect) groupMemberSelect.disabled = false;
        if (addGroupMemberBtn) addGroupMemberBtn.disabled = false;
        populateGroupMemberSelect();
        loadGroupMembers();
        loadGroupMessages();
    };

    const renderGroupMembers = (members) => {
        selectedGroupMembers = members || [];
        if (!groupMembersList) return;
        if (!selectedGroupMembers.length) {
            groupMembersList.innerHTML = '<span class="text-muted">No members found.</span>';
            return;
        }
        groupMembersList.innerHTML = selectedGroupMembers.map(member => `
            <span class="badge bg-secondary me-1 mb-1">${escapeHtml(member.name || member.email)} (${escapeHtml(member.role || 'member')})</span>
        `).join('');
        populateGroupMemberSelect();
    };

    const loadGroupMembers = async () => {
        if (!selectedGroup || !groupMembersStatus) return;
        groupMembersStatus.textContent = 'Loading...';
        try {
            const res = await fetch(`/api/collaboration/groups/${selectedGroup.id}/members`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                groupMembersStatus.textContent = data.error || 'Could not load members.';
                return;
            }
            renderGroupMembers(data.members || []);
            groupMembersStatus.textContent = `${(data.members || []).length} member(s)`;
        } catch (e) {
            console.error(e);
            groupMembersStatus.textContent = 'Error loading members.';
        }
    };

    const populateGroupMemberSelect = () => {
        if (!groupMemberSelect) return;
        const memberEmails = new Set((selectedGroupMembers || []).map(m => (m.email || '').toLowerCase()));
        const availableFriends = (acceptedFriends || []).filter(friend => !memberEmails.has((friend.email || '').toLowerCase()));
        groupMemberSelect.innerHTML = '<option value="">Select a friend to add...</option>';
        availableFriends.forEach(friend => {
            const option = document.createElement('option');
            option.value = friend.email;
            option.textContent = `${friend.name || friend.email} (${friend.email})`;
            groupMemberSelect.appendChild(option);
        });
        if (!availableFriends.length) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = selectedGroup ? 'No available friends to add' : 'Select a group first';
            groupMemberSelect.appendChild(option);
        }
    };

    const addGroupMember = async () => {
        if (!selectedGroup || !groupMemberSelect) return;
        const userEmail = groupMemberSelect.value;
        if (!userEmail) {
            alert('Please select a friend to add.');
            return;
        }
        try {
            const res = await fetch(`/api/collaboration/groups/${selectedGroup.id}/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_email: userEmail })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(data.error || 'Failed to add member.');
                return;
            }
            groupMemberSelect.value = '';
            await loadGroupMembers();
            await loadGroups();
            alert('Member added successfully.');
        } catch (e) {
            console.error(e);
            alert('Connection error while adding member.');
        }
    };

    const loadGroupMessages = async () => {
        if (!selectedGroup) return;
        groupMessagesStatus.textContent = 'Loading messages...';

        try {
            const res = await fetch(`/api/collaboration/groups/${selectedGroup.id}/messages`);
            const data = await res.json();

            groupMessagesList.innerHTML = '';
            (data.messages || []).forEach(msg => {
                const div = document.createElement('div');
                div.className = `message-bubble ${msg.is_mine ? 'sent' : 'received'}`;
                div.innerHTML = `
                    <small><strong>${escapeHtml(msg.sender_name || 'Member')}</strong></small>
                    <p>${escapeHtml(msg.body)}</p>
                    <small>${formatDateTime(msg.created_at)}</small>
                    ${msg.is_mine ? `<button class="message-delete-btn" type="button" data-message-id="${escapeHtml(msg.id)}" data-message-type="group" title="Delete message" aria-label="Delete message"><i class="bi bi-trash3"></i></button>` : ''}
                `;
                groupMessagesList.appendChild(div);
            });
            groupMessagesList.scrollTop = groupMessagesList.scrollHeight;
            await loadGroups();
            window.refreshCollaborationNotifications?.();
        } catch (e) {
            console.error(e);
            groupMessagesStatus.textContent = "Error loading group messages.";
        } finally {
            groupMessagesStatus.textContent = '';
        }
    };

    // ==================== PRIVATE CHAT FUNCTIONS ====================
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
                ${renderAvatar(user, 'person-avatar')}
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
                ${renderAvatar(request, 'person-avatar')}
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
            window.refreshCollaborationNotifications?.();
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
            const unreadCount = Number(friend.unread_count || 0);
            const card = document.createElement('button');
            card.className = `friend-card${unreadCount > 0 ? ' unread-card' : ''}`;
            card.dataset.email = friend.email;
            card.dataset.name = friend.name;
            card.innerHTML = `
                ${renderAvatar(friend, 'friend-avatar')}
                <span class="friend-details">
                    <strong>${escapeHtml(friend.name)}</strong>
                    <small>${escapeHtml(friend.email)}</small>
                </span>
                ${unreadCount > 0 ? `<span class="conversation-unread-badge" title="Unread direct messages">${unreadCount}</span>` : ''}
            `;
            fragment.appendChild(card);
        });
        friendsList.appendChild(fragment);
    };

    const loadFriends = async () => {
        friendsStatus.textContent = 'Loading friends...';
        try {
            const res = await fetch('/api/collaboration/connections');
            const data = await res.json();
            acceptedFriends = data.connections || [];
            renderFriends(acceptedFriends);
            const unreadFriends = acceptedFriends.filter(friend => Number(friend.unread_count || 0) > 0);
            friendsStatus.textContent = unreadFriends.length > 0
                ? `${unreadFriends.length} friend(s) have unread messages.`
                : '';
            if (selectedFriend?.email) {
                document.querySelector(`#friendsList .friend-card[data-email="${CSS.escape(selectedFriend.email || '')}"]`)?.classList.add('active');
            }
            populateGroupMemberSelect();
        } catch (e) {
            friendsStatus.textContent = "Error loading friends.";
        }
    };

    const setSelectedFriend = async (friend) => {
        selectedFriend = friend;
        document.querySelectorAll('#friendsList .friend-card').forEach(card => card.classList.remove('active'));
        document.querySelector(`#friendsList .friend-card[data-email="${CSS.escape(friend.email || '')}"]`)?.classList.add('active');
        chatTitle.textContent = friend.name || 'Friend';
        chatSubtitle.textContent = friend.email || '';
        if (directChatAvatar) {
            directChatAvatar.innerHTML = renderAvatar(friend, 'collab-float-avatar-inner');
        }
        messageInput.disabled = false;
        sendMessageBtn.disabled = false;
        if (refreshMessagesBtn) refreshMessagesBtn.disabled = false;
        openDirectChatPopup();
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
            div.innerHTML = `<p>${escapeHtml(msg.body)}</p><small>${formatDateTime(msg.created_at)}</small>${msg.is_mine ? `<button class="message-delete-btn" type="button" data-message-id="${escapeHtml(msg.id)}" data-message-type="direct" title="Delete message" aria-label="Delete message"><i class="bi bi-trash3"></i></button>` : ''}`;
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
            await loadFriends();
            window.refreshCollaborationNotifications?.();
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

    const deleteMessage = async (button) => {
        const messageId = button.dataset.messageId;
        const messageType = button.dataset.messageType;
        if (!messageId) return;
        if (!confirm('Delete this message?')) return;

        const url = messageType === 'group' && selectedGroup
            ? `/api/collaboration/groups/${selectedGroup.id}/messages/${messageId}`
            : `/api/collaboration/messages/${messageId}`;

        try {
            const res = await fetch(url, { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(data.error || 'Failed to delete message.');
                return;
            }
            if (messageType === 'group') await loadGroupMessages();
            else await loadMessages();
        } catch (e) {
            console.error(e);
            alert('Connection error while deleting message.');
        }
    };

    // ==================== GROUP MESSAGE SENDING ====================
    if (groupMessageForm) {
        groupMessageForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!selectedGroup) return;
            const body = groupMessageInput.value.trim();
            if (!body) return;

            try {
                const response = await fetch(`/api/collaboration/groups/${selectedGroup.id}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ body })
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    alert(data.error || 'Failed to send group message.');
                    return;
                }
                groupMessageInput.value = '';
                await loadGroupMessages();
            } catch (e) {
                console.error(e);
                alert("Failed to send group message.");
            }
        });
    }

    // ==================== EVENT LISTENERS ====================
    openCreateGroupBtn?.addEventListener('click', () => {
        if (!createGroupBox) return;
        createGroupBox.style.display = createGroupBox.style.display === 'none' ? 'block' : 'none';
        if (createGroupBox.style.display === 'block') {
            document.getElementById('groupName')?.focus();
        }
    });

    cancelCreateGroupBtn?.addEventListener('click', () => {
        createGroupForm?.reset();
        if (createGroupBox) createGroupBox.style.display = 'none';
    });

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
        if (card) {
            const friend = acceptedFriends.find(item => item.email === card.dataset.email) || { email: card.dataset.email, name: card.dataset.name };
            setSelectedFriend(friend);
        }
    });

    groupsList?.addEventListener('click', (e) => {
        const card = e.target.closest('.group-card');
        if (card) {
            setSelectedGroup({
                id: card.dataset.id,
                name: card.dataset.name,
                description: card.dataset.description || ''
            });
        }
    });

    refreshIncomingBtn?.addEventListener('click', loadIncomingRequests);
    refreshFriendsBtn?.addEventListener('click', loadFriends);
    refreshMessagesBtn?.addEventListener('click', loadMessages);
    refreshGroupsBtn?.addEventListener('click', loadGroups);
    refreshGroupMessagesBtn?.addEventListener('click', () => { loadGroupMessages(); loadGroupMembers(); });
    closeDirectChatBtn?.addEventListener('click', closeDirectChatPopup);
    closeGroupChatBtn?.addEventListener('click', closeGroupChatPopup);
    addGroupMemberBtn?.addEventListener('click', addGroupMember);
    messagesList?.addEventListener('click', (e) => {
        const button = e.target.closest('.message-delete-btn');
        if (button) deleteMessage(button);
    });
    groupMessagesList?.addEventListener('click', (e) => {
        const button = e.target.closest('.message-delete-btn');
        if (button) deleteMessage(button);
    });
    messageForm?.addEventListener('submit', (e) => { e.preventDefault(); sendMessage(); });

    // ==================== INITIAL LOAD ====================
    loadUsers();
    loadIncomingRequests();
    loadFriends();
    loadGroups();
});

/* ──────────────────────────────────────────────
   Moved from inline <script> in collaboration.html
────────────────────────────────────────────── */
    function updateTime() {
        const now = new Date();
        document.getElementById('header-time').textContent = now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
        document.getElementById('header-date').textContent = now.toLocaleDateString('en-US',{weekday:'long',day:'numeric',month:'long'});
    }
    updateTime(); setInterval(updateTime, 1000);

    // Sidebar toggle
