
// DATE / TIME HELPERS
function formatDateNZ(dateString) {
    if (!dateString) return '';

    // Safe handling for database dates like "2026-06-04".
    // Do not use new Date("YYYY-MM-DD") because it can show the wrong day in some timezones.
    const parts = String(dateString).split('-');
    if (parts.length === 3) {
        const [year, month, day] = parts;
        return `${day}/${month}/${year}`;
    }

    return dateString;
}

function formatTimeNZ(timeString) {
    if (!timeString) return '';
    return timeString;
}

function formatDateTimeNZ(dateString, timeString) {
    return `${formatDateNZ(dateString)} ${formatTimeNZ(timeString)}`;
}

function getTodayKeyNZ() {
    const now = new Date();
    const nzDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Pacific/Auckland',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(now);
    return nzDate;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// DARK MODE (runs immediately on every page)
(function applyDarkModeOnLoad() {
    if (localStorage.getItem('darkMode') === 'true') {
        document.addEventListener('DOMContentLoaded', function () {
            document.body.classList.add('dark-mode');
        });
    }

    fetch('/api/settings')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
            if (!data || data.dark_mode === undefined) return;
            document.body.classList.toggle('dark-mode', data.dark_mode);
            localStorage.setItem('darkMode', data.dark_mode ? 'true' : 'false');
        })
        .catch(() => {});
})();

// PAGE ROUTER — runs once DOM is ready
document.addEventListener('DOMContentLoaded', function () {

    // Route to the correct init function
    const path = window.location.pathname;
    if      (path.includes('/dashboard'))  initDashboard();
    else if (path.includes('/schedule'))   initSchedule();
    else if (path.includes('/tasks'))      initTasks();
    else if (path.includes('/exams'))      initExams();
    else if (path.includes('/classes'))    initClasses();
    else if (path.includes('/vacations'))  initVacations();
    else if (path.includes('/settings'))   initSettings();
});

// SETTINGS
// Settings-page logic has been moved to static/js/settings.js.
// The settings template loads settings.js after this shared script.

// TOAST NOTIFICATION
function showToast(message, type = 'success') {
    // Try the new schedule-page toast container first, fall back to body
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.body;
    }

    const toast = document.createElement('div');
    toast.className = `toast-msg toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    }, 3000);
}

function showSuccessToast(message) { showToast(message, 'success'); }
function showErrorToast(message)   { showToast(message, 'error'); }

// DASHBOARD

function initDashboard() {
    fetchAISuggestions();

    const addTaskBtn   = document.getElementById('add-task-btn');
    const addTaskModal = document.getElementById('addTaskModal');
    const closeModal   = addTaskModal ? addTaskModal.querySelector('.close') : null;
    const addTaskForm  = document.getElementById('addTaskForm');

    function openTaskModal() {
        if (!addTaskModal) return;
        addTaskModal.style.display = 'block';
        addTaskModal.classList.add('active');
    }

    function closeTaskModal() {
        if (!addTaskModal) return;
        addTaskModal.style.display = 'none';
        addTaskModal.classList.remove('active');
    }

    if (addTaskBtn && addTaskModal) {
        addTaskBtn.addEventListener('click', openTaskModal);
    }

    if (closeModal) {
        closeModal.addEventListener('click', closeTaskModal);
    }

    if (addTaskForm) {
        addTaskForm.addEventListener('submit', function (e) {
            e.preventDefault();

            const taskName = document.getElementById('taskName')?.value.trim();
            const taskDate = document.getElementById('taskDate')?.value || '';

            if (!taskName) {
                showErrorToast('Please enter a task name');
                return;
            }

            if (!taskDate) {
                showErrorToast('Please choose a due date');
                return;
            }

            const taskData = {
                name: taskName,
                priority: document.getElementById('taskPriority')?.value || 'medium',
                date: taskDate,
                time: document.getElementById('taskTime')?.value || '23:59',
                description: document.getElementById('taskDescription')?.value || ''
            };

            fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskData)
            })
            .then(r => r.json())
            .then(data => {
                if (data.error) {
                    showErrorToast(data.error);
                    return;
                }
                showSuccessToast('Task added successfully!');
                closeTaskModal();
                addTaskForm.reset();
                location.reload();
            })
            .catch(() => showErrorToast('Failed to add task'));
        });
    }

    loadDashboardData();
}

function loadDashboardData() {
    fetch('/api/tasks')
        .then(r => r.json())
        .then(tasks => {
            const taskList = document.getElementById('task-list');
            if (taskList && tasks.length > 0) {
                taskList.innerHTML = tasks.slice(0, 5).map(task => `
                    <li class="task-item">
                        <span class="task-name">${task.name}</span>
                        <span class="priority-badge priority-${task.priority}">${task.priority}</span>
                    </li>
                `).join('');
            }
        })
        .catch(err => console.error('Error loading tasks:', err));

    fetch('/api/exams')
        .then(r => r.json())
        .then(exams => {
            const examList = document.getElementById('exam-list');
            if (examList && exams.length > 0) {
                examList.innerHTML = exams.slice(0, 3).map(exam => `
                    <li class="task-item">
                        <span class="task-name">${exam.subject}</span>
                        <span class="schedule-time">${formatDateNZ(exam.date)}</span>
                    </li>
                `).join('');
            }
        })
        .catch(err => console.error('Error loading exams:', err));
}

function fetchAISuggestions() {
    const box = document.getElementById('ai-suggestions');
    if (!box) return;

    box.replaceChildren();
    const loading = document.createElement('p');
    loading.style.color = '#999';
    loading.style.fontSize = '13px';
    loading.textContent = 'Loading suggestions…';
    box.appendChild(loading);

    fetch('/api/suggestions')
        .then(r => r.json())
        .then(data => {
            box.replaceChildren();
            const p = document.createElement('p');
            p.style.fontSize = '14px';
            p.textContent = data.suggestions || 'No suggestions available.';
            if (!data.suggestions) {
                p.style.color = '#999';
                p.style.fontSize = '13px';
            }
            box.appendChild(p);
        })
        .catch(() => {
            box.replaceChildren();
            const p = document.createElement('p');
            p.style.color = '#999';
            p.style.fontSize = '13px';
            p.textContent = 'Could not load suggestions.';
            box.appendChild(p);
        });
}

//  SCHEDULE — calendar views

// SCHEDULE
// Schedule-page logic has been moved to static/js/schedule.js.
// The schedule template loads schedule.js after this shared script.

// TASKS
// Task-page logic has been moved to static/js/tasks.js.
// The tasks template loads tasks.js after this shared script.

// EXAMS
// Exam-page logic has been moved to static/js/exams.js.
// The exams template loads exams.js after this shared script.

// CLASSES
function initClasses() {
    const addClassBtn   = document.getElementById('add-class-page-btn');
    const addClassModal = document.getElementById('addClassModal');
    const closeModal    = addClassModal ? addClassModal.querySelector('.close') : null;
    const addClassForm  = document.getElementById('addClassForm');

    if (addClassBtn && addClassModal) {
        addClassBtn.addEventListener('click', () => { addClassModal.style.display = 'block'; });
    }
    if (closeModal) {
        closeModal.addEventListener('click', () => { addClassModal.style.display = 'none'; });
    }
    if (addClassForm) {
        addClassForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const classData = {
                name:       document.getElementById('className').value,
                instructor: document.getElementById('classInstructor').value,
                day:        document.getElementById('classDay').value,
                date:       document.getElementById('classDate')?.value || '',
                time:       document.getElementById('classTime').value,
                room:       document.getElementById('classRoom').value,
                repeat:     document.getElementById('classRepeat')?.value || 'never',
                repeat_until: document.getElementById('classRepeatUntil')?.value || ''
            };
            fetch('/api/classes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(classData)
            })
            .then(r => r.json())
            .then(() => {
                showSuccessToast('Class added successfully!');
                addClassModal.style.display = 'none';
                addClassForm.reset();
                loadClasses();
            })
            .catch(() => showErrorToast('Failed to add class'));
        });
    }
    loadClasses();
}

let allClasses = [];

function loadClasses() {
    fetch('/api/classes')
        .then(r => r.json())
        .then(classes => { allClasses = classes; filterClasses(); })
        .catch(err => console.error('Error loading classes:', err));
}

function filterClasses() {
    const search = (document.getElementById('classSearch')?.value || '').toLowerCase();
    const day    = document.getElementById('classDayFilter')?.value || '';
    const sort   = document.getElementById('classSort')?.value      || 'name';

    let filtered = allClasses.filter(cls => {
        const matchSearch = cls.name.toLowerCase().includes(search) ||
                            (cls.instructor || '').toLowerCase().includes(search);
        const matchDay    = !day || cls.day === day;
        return matchSearch && matchDay;
    });

    const dayOrder = { Monday:1, Tuesday:2, Wednesday:3, Thursday:4, Friday:5, Saturday:6, Sunday:7 };
    if (sort === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'day')  filtered.sort((a, b) => (dayOrder[a.day] || 9) - (dayOrder[b.day] || 9));

    displayClasses(filtered);
}

function getRepeatLabel(value) {
    const labels = {
        never: 'Does not repeat',
        daily: 'Repeats daily',
        weekdays: 'Repeats Monday to Friday',
        weekly: 'Repeats weekly',
        monthly: 'Repeats monthly',
        yearly: 'Repeats yearly'
    };
    return labels[value || 'never'] || 'Does not repeat';
}

function setupRepeatToggle(selectId, groupId) {
    const select = document.getElementById(selectId);
    const group = document.getElementById(groupId);
    if (!select || !group) return;
    const update = () => { group.style.display = select.value === 'never' ? 'none' : 'block'; };
    select.addEventListener('change', update);
    update();
}

setupRepeatToggle('classRepeat', 'classRepeatUntilGroup');
setupRepeatToggle('editClassRepeat', 'editClassRepeatUntilGroup');

function displayClasses(classes) {
    const grid = document.getElementById('classes-grid');
    if (!grid) return;

    const activeTab = typeof currentTab !== 'undefined' ? currentTab : 'current';
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const filtered = classes.filter(c => {
        const isDone = !!c.completed;
        let isPast = false;
        if (c.date) {
            const [cy, cm, cd] = c.date.split('-').map(Number);
            const classDate = new Date(cy, cm - 1, cd);
            isPast = classDate < today;
        }

        if (activeTab === 'completed') return isDone;
        if (activeTab === 'past') return !isDone && isPast;
        return !isDone && !isPast;
    });

    if (!filtered.length) {
        const messages = {
            current: 'No current classes. Click "Add Class" to create one.',
            past: 'No past incomplete classes.',
            completed: 'No completed classes yet. Click "Mark Completed" when a class is finished.'
        };
        grid.innerHTML = `<p class="empty-state">${messages[activeTab] || 'No classes found.'}</p>`;
        return;
    }

    grid.innerHTML = filtered.map(c => {
        const isDone = !!c.completed;
        const doneStyle = isDone ? 'text-decoration:line-through;opacity:0.6;' : '';
        const colorClass = isDone ? 'card-border-done' : 'card-border-info';
        return `
        <div class="item-card ${colorClass} ${isDone ? 'completed' : ''}">
            <div class="item-card-header">
                <h4 style="${doneStyle}">${escapeHtml(c.name || '')}</h4>
                <div class="task-header-badges">
                    ${isDone ? '<span class="urgency-badge urgency-done">Completed</span>' : '<span class="urgency-badge urgency-info">Active</span>'}
                    <span class="urgency-badge urgency-info">${escapeHtml(c.day || 'No day')}</span>
                    <span class="repeat-badge-mini">${getRepeatLabel(c.repeat)}</span>
                </div>
            </div>
            <div class="item-card-body">
                <p style="${doneStyle}"><strong>Instructor:</strong> ${escapeHtml(c.instructor || 'N/A')}</p>
                <div class="item-meta">
                    ${c.date ? `<span><i class="bi bi-calendar-date"></i> ${formatDateNZ(c.date)}</span>` : ''}
                    <span><i class="bi bi-calendar"></i> ${escapeHtml(c.day || 'N/A')}</span>
                    <span><i class="bi bi-clock"></i> ${formatTimeNZ(c.time)}</span>
                    ${c.room ? `<span><i class="bi bi-door-open"></i> ${escapeHtml(c.room)}</span>` : ''}
                    ${c.repeat && c.repeat !== 'never' && c.repeat_until ? `<span><i class="bi bi-arrow-repeat"></i> until ${formatDateNZ(c.repeat_until)}</span>` : ''}
                </div>
                <div class="item-actions">
                    <button class="btn-action ${isDone ? 'btn-undo' : 'btn-done'}" onclick="toggleClassDone('${c._id}')">
                        <i class="bi bi-${isDone ? 'arrow-counterclockwise' : 'check-circle'}"></i> ${isDone ? 'Move Back to Pending' : 'Mark Completed'}
                    </button>
                    <button class="btn-action btn-edit" onclick="editClass('${c._id}')">
                        <i class="bi bi-pencil"></i> Edit
                    </button>
                    <button class="btn-action btn-delete" onclick="deleteClass('${c._id}')">
                        <i class="bi bi-trash"></i> Delete
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');
}

async function toggleClassDone(classId) {
    const cls = allClasses.find(c => c._id === classId);
    if (!cls) return;
    const newCompleted = !cls.completed;

    try {
        const res = await fetch(`/api/classes/${classId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: newCompleted })
        });
        const result = await res.json();
        if (result.success) {
            showSuccessToast(newCompleted ? 'Class marked as completed!' : 'Class moved back to pending.');
            loadClasses();
        } else {
            showErrorToast('Failed to update class');
        }
    } catch {
        showErrorToast('Failed to update class');
    }
}

// VACATIONS
// Vacation-page logic has been moved to static/js/vacations.js.
// The vacations template loads vacations.js after this shared script.

// CLOSE MODAL ON OUTSIDE CLICK (legacy modals)
window.onclick = function (event) {
    document.querySelectorAll('.modal').forEach(modal => {
        if (event.target === modal) modal.style.display = 'none';
    });
};

// DELETE MODAL (shared across all pages)
let deleteCallback = null;

function closeDeleteModal() {
    document.getElementById('deleteConfirmModal')?.classList.remove('active');
    deleteCallback = null;
}

function showDeleteModal(message, callback) {
    const el = document.getElementById('deleteConfirmMessage');
    if (el) el.textContent = message;
    document.getElementById('deleteConfirmModal')?.classList.add('active');
    deleteCallback = callback;
}

document.addEventListener('DOMContentLoaded', function () {
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    if (confirmBtn) {
        confirmBtn.onclick = function () {
            if (deleteCallback) deleteCallback();
            closeDeleteModal();
        };
    }
    document.getElementById('deleteConfirmModal')?.addEventListener('click', function (e) {
        if (e.target === this) closeDeleteModal();
    });
});

// DELETE FUNCTIONS
async function deleteClass(classId) {
    showDeleteModal('Are you sure you want to delete this class? This cannot be undone.', async function () {
        try {
            const res    = await fetch(`/api/classes/${classId}`, { method: 'DELETE' });
            const result = await res.json();
            if (result.success) { showSuccessToast('Class deleted!'); loadClasses(); }
            else showErrorToast('Failed to delete class');
        } catch { showErrorToast('Failed to delete class'); }
    });
}

// EDIT FUNCTIONS (load data into edit modals)
function editClass(classId) {
    const c = allClasses.find(x => x._id === classId);
    if (!c) return;
    document.getElementById('editClassId').value         = c._id;
    document.getElementById('editClassName').value       = c.name;
    document.getElementById('editClassInstructor').value = c.instructor || '';
    if (document.getElementById('editClassDate')) document.getElementById('editClassDate').value = c.date || '';
    document.getElementById('editClassDay').value        = c.day        || '';
    document.getElementById('editClassTime').value       = c.time       || '';
    document.getElementById('editClassRoom').value       = c.room       || '';
    if (document.getElementById('editClassRepeat')) document.getElementById('editClassRepeat').value = c.repeat || 'never';
    if (document.getElementById('editClassRepeatUntil')) document.getElementById('editClassRepeatUntil').value = c.repeat_until || '';
    setupRepeatToggle('editClassRepeat', 'editClassRepeatUntilGroup');
    document.getElementById('editClassModal').style.display = 'block';
}

// EDIT FORM SUBMIT HANDLERS
const editClassForm = document.getElementById('editClassForm');
if (editClassForm) {
    editClassForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const id   = document.getElementById('editClassId').value;
        const data = {
            name:       document.getElementById('editClassName').value,
            instructor: document.getElementById('editClassInstructor').value,
            date:       document.getElementById('editClassDate')?.value || '',
            day:        document.getElementById('editClassDay').value,
            time:       document.getElementById('editClassTime').value,
            room:       document.getElementById('editClassRoom').value,
            repeat:     document.getElementById('editClassRepeat')?.value || 'never',
            repeat_until: document.getElementById('editClassRepeatUntil')?.value || '',
            completed:   allClasses.find(c => c._id === id)?.completed || false
        };
        try {
            const res    = await fetch(`/api/classes/${id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if (result.success) {
                showSuccessToast('Class updated!');
                document.getElementById('editClassModal').style.display = 'none';
                loadClasses();
            } else showErrorToast('Failed to update class');
        } catch { showErrorToast('Failed to update class'); }
    });
}
