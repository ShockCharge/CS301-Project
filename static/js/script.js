
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
function initExams() {
    const addExamBtn   = document.getElementById('add-exam-page-btn');
    const addExamModal = document.getElementById('addExamModal');
    const closeModal   = addExamModal ? addExamModal.querySelector('.close') : null;
    const addExamForm  = document.getElementById('addExamForm');

    if (addExamBtn && addExamModal) {
        addExamBtn.addEventListener('click', () => { addExamModal.style.display = 'block'; });
    }
    if (closeModal) {
        closeModal.addEventListener('click', () => { addExamModal.style.display = 'none'; });
    }
    if (addExamForm) {
        addExamForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const examData = {
                subject:  document.getElementById('examSubject').value,
                date:     document.getElementById('examDate').value,
                time:     document.getElementById('examTime').value,
                duration: document.getElementById('examDuration').value,
                notes:    document.getElementById('examNotes').value,
                completed: false,
                reflection: ''
            };
            fetch('/api/exams', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(examData)
            })
            .then(r => r.json())
            .then(() => {
                showSuccessToast('Exam added successfully!');
                addExamModal.style.display = 'none';
                addExamForm.reset();
                loadExams();
            })
            .catch(() => showErrorToast('Failed to add exam'));
        });
    }

    const reflectionModal = document.getElementById('examReflectionModal');
    const reflectionForm = document.getElementById('examReflectionForm');
    const reflectionClose = document.getElementById('exam-reflection-close');
    const skipReflectionBtn = document.getElementById('skipExamReflectionBtn');

    if (reflectionClose && reflectionModal) {
        reflectionClose.addEventListener('click', () => { reflectionModal.style.display = 'none'; });
    }
    if (skipReflectionBtn && reflectionModal) {
        skipReflectionBtn.addEventListener('click', () => {
            reflectionModal.style.display = 'none';
            document.getElementById('examCompletionReflection').value = '';
            document.getElementById('reflectionExamId').value = '';
            loadExams();
        });
    }
    if (reflectionForm) {
        reflectionForm.addEventListener('submit', saveExamReflection);
    }

    loadExams();
}

let allExams = [];

function loadExams() {
    fetch('/api/exams')
        .then(r => r.json())
        .then(exams => { allExams = exams; filterExams(); })
        .catch(err => console.error('Error loading exams:', err));
}

function filterExams() {
    const search = (document.getElementById('examSearch')?.value || '').toLowerCase();
    const sort   = document.getElementById('examSort')?.value || 'newest';

    let filtered = allExams.filter(exam =>
        exam.subject.toLowerCase().includes(search) ||
        (exam.notes || '').toLowerCase().includes(search)
    );

    if (sort === 'newest') filtered.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    if (sort === 'oldest') filtered.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
    if (sort === 'name')   filtered.sort((a, b) => a.subject.localeCompare(b.subject));

    displayExams(filtered);
}

// Helper: build one exam card HTML string
function buildExamCard(exam, isOutdated) {
    const today    = new Date();
    today.setHours(0, 0, 0, 0);
    const [ey, em, ed] = (exam.date || '').split('-').map(Number);
    const examDate = new Date(ey, em - 1, ed);
    const daysLeft = Math.ceil((examDate - today) / (1000 * 60 * 60 * 24));
    const isDone   = exam.completed || false;

    let colorClass   = 'card-border-low';
    let urgencyBadge = '<span class="urgency-badge urgency-low">Upcoming</span>';

    if (isDone) {
        colorClass   = 'card-border-done';
        urgencyBadge = '<span class="urgency-badge urgency-done">Done</span>';
    } else if (isOutdated) {
        colorClass   = 'card-border-outdated';
        urgencyBadge = '<span class="urgency-badge urgency-outdated">Outdated</span>';
    } else if (daysLeft <= 3) {
        colorClass   = 'card-border-high';
        urgencyBadge = '<span class="urgency-badge urgency-high">Urgent</span>';
    } else if (daysLeft <= 7) {
        colorClass   = 'card-border-medium';
        urgencyBadge = '<span class="urgency-badge urgency-medium">Soon</span>';
    }

    const doneStyle = isDone ? 'text-decoration:line-through;opacity:0.6;' : '';
    const reflectionHtml = exam.reflection
        ? `<div class="reflection-note"><strong>How it went:</strong> ${escapeHtml(exam.reflection)}</div>`
        : '';

    return `
        <div class="item-card ${colorClass} ${isDone ? 'completed' : ''}">
            <div class="item-card-header">
                <h4 style="${doneStyle}">${exam.subject}</h4>
                ${urgencyBadge}
            </div>
            <div class="item-card-body">
                <p style="${doneStyle}">${escapeHtml(exam.notes || 'No notes')}</p>
                ${reflectionHtml}
                <div class="item-meta">
                    <span><i class="bi bi-calendar"></i> ${formatDateNZ(exam.date)}</span>
                    <span><i class="bi bi-clock"></i> ${formatTimeNZ(exam.time)}</span>
                    <span><i class="bi bi-hourglass"></i> ${exam.duration} min</span>
                </div>
                <div class="item-actions">
                    <button class="btn-action ${isDone ? 'btn-undo' : 'btn-done'}"
                            onclick="toggleExamDone('${exam._id}')">
                        <i class="bi bi-${isDone ? 'arrow-counterclockwise' : 'check-circle'}"></i>
                        ${isDone ? 'Move Back to Pending' : 'Complete Exam'}
                    </button>
                    <button class="btn-action btn-edit" onclick="editExam('${exam._id}')">
                        <i class="bi bi-pencil"></i> Edit
                    </button>
                    <button class="btn-action btn-delete" onclick="deleteExam('${exam._id}')">
                        <i class="bi bi-trash"></i> Delete
                    </button>
                </div>
            </div>
        </div>`;
}

function displayExams(exams) {
    const grid = document.getElementById('exams-grid');
    if (!grid) return;

    const activeTab = typeof currentTab !== 'undefined' ? currentTab : 'current';
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const filtered = exams.filter(exam => {
        const isDone = !!exam.completed;
        let isPast = false;
        if (exam.date) {
            const [ey, em, ed] = exam.date.split('-').map(Number);
            const examDate = new Date(ey, em - 1, ed);
            isPast = examDate < today;
        }

        if (activeTab === 'completed') return isDone;
        if (activeTab === 'past') return !isDone && isPast;
        return !isDone && !isPast;
    });

    if (!filtered.length) {
        const messages = {
            current: 'No current exams. Click "Add Exam" to create one.',
            past: 'No past incomplete exams.',
            completed: 'No completed exams yet. Click "Mark Completed" after finishing an exam.'
        };
        grid.innerHTML = `<p class="empty-state">${messages[activeTab] || 'No exams found.'}</p>`;
        return;
    }

    grid.innerHTML = filtered.map(exam => {
        let isOutdated = false;
        if (exam.date && activeTab === 'past' && !exam.completed) {
            const [ey, em, ed] = exam.date.split('-').map(Number);
            const examDate = new Date(ey, em - 1, ed);
            isOutdated = examDate < today;
        }
        return buildExamCard(exam, isOutdated);
    }).join('');
}

// Toggle exam done/undone. When marking completed, open the reflection pop-up.
async function toggleExamDone(examId) {
    const exam = allExams.find(e => e._id === examId);
    if (!exam) return;
    const newCompleted = !exam.completed;

    try {
        const res = await fetch(`/api/exams/${examId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: newCompleted })
        });
        const result = await res.json();
        if (result.success) {
            if (newCompleted) {
                showSuccessToast('Exam marked as completed!');
                openExamReflectionModal(examId, exam.reflection || '');
            } else {
                showSuccessToast('Exam moved back to pending.');
                loadExams();
            }
        } else {
            showErrorToast('Failed to update exam');
        }
    } catch {
        showErrorToast('Failed to update exam');
    }
}

function openExamReflectionModal(examId, existingReflection = '') {
    const modal = document.getElementById('examReflectionModal');
    const idInput = document.getElementById('reflectionExamId');
    const textInput = document.getElementById('examCompletionReflection');
    if (!modal || !idInput || !textInput) {
        loadExams();
        return;
    }
    idInput.value = examId;
    textInput.value = existingReflection || '';
    modal.style.display = 'block';
    textInput.focus();
}

async function saveExamReflection(e) {
    e.preventDefault();
    const examId = document.getElementById('reflectionExamId').value;
    const reflection = document.getElementById('examCompletionReflection').value;
    if (!examId) return;

    try {
        const res = await fetch(`/api/exams/${examId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reflection })
        });
        const result = await res.json();
        if (result.success) {
            showSuccessToast('Exam reflection saved!');
            document.getElementById('examReflectionModal').style.display = 'none';
            document.getElementById('examCompletionReflection').value = '';
            document.getElementById('reflectionExamId').value = '';
            loadExams();
        } else {
            showErrorToast('Failed to save exam reflection');
        }
    } catch {
        showErrorToast('Failed to save exam reflection');
    }
}

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
async function deleteExam(examId) {
    showDeleteModal('Are you sure you want to delete this exam? This cannot be undone.', async function () {
        try {
            const res    = await fetch(`/api/exams/${examId}`, { method: 'DELETE' });
            const result = await res.json();
            if (result.success) { showSuccessToast('Exam deleted!'); loadExams(); }
            else showErrorToast('Failed to delete exam');
        } catch { showErrorToast('Failed to delete exam'); }
    });
}

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

// EDIT FUNCTIONS (load data into edit modals)
function editExam(examId) {
    fetch('/api/exams')
        .then(r => r.json())
        .then(exams => {
            const exam = exams.find(e => e._id === examId);
            if (!exam) return;
            document.getElementById('editExamId').value       = exam._id;
            document.getElementById('editExamSubject').value  = exam.subject;
            document.getElementById('editExamDate').value     = exam.date     || '';
            document.getElementById('editExamTime').value     = exam.time     || '';
            document.getElementById('editExamDuration').value = exam.duration || '';
            document.getElementById('editExamNotes').value    = exam.notes    || '';
            document.getElementById('editExamModal').style.display = 'block';
        })
        .catch(() => showErrorToast('Failed to load exam data'));
}

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

// EDIT FORM SUBMIT HANDLERS
const editExamForm = document.getElementById('editExamForm');
if (editExamForm) {
    editExamForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const id   = document.getElementById('editExamId').value;
        const data = {
            subject:  document.getElementById('editExamSubject').value,
            date:     document.getElementById('editExamDate').value,
            time:     document.getElementById('editExamTime').value,
            duration: document.getElementById('editExamDuration').value,
            notes:    document.getElementById('editExamNotes').value,
            completed: allExams.find(e => e._id === id)?.completed || false,
            reflection: allExams.find(e => e._id === id)?.reflection || ''
        };
        try {
            const res    = await fetch(`/api/exams/${id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if (result.success) {
                showSuccessToast('Exam updated!');
                document.getElementById('editExamModal').style.display = 'none';
                loadExams();
            } else showErrorToast('Failed to update exam');
        } catch { showErrorToast('Failed to update exam'); }
    });
}

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

