// Vacations page JavaScript
// This file contains only vacation-page logic moved out of script.js.
// Shared helpers such as showSuccessToast(), showErrorToast(), formatDateNZ(),
// escapeHtml(), and the shared delete modal still come from script.js.

// VACATIONS
function initVacations() {
    const addVacationBtn   = document.getElementById('add-vacation-page-btn');
    const addVacationModal = document.getElementById('addVacationModal');
    const closeModal       = addVacationModal ? addVacationModal.querySelector('.close') : null;
    const addVacationForm  = document.getElementById('addVacationForm');

    if (addVacationBtn && addVacationModal) {
        addVacationBtn.addEventListener('click', () => { addVacationModal.style.display = 'block'; });
    }
    if (closeModal) {
        closeModal.addEventListener('click', () => { addVacationModal.style.display = 'none'; });
    }
    if (addVacationForm) {
        addVacationForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const vacationData = {
                title:       document.getElementById('vacationTitle').value,
                start_date:  document.getElementById('vacationStart').value,
                end_date:    document.getElementById('vacationEnd').value,
                description: document.getElementById('vacationDescription').value,
                status:      document.getElementById('vacationStatus')?.value || 'planned',
                reflection:  document.getElementById('vacationReflection')?.value || '',
                completed:   (document.getElementById('vacationStatus')?.value || 'planned') === 'completed'
            };
            fetch('/api/vacations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(vacationData)
            })
            .then(r => r.json())
            .then(() => {
                showSuccessToast('Vacation added successfully!');
                addVacationModal.style.display = 'none';
                addVacationForm.reset();
                loadVacations();
            })
            .catch(() => showErrorToast('Failed to add vacation'));
        });
    }
    loadVacations();
}

let allVacations = [];

function loadVacations() {
    fetch('/api/vacations')
        .then(r => r.json())
        .then(vacations => { allVacations = vacations; filterVacations(); })
        .catch(err => console.error('Error loading vacations:', err));
}

function filterVacations() {
    displayVacations(allVacations);
}

// Helper: build one vacation card HTML string
function buildVacationCard(v, isOutdated) {
    const isDone      = v.completed || v.status === 'completed';
    const doneStyle   = isDone ? 'text-decoration:line-through;opacity:0.6;' : '';
    const status = v.status || (isDone ? 'completed' : 'planned');
    let   colorClass  = status === 'in_progress' ? 'card-border-medium' : 'card-border-info';
    let   statusBadge = status === 'in_progress'
        ? '<span class="urgency-badge urgency-medium">In Progress</span>'
        : '<span class="urgency-badge urgency-info">Planned</span>';

    if (isDone) {
        colorClass  = 'card-border-done';
        statusBadge = '<span class="urgency-badge urgency-done">Completed</span>';
    } else if (isOutdated) {
        colorClass  = 'card-border-outdated';
        statusBadge = '<span class="urgency-badge urgency-outdated">Outdated</span>';
    }

    return `
        <div class="item-card ${colorClass} ${isDone ? 'completed' : ''}">
            <div class="item-card-header">
                <h4 style="${doneStyle}">${escapeHtml(v.title || '')}</h4>
                ${statusBadge}
            </div>
            <div class="item-card-body">
                <p style="${doneStyle}">${escapeHtml(v.description || 'No description')}</p>
                ${v.reflection ? `<div class="reflection-note"><strong>Vacation notes:</strong> ${escapeHtml(v.reflection)}</div>` : ''}
                <div class="item-meta">
                    <span><i class="bi bi-calendar-check"></i> ${formatDateNZ(v.start_date)}</span>
                    <span><i class="bi bi-calendar-x"></i> ${formatDateNZ(v.end_date)}</span>
                </div>
                <div class="item-actions">
                    <button class="btn-action ${isDone ? 'btn-undo' : 'btn-done'}"
                            onclick="toggleVacationDone('${v._id}')">
                        <i class="bi bi-${isDone ? 'arrow-counterclockwise' : 'check-circle'}"></i>
                        ${isDone ? 'Move Back to Pending' : 'Mark Completed'}
                    </button>
                    <button class="btn-action btn-edit" onclick="editVacation('${v._id}')">
                        <i class="bi bi-pencil"></i> Edit
                    </button>
                    <button class="btn-action btn-delete" onclick="deleteVacation('${v._id}')">
                        <i class="bi bi-trash"></i> Delete
                    </button>
                </div>
            </div>
        </div>`;
}

function displayVacations(vacations) {
    const grid = document.getElementById('vacations-grid');
    if (!grid) return;

    const activeTab = typeof currentTab !== 'undefined' ? currentTab : 'planned';
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const filtered = vacations.filter(v => {
        const isDone = !!v.completed || v.status === 'completed';
        let isPast = false;
        if (v.end_date) {
            const [vy, vm, vd] = v.end_date.split('-').map(Number);
            const endDate = new Date(vy, vm - 1, vd);
            isPast = endDate < today;
        }

        if (activeTab === 'completed') return isDone;
        if (activeTab === 'past') return !isDone && isPast;
        return !isDone && !isPast;
    });

    if (!filtered.length) {
        const messages = {
            planned: 'No planned vacations. Click "Add Vacation" to create one.',
            past: 'No past incomplete vacations.',
            completed: 'No completed vacations yet. Click "Mark Completed" when a vacation is finished.'
        };
        grid.innerHTML = `<p class="empty-state">${messages[activeTab] || 'No vacations found.'}</p>`;
        return;
    }

    grid.innerHTML = filtered.map(v => {
        let isOutdated = false;
        if (v.end_date && activeTab === 'past' && !v.completed && v.status !== 'completed') {
            const [vy, vm, vd] = v.end_date.split('-').map(Number);
            const endDate = new Date(vy, vm - 1, vd);
            isOutdated = endDate < today;
        }
        return buildVacationCard(v, isOutdated);
    }).join('');
}

// Toggle vacation done/undone
async function toggleVacationDone(vacationId) {
    const vacation = allVacations.find(v => v._id === vacationId);
    if (!vacation) return;

    const currentCompleted = !!vacation.completed || vacation.status === 'completed';
    const newCompleted = !currentCompleted;

    try {
        const patchRes = await fetch(`/api/vacations/${vacationId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: newCompleted })
        });
        const result = await patchRes.json();
        if (result.success) {
            showSuccessToast(newCompleted ? 'Vacation marked as completed!' : 'Vacation moved back to pending.');
            loadVacations();
        } else {
            showErrorToast('Failed to update vacation');
        }
    } catch {
        showErrorToast('Failed to update vacation');
    }
}

async function deleteVacation(vacationId) {
    showDeleteModal('Are you sure you want to delete this vacation? This cannot be undone.', async function () {
        try {
            const res    = await fetch(`/api/vacations/${vacationId}`, { method: 'DELETE' });
            const result = await res.json();
            if (result.success) { showSuccessToast('Vacation deleted!'); loadVacations(); }
            else showErrorToast('Failed to delete vacation');
        } catch { showErrorToast('Failed to delete vacation'); }
    });
}

function editVacation(vacationId) {
    fetch('/api/vacations')
        .then(r => r.json())
        .then(vacations => {
            const v = vacations.find(x => x._id === vacationId);
            if (!v) return;
            document.getElementById('editVacationId').value          = v._id;
            document.getElementById('editVacationTitle').value       = v.title;
            document.getElementById('editVacationStart').value       = v.start_date   || '';
            document.getElementById('editVacationEnd').value         = v.end_date     || '';
            if (document.getElementById('editVacationStatus')) document.getElementById('editVacationStatus').value = v.status || (v.completed ? 'completed' : 'planned');
            document.getElementById('editVacationDescription').value = v.description  || '';
            if (document.getElementById('editVacationReflection')) document.getElementById('editVacationReflection').value = v.reflection || '';
            document.getElementById('editVacationModal').style.display = 'block';
        })
        .catch(() => showErrorToast('Failed to load vacation data'));
}

const editVacationForm = document.getElementById('editVacationForm');
if (editVacationForm) {
    editVacationForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const id   = document.getElementById('editVacationId').value;
        const data = {
            title:       document.getElementById('editVacationTitle').value,
            start_date:  document.getElementById('editVacationStart').value,
            end_date:    document.getElementById('editVacationEnd').value,
            status:      document.getElementById('editVacationStatus')?.value || 'planned',
            description: document.getElementById('editVacationDescription').value,
            reflection:  document.getElementById('editVacationReflection')?.value || '',
            completed:   (document.getElementById('editVacationStatus')?.value || 'planned') === 'completed'
        };
        try {
            const res    = await fetch(`/api/vacations/${id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if (result.success) {
                showSuccessToast('Vacation updated!');
                document.getElementById('editVacationModal').style.display = 'none';
                loadVacations();
            } else showErrorToast('Failed to update vacation');
        } catch { showErrorToast('Failed to update vacation'); }
    });
}

document.addEventListener('DOMContentLoaded', function () {
    const observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                const el = mutation.target;
                if (el.classList.contains('modal')) {
                    if (el.style.display === 'block' || el.style.display === 'flex') {
                        el.classList.add('active');
                        el.style.display = '';
                    } else if (el.style.display === 'none') {
                        el.classList.remove('active');
                        el.style.display = '';
                    }
                }
            }
        });
    });

    document.querySelectorAll('.modal').forEach(function (modal) {
        observer.observe(modal, { attributes: true, attributeFilter: ['style'] });
    });
});

// COLLABORATION SIDEBAR NOTIFICATIONS
(function initCollaborationNotifications() {
    const BADGE_SELECTOR = '[data-collaboration-badge]';

    function getBadges() {
        return Array.from(document.querySelectorAll(BADGE_SELECTOR));
    }

    function setBadgeCount(count) {
        const badges = getBadges();
        badges.forEach((badge) => {
            if (!count || count <= 0) {
                badge.hidden = true;
                badge.textContent = '0';
                badge.setAttribute('aria-label', 'No unread collaboration notifications');
            } else {
                badge.hidden = false;
                badge.textContent = count > 99 ? '99+' : String(count);
                badge.setAttribute('aria-label', `${count} unread collaboration notification${count === 1 ? '' : 's'}`);
            }
        });
    }

    async function refreshCollaborationNotifications() {
        if (!getBadges().length) return;
        try {
            const response = await fetch('/api/collaboration/notifications/count', {
                headers: { 'Accept': 'application/json' },
                cache: 'no-store'
            });
            if (!response.ok) {
                setBadgeCount(0);
                return;
            }
            const data = await response.json();
            setBadgeCount(Number(data.count || 0));
        } catch (error) {
            // Silent failure keeps the app usable if the server is temporarily unavailable.
        }
    }

    window.refreshCollaborationNotifications = refreshCollaborationNotifications;

    document.addEventListener('DOMContentLoaded', () => {
        refreshCollaborationNotifications();
        setInterval(refreshCollaborationNotifications, 15000);
    });
})();
