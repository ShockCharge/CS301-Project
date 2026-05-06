let currentDate = new Date();
let currentView = 'week';
let allSchedules = [];   // cached so week/month badge injection can re-use them

// DATE / TIME HELPERS
function formatDateNZ(dateString) {
    if (!dateString) return '';
    const date  = new Date(dateString);
    const day   = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year  = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function formatTimeNZ(timeString) {
    if (!timeString) return '';
    return timeString;
}

function formatDateTimeNZ(dateString, timeString) {
    return `${formatDateNZ(dateString)} ${formatTimeNZ(timeString)}`;
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
    // Sidebar submenu toggle
    const activitiesToggle  = document.getElementById('activities-toggle');
    const activitiesSubmenu = document.getElementById('activities-submenu');
    const activitiesArrow   = document.getElementById('activities-arrow');
    if (activitiesToggle && activitiesSubmenu) {
        activitiesToggle.addEventListener('click', function (e) {
            e.preventDefault();
            activitiesSubmenu.classList.toggle('active');
            if (activitiesArrow) activitiesArrow.classList.toggle('rotated');
        });
    }

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
function initSettings() {
    fetch('/api/settings')
        .then(r => r.ok ? r.json() : {})
        .then(data => {
            const map = {
                darkMode:      'dark_mode',
                taskReminders: 'task_reminders',
                examAlerts:    'exam_alerts',
                studyDuration: 'study_duration',
                breakDuration: 'break_duration',
                defaultView:   'default_view'
            };
            for (const [id, key] of Object.entries(map)) {
                const el = document.getElementById(id);
                if (!el || data[key] === undefined) continue;
                if (el.type === 'checkbox') el.checked = data[key];
                else el.value = data[key];
            }
        })
        .catch(() => {});

    const darkToggle = document.getElementById('darkMode');
    if (darkToggle) {
        darkToggle.addEventListener('change', function () {
            document.body.classList.toggle('dark-mode', this.checked);
            localStorage.setItem('darkMode', this.checked ? 'true' : 'false');
        });
    }

    const saveBtn = document.getElementById('saveSettings');
    if (saveBtn) {
        saveBtn.addEventListener('click', function () {
            const payload = {
                dark_mode:      document.getElementById('darkMode')?.checked      ?? false,
                task_reminders: document.getElementById('taskReminders')?.checked ?? true,
                exam_alerts:    document.getElementById('examAlerts')?.checked    ?? true,
                study_duration: document.getElementById('studyDuration')?.value   ?? '60',
                break_duration: document.getElementById('breakDuration')?.value   ?? '10',
                default_view:   document.getElementById('defaultView')?.value     ?? 'week'
            };
            fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            .then(r => r.json())
            .then(result => {
                if (result.success) {
                    document.body.classList.toggle('dark-mode', payload.dark_mode);
                    localStorage.setItem('darkMode', payload.dark_mode ? 'true' : 'false');
                    showToast('Settings saved successfully!', 'success');
                } else {
                    showToast('Could not save settings. Please try again.', 'error');
                }
            })
            .catch(() => showToast('Network error. Please try again.', 'error'));
        });
    }   // closes: if (saveBtn)

    const exportBtn = document.getElementById('exportDataBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', function () {
            window.location.href = '/api/export';
        });
    }

    const clearBtn = document.getElementById('clearAllDataBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', function () {
            if (confirm('Are you absolutely sure? This will delete ALL your tasks, exams, classes, and schedules. This cannot be undone.')) {
                fetch('/api/clear-all', { method: 'POST' })
                    .then(r => r.json())
                    .then(result => {
                        if (result.success) showToast('All data cleared successfully.', 'success');
                        else                showToast('Failed to clear data.', 'error');
                    })
                    .catch(() => showToast('Network error.', 'error'));
            }
        });
    }   // closes: if (clearBtn)
}       // closes: function initSettings()

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

    if (addTaskBtn && addTaskModal) {
        addTaskBtn.addEventListener('click', function () {
            addTaskModal.style.display = 'block';
        });
    }
    if (closeModal) {
        closeModal.addEventListener('click', function () {
            addTaskModal.style.display = 'none';
        });
    }
    if (addTaskForm) {
        addTaskForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const taskData = {
                name:     document.getElementById('taskName').value,
                priority: document.getElementById('taskPriority').value
            };
            fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskData)
            })
            .then(r => r.json())
            .then(() => {
                showSuccessToast('Task added successfully!');
                addTaskModal.style.display = 'none';
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
    box.innerHTML = '<p style="color:#999;font-size:13px;">Loading suggestions…</p>';
    fetch('/api/suggestions')
        .then(r => r.json())
        .then(data => {
            box.innerHTML = data.suggestions
                ? `<p style="font-size:14px;">${data.suggestions}</p>`
                : '<p style="color:#999;font-size:13px;">No suggestions available.</p>';
        })
        .catch(() => {
            box.innerHTML = '<p style="color:#999;font-size:13px;">Could not load suggestions.</p>';
        });
}

//  SCHEDULE — calendar views

function initSchedule() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            switchView(this.getAttribute('data-view'));
        });
    });

    document.getElementById('prev-month')?.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
        injectBadges();          // re-draw badges after navigation
    });
    document.getElementById('next-month')?.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
        injectBadges();
    });

    const addBtn   = document.getElementById('add-schedule-btn');
    const addModal = document.getElementById('addScheduleModal');
    const addForm  = document.getElementById('addScheduleForm');

    addBtn?.addEventListener('click', () => {
        if (addModal) addModal.classList.add('active');
    });
    document.getElementById('closeAddScheduleModal')?.addEventListener('click', () => {
        if (addModal) addModal.classList.remove('active');
    });
    document.getElementById('cancelAddSchedule')?.addEventListener('click', () => {
        if (addModal) addModal.classList.remove('active');
    });

    addForm?.addEventListener('submit', function (e) {
        e.preventDefault();
        const data = {
            title:       document.getElementById('scheduleTitle').value,
            date:        document.getElementById('scheduleDate').value,
            time:        document.getElementById('scheduleTime').value,
            duration:    document.getElementById('scheduleDuration').value,
            description: document.getElementById('scheduleDescription').value
        };
        fetch('/api/schedules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        .then(r => r.json())
        .then(() => {
            showSuccessToast('Schedule added!');
            addModal.classList.remove('active');
            addForm.reset();
            loadSchedules();
        })
        .catch(() => showErrorToast('Failed to add schedule'));
    });

    const editModal = document.getElementById('editScheduleModal');
    document.getElementById('closeEditScheduleModal')?.addEventListener('click', () => {
        if (editModal) editModal.classList.remove('active');
    });
    document.getElementById('cancelEditSchedule')?.addEventListener('click', () => {
        if (editModal) editModal.classList.remove('active');
    });

    const deleteModal = document.getElementById('deleteScheduleModal');
    document.getElementById('closeDeleteScheduleModal')?.addEventListener('click', () => {
        if (deleteModal) deleteModal.classList.remove('active');
    });
    document.getElementById('cancelDeleteSchedule')?.addEventListener('click', () => {
        if (deleteModal) deleteModal.classList.remove('active');
    });
    document.getElementById('confirmDeleteSchedule')?.addEventListener('click', () => {
        const id = document.getElementById('deleteScheduleId').value;
        if (!id) return;
        fetch(`/api/schedules/${id}`, { method: 'DELETE' })
            .then(r => r.json())
            .then(result => {
                if (result.success) {
                    showSuccessToast('Schedule deleted!');
                    deleteModal.classList.remove('active');
                    loadSchedules();
                } else {
                    showErrorToast('Failed to delete schedule');
                }
            })
            .catch(() => showErrorToast('Failed to delete schedule'));
    });

    [addModal, editModal, deleteModal].forEach(modal => {
        modal?.addEventListener('click', function (e) {
            if (e.target === this) this.classList.remove('active');
        });
    });

    renderCalendar();
    loadSchedules();
}

function switchView(view) {
    currentView = view;

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-view') === view);
    });

    document.getElementById('week-view') ?.style && (document.getElementById('week-view').style.display  = 'none');
    document.getElementById('day-view')  ?.style && (document.getElementById('day-view').style.display   = 'none');
    document.getElementById('month-view')?.style && (document.getElementById('month-view').style.display = 'none');

    const target = document.getElementById(`${view}-view`);
    if (target) target.style.display = 'block';

    renderCalendar();
    injectBadges();    // show events on the newly visible view
}

// ── Master render dispatcher
function renderCalendar() {
    // Update the month/year label
    const label = document.getElementById('current-month');
    if (label) {
        const names = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];
        label.textContent = `${names[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }

    if      (currentView === 'week')  renderWeekView();
    else if (currentView === 'day')   renderDayView();
    else if (currentView === 'month') renderMonthView();
}

//  WEEK VIEW  — 7 columns side by side, all visible at once
function renderWeekView() {
    const weekHeader = document.getElementById('week-header');
    const weekGrid   = document.getElementById('week-grid');
    if (!weekGrid) return;

    // Work out the Sunday that starts the current week
    const today        = new Date();
    const startOfWeek  = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Build the day-name header row (only if the element exists and is empty)
    if (weekHeader) {
        weekHeader.innerHTML = '';
        dayNames.forEach(name => {
            const h = document.createElement('div');
            h.className = 'cal-day-name';
            h.textContent = name;
            weekHeader.appendChild(h);
        });
    }

    // Build the 7 day columns
    weekGrid.innerHTML = '';
    for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);

        const col = document.createElement('div');
        col.className = 'calendar-day';
        if (date.toDateString() === today.toDateString()) col.classList.add('today');

        // Store the date as a data attribute so injectBadges() can match events
        col.dataset.date = date.toISOString().split('T')[0];   // "YYYY-MM-DD"

        col.innerHTML = `
            <div class="day-number">${dayNames[i]}<br>${date.getDate()}</div>
            <div class="day-events"></div>
        `;
        weekGrid.appendChild(col);
    }
}

//  MONTH VIEW  — 7-column grid, all 28-42 cells visible at once
function renderMonthView() {
    const monthGrid = document.getElementById('month-grid');
    if (!monthGrid) return;

    monthGrid.innerHTML = '';

    const year          = currentDate.getFullYear();
    const month         = currentDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();       // 0=Sun
    const lastDate      = new Date(year, month + 1, 0).getDate();  // e.g. 30
    const prevLastDate  = new Date(year, month, 0).getDate();      // last day of prev month
    const today         = new Date();

    for (let i = firstDayIndex; i > 0; i--) {
        const cell = document.createElement('div');
        cell.className = 'calendar-day other-month';
        // Build a YYYY-MM-DD for the prev-month date so badges can still match
        const prevMonth = month === 0 ? 12 : month;
        const prevYear  = month === 0 ? year - 1 : year;
        const d         = String(prevLastDate - i + 1).padStart(2, '0');
        cell.dataset.date = `${prevYear}-${String(prevMonth).padStart(2,'0')}-${d}`;
        cell.innerHTML = `<div class="day-number">${prevLastDate - i + 1}</div>`;
        monthGrid.appendChild(cell);
    }

    for (let d = 1; d <= lastDate; d++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-day';
        if (d === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
            cell.classList.add('today');
        }
        cell.dataset.date = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        cell.innerHTML = `<div class="day-number">${d}</div>`;
        monthGrid.appendChild(cell);
    }

    // ── Filler cells from the next month 
    const remaining = 42 - (firstDayIndex + lastDate);
    for (let d = 1; d <= remaining; d++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-day other-month';
        const nextMonth = month === 11 ? 1 : month + 2;
        const nextYear  = month === 11 ? year + 1 : year;
        cell.dataset.date = `${nextYear}-${String(nextMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        cell.innerHTML = `<div class="day-number">${d}</div>`;
        monthGrid.appendChild(cell);
    }
}

//  DAY VIEW  — compact 24-hour timeline
function renderDayView() {
    const daySlots = document.getElementById('day-slots');
    const dayTitle = document.getElementById('day-title');
    if (!daySlots) return;

    // Show which day we are viewing
    if (dayTitle) {
        const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dayTitle.textContent = currentDate.toLocaleDateString('en-NZ', opts);
    }

    daySlots.innerHTML = '';

    for (let hour = 0; hour < 24; hour++) {
        const slot = document.createElement('div');
        slot.className = 'time-slot';
        const label = String(hour).padStart(2, '0') + ':00';
        slot.dataset.hour = hour;
        slot.innerHTML = `
            <div class="time-label">${label}</div>
            <div class="time-content"></div>
        `;
        daySlots.appendChild(slot);
    }
}

//  BADGE INJECTION — places event badges on the visible calendar
function injectBadges() {
    if (!allSchedules.length) return;

    if (currentView === 'month' || currentView === 'week') {
        const gridId   = currentView === 'month' ? 'month-grid' : 'week-grid';
        const cells    = document.querySelectorAll(`#${gridId} .calendar-day`);

        // Build a lookup: "YYYY-MM-DD" → cell element
        const cellMap = {};
        cells.forEach(cell => {
            if (cell.dataset.date) cellMap[cell.dataset.date] = cell;
        });

        allSchedules.forEach(schedule => {
            if (!schedule.date) return;
            const cell = cellMap[schedule.date];
            if (!cell) return;

            // Don't add duplicate badges on repeated calls
            const alreadyAdded = Array.from(cell.querySelectorAll('.calendar-event-badge'))
                .some(b => b.dataset.id === schedule._id);
            if (alreadyAdded) return;

            const badge = document.createElement('div');
            badge.className = 'calendar-event-badge';
            badge.dataset.id = schedule._id;
            badge.textContent = schedule.time
                ? `${schedule.time} ${schedule.title}`
                : schedule.title;
            cell.appendChild(badge);
        });
    }

    if (currentView === 'day') {
        // Show events in the correct hour slot
        const todayStr = currentDate.toISOString().split('T')[0];
        allSchedules.forEach(schedule => {
            if (schedule.date !== todayStr || !schedule.time) return;
            const hour = parseInt(schedule.time.split(':')[0], 10);
            const slot = document.querySelector(`#day-slots .time-slot[data-hour="${hour}"] .time-content`);
            if (!slot) return;

            const item = document.createElement('div');
            item.className = 'day-event-item';
            item.textContent = `${schedule.time} — ${schedule.title}`;
            slot.appendChild(item);
        });
    }
}

//  LOAD & DISPLAY SCHEDULES
function loadSchedules() {
    fetch('/api/schedules')
        .then(r => r.json())
        .then(schedules => {
            allSchedules = schedules;
            displaySchedules(schedules);
            injectBadges();
        })
        .catch(err => console.error('Error loading schedules:', err));
}

function displaySchedules(schedules) {
    const list = document.getElementById('schedule-list-items');
    if (!list) return;

    if (!schedules.length) {
        list.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-calendar-x" style="font-size:48px;color:#ccc;"></i>
                <p>No scheduled items yet</p>
                <p style="font-size:14px;color:#999;">Click "Add Schedule" to create your first item</p>
            </div>`;
        return;
    }

    list.innerHTML = schedules.map(s => `
        <div class="schedule-item" data-id="${s._id}">
            <div class="schedule-item-header">
                <div class="schedule-item-info">
                    <h4 class="schedule-title">${s.title}</h4>
                    <div class="schedule-meta">
                        ${s.date     ? `<span><i class="bi bi-calendar3"></i> ${s.date}</span>` : ''}
                        ${s.time     ? `<span><i class="bi bi-clock"></i> ${s.time}</span>` : ''}
                        ${s.duration ? `<span><i class="bi bi-hourglass-split"></i> ${s.duration} min</span>` : ''}
                    </div>
                </div>
                <div class="schedule-actions">
                    <button class="btn-icon btn-edit"   onclick="editSchedule('${s._id}')"   title="Edit">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn-icon btn-delete" onclick="deleteSchedule('${s._id}')" title="Delete">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
            ${s.description ? `<div class="schedule-description"><p>${s.description}</p></div>` : ''}
        </div>
    `).join('');
}

// Called from the Edit button in the list
function editSchedule(scheduleId) {
    const s = allSchedules.find(x => x._id === scheduleId);
    if (!s) return;

    document.getElementById('editScheduleId').value          = s._id;
    document.getElementById('editScheduleTitle').value       = s.title;
    document.getElementById('editScheduleDate').value        = s.date        || '';
    document.getElementById('editScheduleTime').value        = s.time        || '';
    document.getElementById('editScheduleDuration').value    = s.duration    || '';
    document.getElementById('editScheduleDescription').value = s.description || '';

    document.getElementById('editScheduleModal').classList.add('active');
}

// Called from the Delete button in the list
function deleteSchedule(scheduleId) {
    document.getElementById('deleteScheduleId').value = scheduleId;
    document.getElementById('deleteScheduleModal').classList.add('active');
}

// Edit form submit
const editScheduleForm = document.getElementById('editScheduleForm');
if (editScheduleForm) {
    editScheduleForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const id   = document.getElementById('editScheduleId').value;
        const data = {
            title:       document.getElementById('editScheduleTitle').value,
            date:        document.getElementById('editScheduleDate').value,
            time:        document.getElementById('editScheduleTime').value,
            duration:    document.getElementById('editScheduleDuration').value,
            description: document.getElementById('editScheduleDescription').value
        };
        try {
            const res    = await fetch(`/api/schedules/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if (result.success) {
                showSuccessToast('Schedule updated!');
                document.getElementById('editScheduleModal').classList.remove('active');
                loadSchedules();
            } else {
                showErrorToast('Failed to update schedule');
            }
        } catch {
            showErrorToast('Failed to update schedule');
        }
    });
}

// TASKS
function initTasks() {
    const addTaskBtn   = document.getElementById('add-task-page-btn');
    const addTaskModal = document.getElementById('addTaskModal');
    const closeModal   = addTaskModal ? addTaskModal.querySelector('.close') : null;
    const addTaskForm  = document.getElementById('addTaskForm');

    if (addTaskBtn && addTaskModal) {
        addTaskBtn.addEventListener('click', () => { addTaskModal.style.display = 'block'; });
    }
    if (closeModal) {
        closeModal.addEventListener('click', () => { addTaskModal.style.display = 'none'; });
    }
    if (addTaskForm) {
        addTaskForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const taskData = {
                name:        document.getElementById('taskName').value,
                priority:    document.getElementById('taskPriority').value,
                date:        document.getElementById('taskDate').value,
                description: document.getElementById('taskDescription').value
            };
            fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskData)
            })
            .then(r => r.json())
            .then(() => {
                showSuccessToast('Task added successfully!');
                addTaskModal.style.display = 'none';
                addTaskForm.reset();
                loadTasks();
            })
            .catch(() => showErrorToast('Failed to add task'));
        });
    }
    loadTasks();
}

let allTasks = [];

function loadTasks() {
    fetch('/api/tasks')
        .then(r => r.json())
        .then(tasks => { allTasks = tasks; filterTasks(); })
        .catch(err => console.error('Error loading tasks:', err));
}

function filterTasks() {
    const search   = (document.getElementById('taskSearch')?.value || '').toLowerCase();
    const priority = document.getElementById('taskPriorityFilter')?.value || '';
    const status   = document.getElementById('taskStatusFilter')?.value  || '';
    const sort     = document.getElementById('taskSort')?.value           || 'newest';

    let filtered = allTasks.filter(task => {
        const matchSearch   = task.name.toLowerCase().includes(search) ||
                              (task.description || '').toLowerCase().includes(search);
        const matchPriority = !priority || task.priority === priority;
        const matchStatus   = !status ||
                              (status === 'completed' && task.completed) ||
                              (status === 'pending'   && !task.completed);
        return matchSearch && matchPriority && matchStatus;
    });

    const priorityOrder = { high: 1, medium: 2, low: 3 };
    if (sort === 'newest')   filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    if (sort === 'oldest')   filtered.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    if (sort === 'priority') filtered.sort((a, b) => (priorityOrder[a.priority] || 9) - (priorityOrder[b.priority] || 9));
    if (sort === 'name')     filtered.sort((a, b) => a.name.localeCompare(b.name));

    displayTasks(filtered);
}

function displayTasks(tasks) {
    const grid = document.getElementById('tasks-grid');
    if (!grid) return;

    if (!tasks.length) {
        grid.innerHTML = '<p class="empty-state">No tasks yet. Click "Add Task" to create one.</p>';
        return;
    }

    grid.innerHTML = tasks.map(task => {
        const done       = task.completed || false;
        let colorClass   = 'card-border-low';
        if (done)                          colorClass = 'card-border-done';
        else if (task.priority === 'high') colorClass = 'card-border-high';
        else if (task.priority === 'medium') colorClass = 'card-border-medium';

        return `
            <div class="item-card ${colorClass} ${done ? 'completed' : ''}">
                <div class="item-card-header">
                    <div class="task-checkbox">
                        <input type="checkbox" ${done ? 'checked' : ''}
                               onchange="toggleTaskComplete('${task._id}')" id="task-${task._id}">
                    </div>
                    <h4 style="${done ? 'text-decoration:line-through;opacity:0.6;' : ''}">${task.name}</h4>
                    <span class="priority-badge priority-${task.priority}">${task.priority}</span>
                </div>
                <div class="item-card-body">
                    <p style="${done ? 'opacity:0.6;' : ''}">${task.description || 'No description'}</p>
                    <div class="item-meta">
                        ${task.date ? `<span><i class="bi bi-calendar"></i> ${formatDateNZ(task.date)}</span>` : ''}
                    </div>
                    <div class="item-actions">
                        <button class="btn-action btn-edit"   onclick="editTask('${task._id}')">
                            <i class="bi bi-pencil"></i> Edit
                        </button>
                        <button class="btn-action btn-delete" onclick="deleteTask('${task._id}')">
                            <i class="bi bi-trash"></i> Delete
                        </button>
                    </div>
                </div>
            </div>`;
    }).join('');
}

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
                notes:    document.getElementById('examNotes').value
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

    return `
        <div class="item-card ${colorClass} ${isDone ? 'completed' : ''}">
            <div class="item-card-header">
                <h4 style="${doneStyle}">${exam.subject}</h4>
                ${urgencyBadge}
            </div>
            <div class="item-card-body">
                <p style="${doneStyle}">${exam.notes || 'No notes'}</p>
                <div class="item-meta">
                    <span><i class="bi bi-calendar"></i> ${formatDateNZ(exam.date)}</span>
                    <span><i class="bi bi-clock"></i> ${formatTimeNZ(exam.time)}</span>
                    <span><i class="bi bi-hourglass"></i> ${exam.duration} min</span>
                </div>
                <div class="item-actions">
                    <button class="btn-action ${isDone ? 'btn-undo' : 'btn-done'}"
                            onclick="toggleExamDone('${exam._id}')">
                        <i class="bi bi-${isDone ? 'arrow-counterclockwise' : 'check-circle'}"></i>
                        ${isDone ? 'Undo' : 'Mark Done'}
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

    if (!exams.length) {
        grid.innerHTML = '<p class="empty-state">No exams yet. Click "Add Exam" to create one.</p>';
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Split into 3 groups: upcoming/done, and outdated (past + not done)
    const upcoming = [];
    const outdated = [];

    exams.forEach(exam => {
        if (!exam.date) { upcoming.push(exam); return; }
        const [ey, em, ed] = exam.date.split('-').map(Number);
        const examDate = new Date(ey, em - 1, ed);
        // Outdated = date is in the past AND not marked done
        if (examDate < today && !exam.completed) {
            outdated.push(exam);
        } else {
            upcoming.push(exam);
        }
    });

    let html = '';

    if (upcoming.length) {
        html += upcoming.map(e => buildExamCard(e, false)).join('');
    }

    if (outdated.length) {
        html += `
            <div class="group-divider">
                <span><i class="bi bi-clock-history"></i> Outdated Exams (${outdated.length})</span>
            </div>`;
        html += outdated.map(e => buildExamCard(e, true)).join('');
    }

    grid.innerHTML = html;
}

// Toggle exam done/undone
async function toggleExamDone(examId) {
    const exam = allExams.find(e => e._id === examId);
    if (!exam) return;
    const newCompleted = !exam.completed;
    try {
        const res    = await fetch(`/api/exams/${examId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: newCompleted })
        });
        const result = await res.json();
        if (result.success) {
            showSuccessToast(newCompleted ? 'Exam marked as done!' : 'Exam marked as pending');
            loadExams();
        } else {
            showErrorToast('Failed to update exam');
        }
    } catch {
        showErrorToast('Failed to update exam');
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
                time:       document.getElementById('classTime').value,
                room:       document.getElementById('classRoom').value
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

function displayClasses(classes) {
    const grid = document.getElementById('classes-grid');
    if (!grid) return;

    if (!classes.length) {
        grid.innerHTML = '<p class="empty-state">No classes yet. Click "Add Class" to create one.</p>';
        return;
    }

    grid.innerHTML = classes.map(c => `
        <div class="item-card card-border-info">
            <div class="item-card-header">
                <h4>${c.name}</h4>
                <span class="urgency-badge urgency-info">${c.day}</span>
            </div>
            <div class="item-card-body">
                <p><strong>Instructor:</strong> ${c.instructor || 'N/A'}</p>
                <div class="item-meta">
                    <span><i class="bi bi-calendar"></i> ${c.day}</span>
                    <span><i class="bi bi-clock"></i> ${formatTimeNZ(c.time)}</span>
                    ${c.room ? `<span><i class="bi bi-door-open"></i> ${c.room}</span>` : ''}
                </div>
                <div class="item-actions">
                    <button class="btn-action btn-edit"   onclick="editClass('${c._id}')">
                        <i class="bi bi-pencil"></i> Edit
                    </button>
                    <button class="btn-action btn-delete" onclick="deleteClass('${c._id}')">
                        <i class="bi bi-trash"></i> Delete
                    </button>
                </div>
            </div>
        </div>`).join('');
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
                description: document.getElementById('vacationDescription').value
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
        .then(vacations => { allVacations = vacations; displayVacations(vacations); })
        .catch(err => console.error('Error loading vacations:', err));
}

// Helper: build one vacation card HTML string
function buildVacationCard(v, isOutdated) {
    const isDone      = v.completed || false;
    const doneStyle   = isDone ? 'text-decoration:line-through;opacity:0.6;' : '';
    let   colorClass  = 'card-border-info';
    let   statusBadge = '<span class="urgency-badge urgency-info">Planned</span>';

    if (isDone) {
        colorClass  = 'card-border-done';
        statusBadge = '<span class="urgency-badge urgency-done">Done</span>';
    } else if (isOutdated) {
        colorClass  = 'card-border-outdated';
        statusBadge = '<span class="urgency-badge urgency-outdated">Outdated</span>';
    }

    return `
        <div class="item-card ${colorClass} ${isDone ? 'completed' : ''}">
            <div class="item-card-header">
                <h4 style="${doneStyle}">${v.title}</h4>
                ${statusBadge}
            </div>
            <div class="item-card-body">
                <p style="${doneStyle}">${v.description || 'No description'}</p>
                <div class="item-meta">
                    <span><i class="bi bi-calendar-check"></i> ${formatDateNZ(v.start_date)}</span>
                    <span><i class="bi bi-calendar-x"></i> ${formatDateNZ(v.end_date)}</span>
                </div>
                <div class="item-actions">
                    <button class="btn-action ${isDone ? 'btn-undo' : 'btn-done'}"
                            onclick="toggleVacationDone('${v._id}')">
                        <i class="bi bi-${isDone ? 'arrow-counterclockwise' : 'check-circle'}"></i>
                        ${isDone ? 'Undo' : 'Mark Done'}
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

    if (!vacations.length) {
        grid.innerHTML = '<p class="empty-state">No vacations planned. Click "Add Vacation" to create one.</p>';
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming = [];
    const outdated = [];

    vacations.forEach(v => {
        if (!v.end_date) { upcoming.push(v); return; }
        const [vy, vm, vd] = v.end_date.split('-').map(Number);
        const endDate = new Date(vy, vm - 1, vd);
        // Outdated = end date is in the past AND not marked done
        if (endDate < today && !v.completed) {
            outdated.push(v);
        } else {
            upcoming.push(v);
        }
    });

    let html = '';

    if (upcoming.length) {
        html += upcoming.map(v => buildVacationCard(v, false)).join('');
    }

    if (outdated.length) {
        html += `
            <div class="group-divider">
                <span><i class="bi bi-clock-history"></i> Outdated Vacations (${outdated.length})</span>
            </div>`;
        html += outdated.map(v => buildVacationCard(v, true)).join('');
    }

    grid.innerHTML = html;
}

// Toggle vacation done/undone
async function toggleVacationDone(vacationId) {
    // Find in the cached list from loadVacations
    const allVacs = Array.from(document.querySelectorAll('[data-vacation-id]'))
        .map(el => ({ _id: el.dataset.vacationId }));

    // Re-fetch to get latest state
    try {
        const res      = await fetch('/api/vacations');
        const vacations = await res.json();
        const vacation  = vacations.find(v => v._id === vacationId);
        if (!vacation) return;

        const newCompleted = !vacation.completed;
        const patchRes = await fetch(`/api/vacations/${vacationId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: newCompleted })
        });
        const result = await patchRes.json();
        if (result.success) {
            showSuccessToast(newCompleted ? 'Vacation marked as done!' : 'Vacation marked as pending');
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

// TOGGLE TASK COMPLETE
async function toggleTaskComplete(taskId) {
    try {
        const task         = allTasks.find(t => t._id === taskId);
        const newCompleted = task ? !task.completed : true;

        const res    = await fetch(`/api/tasks/${taskId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: newCompleted })
        });
        const result = await res.json();
        if (result.success) loadTasks();
        else showErrorToast('Failed to update task');
    } catch {
        showErrorToast('Failed to update task');
    }
}

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
async function deleteTask(taskId) {
    showDeleteModal('Are you sure you want to delete this task? This cannot be undone.', async function () {
        try {
            const res    = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
            const result = await res.json();
            if (result.success) { showSuccessToast('Task deleted!'); loadTasks(); }
            else showErrorToast('Failed to delete task');
        } catch { showErrorToast('Failed to delete task'); }
    });
}

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
function editTask(taskId) {
    const task = allTasks.find(t => t._id === taskId);
    if (!task) return;
    document.getElementById('editTaskId').value          = task._id;
    document.getElementById('editTaskName').value        = task.name;
    document.getElementById('editTaskPriority').value    = task.priority;
    document.getElementById('editTaskDate').value        = task.date        || '';
    document.getElementById('editTaskDescription').value = task.description || '';
    document.getElementById('editTaskModal').style.display = 'block';
}

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
    document.getElementById('editClassDay').value        = c.day        || '';
    document.getElementById('editClassTime').value       = c.time       || '';
    document.getElementById('editClassRoom').value       = c.room       || '';
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
            document.getElementById('editVacationDescription').value = v.description  || '';
            document.getElementById('editVacationModal').style.display = 'block';
        })
        .catch(() => showErrorToast('Failed to load vacation data'));
}

// EDIT FORM SUBMIT HANDLERS
const editTaskForm = document.getElementById('editTaskForm');
if (editTaskForm) {
    editTaskForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const id   = document.getElementById('editTaskId').value;
        const data = {
            name:        document.getElementById('editTaskName').value,
            priority:    document.getElementById('editTaskPriority').value,
            date:        document.getElementById('editTaskDate').value,
            description: document.getElementById('editTaskDescription').value
        };
        try {
            const res    = await fetch(`/api/tasks/${id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if (result.success) {
                showSuccessToast('Task updated!');
                document.getElementById('editTaskModal').style.display = 'none';
                loadTasks();
            } else showErrorToast('Failed to update task');
        } catch { showErrorToast('Failed to update task'); }
    });
}

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
            notes:    document.getElementById('editExamNotes').value
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
            day:        document.getElementById('editClassDay').value,
            time:       document.getElementById('editClassTime').value,
            room:       document.getElementById('editClassRoom').value
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
            description: document.getElementById('editVacationDescription').value
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
