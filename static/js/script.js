
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
// Class-page logic has been moved to static/js/classes.js.
// The classes template loads classes.js after this shared script.

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


// EDIT FUNCTIONS (load data into edit modals)


// EDIT FORM SUBMIT HANDLERS
