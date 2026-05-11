
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('userSearch');
    const searchButton = document.getElementById('searchUsersBtn');
    const peopleList = document.getElementById('peopleList');
    const peopleStatus = document.getElementById('peopleStatus');

    const incomingRequestsList = document.getElementById('incomingRequestsList');
    const incomingStatus = document.getElementById('incomingStatus');
    const refreshIncomingBtn = document.getElementById('refreshIncomingBtn');

    if (
        !searchInput ||
        !searchButton ||
        !peopleList ||
        !peopleStatus ||
        !incomingRequestsList ||
        !incomingStatus ||
        !refreshIncomingBtn
    ) {
        return;
    }

    const escapeHtml = (value) => {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    const initialsFor = (name, email) => {
        const source = (name || email || 'User').trim();
        const parts = source.split(/\s+/).filter(Boolean);

        if (parts.length >= 2) {
            return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        }

        return source.slice(0, 2).toUpperCase();
    };

    const renderUsers = (users) => {
        peopleList.innerHTML = '';

        if (!users || users.length === 0) {
            peopleList.innerHTML = `
                <div class="placeholder-card">
                    <strong>No students found.</strong>
                    <p>Try a different name or email search.</p>
                </div>
            `;
            return;
        }

        const fragment = document.createDocumentFragment();

        users.forEach((user) => {
            const card = document.createElement('article');
            card.className = 'person-card';

            const name = user.name || 'Study Planner User';
            const metaParts = [user.institution, user.major].filter(Boolean);
            const meta = metaParts.length ? metaParts.join(' • ') : 'Student profile';

            card.innerHTML = `
                <div class="person-main">
                    <div class="person-avatar">${escapeHtml(initialsFor(name, user.email))}</div>
                    <div class="person-info">
                        <p class="person-name">${escapeHtml(name)}</p>
                        <p class="person-email">${escapeHtml(user.email || '')}</p>
                        <p class="person-meta">${escapeHtml(meta)}</p>
                    </div>
                </div>
                <div class="person-actions">
                    <button
                        class="btn btn-outline-primary btn-sm request-connection-btn"
                        type="button"
                        data-email="${escapeHtml(user.email || '')}"
                    >
                        Request Connection
                    </button>
                </div>
            `;

            fragment.appendChild(card);
        });

        peopleList.appendChild(fragment);
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

            const displayName = request.requester_name || request.requester_email || 'Study Planner User';
            const profileText = [request.requester_major, request.requester_institution]
                .filter(Boolean)
                .join(' • ');

            card.innerHTML = `
                <div class="request-info">
                    <p class="person-name">${escapeHtml(displayName)}</p>
                    <p class="person-email">${escapeHtml(request.requester_email || '')}</p>
                    <p class="person-meta">${escapeHtml(profileText || 'Wants to connect with you')}</p>
                </div>
                <div class="request-actions">
                    <button
                        class="btn btn-primary btn-sm accept-request-btn"
                        type="button"
                        data-id="${escapeHtml(request.id || '')}"
                    >
                        Accept
                    </button>
                    <button
                        class="btn btn-outline-danger btn-sm reject-request-btn"
                        type="button"
                        data-id="${escapeHtml(request.id || '')}"
                    >
                        Reject
                    </button>
                </div>
            `;

            fragment.appendChild(card);
        });

        incomingRequestsList.appendChild(fragment);
    };

    const loadUsers = async () => {
        const query = searchInput.value.trim();
        peopleStatus.textContent = 'Loading users...';
        peopleList.innerHTML = '';

        try {
            const response = await fetch(`/api/collaboration/users?q=${encodeURIComponent(query)}`);
            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || 'Unable to load collaboration users.');
            }

            renderUsers(data.users || []);
            peopleStatus.textContent = data.message || `${(data.users || []).length} student(s) available.`;
        } catch (error) {
            peopleStatus.textContent = error.message || 'Could not load users right now.';
            peopleList.innerHTML = `
                <div class="placeholder-card">
                    <strong>Unable to load students.</strong>
                    <p>Please check your connection and try again.</p>
                </div>
            `;
        }
    };

    const loadIncomingRequests = async () => {
        incomingStatus.textContent = 'Loading incoming requests...';

        try {
            const response = await fetch('/api/collaboration/requests/incoming');
            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || 'Unable to load incoming requests.');
            }

            const requests = data.requests || [];
            renderIncomingRequests(requests);
            incomingStatus.textContent = `${requests.length} pending request(s).`;
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

    const sendConnectionRequest = async (button) => {
        const receiverEmail = button.dataset.email;

        if (!receiverEmail) {
            peopleStatus.textContent = 'User email not found. Please refresh and try again.';
            return;
        }

        button.disabled = true;
        button.textContent = 'Sending...';
        peopleStatus.textContent = 'Sending connection request...';

        try {
            const response = await fetch('/api/collaboration/requests', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    receiver_email: receiverEmail
                })
            });

            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || 'Unable to send connection request.');
            }

            button.textContent = 'Request Sent';
            button.classList.remove('btn-outline-primary');
            button.classList.add('btn-secondary');
            peopleStatus.textContent = data.message || 'Connection request sent successfully.';
        } catch (error) {
            button.disabled = false;
            button.textContent = 'Request Connection';
            peopleStatus.textContent = error.message || 'Could not send connection request.';
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
        } catch (error) {
            button.disabled = false;
            button.textContent = originalText;
            incomingStatus.textContent = error.message || `Could not ${action} request.`;
        }
    };

    peopleList.addEventListener('click', (event) => {
        const button = event.target.closest('.request-connection-btn');

        if (!button) {
            return;
        }

        sendConnectionRequest(button);
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

    refreshIncomingBtn.addEventListener('click', loadIncomingRequests);

    searchButton.addEventListener('click', loadUsers);

    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            loadUsers();
        }
    });

    loadUsers();
    loadIncomingRequests();
});
