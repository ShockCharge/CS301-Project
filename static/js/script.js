let currentDate = new Date();
let currentView = 'week';
let scheduleStatusFilter = 'current';
let allSchedules = [];   // cached so week/month badge injection can re-use them

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

function initSchedule() {
    document.querySelectorAll('.tab-btn[data-view]').forEach(btn => {
        btn.addEventListener('click', function () {
            switchView(this.getAttribute('data-view'));
        });
    });

    document.querySelectorAll('.schedule-filter-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            scheduleStatusFilter = this.getAttribute('data-status') || 'current';
            document.querySelectorAll('.schedule-filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            displaySchedules(allSchedules);
        });
    });

    document.getElementById('prev-month')?.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
        injectBadges();
    });
    document.getElementById('next-month')?.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
        injectBadges();
    });

    setupRepeatControls('schedule');
    setupRepeatControls('editSchedule');

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
            title:           document.getElementById('scheduleTitle').value,
            date:            document.getElementById('scheduleDate').value,
            time:            document.getElementById('scheduleTime').value,
            duration:        document.getElementById('scheduleDuration').value,
            repeat:          document.getElementById('scheduleRepeat')?.value || 'never',
            repeat_until:    document.getElementById('scheduleRepeatUntil')?.value || '',
            repeat_interval: document.getElementById('scheduleRepeatInterval')?.value || 1,
            repeat_unit:     document.getElementById('scheduleRepeatUnit')?.value || 'weeks',
            description:     document.getElementById('scheduleDescription').value
        };
        fetch('/api/schedules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        .then(r => r.json())
        .then(result => {
            if (result.error) {
                showErrorToast(result.error);
                return;
            }
            showSuccessToast(data.repeat && data.repeat !== 'never' ? 'Repeating schedule added!' : 'Schedule added!');
            addModal.classList.remove('active');
            addForm.reset();
            toggleRepeatCustomRow('schedule');
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

    setupScheduleQuickActions();
    renderCalendar();
    loadSchedules();
}

function dateKeyFromDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDateKey(dateKey) {
    if (!dateKey) return null;
    const [year, month, day] = String(dateKey).split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
}

function daysBetween(startDate, endDate) {
    const oneDay = 24 * 60 * 60 * 1000;
    const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    return Math.round((end - start) / oneDay);
}

function setupRepeatControls(prefix) {
    const select = document.getElementById(`${prefix}Repeat`);
    if (!select) return;
    select.addEventListener('change', () => toggleRepeatCustomRow(prefix));
    toggleRepeatCustomRow(prefix);
}

function toggleRepeatCustomRow(prefix) {
    const select = document.getElementById(`${prefix}Repeat`);
    const row = document.getElementById(`${prefix}CustomRepeatRow`);
    if (row && select) row.style.display = select.value === 'custom' ? 'grid' : 'none';
}

function getScheduleRepeatLabel(schedule) {
    const repeat = schedule?.repeat || 'never';
    const labels = {
        never: 'Does not repeat',
        daily: 'Repeats daily',
        weekdays: 'Repeats Monday to Friday',
        weekly: 'Repeats weekly',
        monthly: 'Repeats monthly',
        yearly: 'Repeats yearly'
    };
    if (repeat === 'custom') {
        const interval = schedule.repeat_interval || 1;
        const unit = schedule.repeat_unit || 'weeks';
        return `Repeats every ${interval} ${unit}`;
    }
    return labels[repeat] || 'Does not repeat';
}

function scheduleOccursOnDate(schedule, dateKey) {
    if (!schedule || !schedule.date || !dateKey) return false;

    const repeat = schedule.repeat || 'never';
    const startDate = parseDateKey(schedule.date);
    const targetDate = parseDateKey(dateKey);
    if (!startDate || !targetDate) return false;

    const diffDays = daysBetween(startDate, targetDate);
    if (diffDays < 0) return false;

    if (schedule.repeat_until && dateKey > schedule.repeat_until) return false;
    if (repeat === 'never' || !repeat) return schedule.date === dateKey;
    if (repeat === 'daily') return true;
    if (repeat === 'weekdays') {
        const day = targetDate.getDay();
        return day >= 1 && day <= 5;
    }
    if (repeat === 'weekly') return diffDays % 7 === 0;
    if (repeat === 'monthly') return targetDate.getDate() === startDate.getDate();
    if (repeat === 'yearly') return targetDate.getMonth() === startDate.getMonth() && targetDate.getDate() === startDate.getDate();
    if (repeat === 'custom') {
        const interval = Math.max(1, parseInt(schedule.repeat_interval || 1, 10));
        const unit = schedule.repeat_unit || 'weeks';
        if (unit === 'days') return diffDays % interval === 0;
        if (unit === 'weeks') return diffDays % (interval * 7) === 0;
        if (unit === 'months') {
            const months = (targetDate.getFullYear() - startDate.getFullYear()) * 12 + (targetDate.getMonth() - startDate.getMonth());
            return targetDate.getDate() === startDate.getDate() && months % interval === 0;
        }
        if (unit === 'years') {
            const years = targetDate.getFullYear() - startDate.getFullYear();
            return targetDate.getMonth() === startDate.getMonth() && targetDate.getDate() === startDate.getDate() && years % interval === 0;
        }
    }
    return false;
}

function schedulesForDate(dateKey) {
    return allSchedules.filter(schedule => scheduleOccursOnDate(schedule, dateKey));
}

function getScheduleOccurrencesInRange(schedules, startKey, endKey) {
    const start = parseDateKey(startKey);
    const end = parseDateKey(endKey);
    if (!start || !end) return [];

    const occurrences = [];
    const cursor = new Date(start);
    while (cursor <= end) {
        const key = dateKeyFromDate(cursor);
        schedules.forEach(schedule => {
            if (scheduleOccursOnDate(schedule, key)) occurrences.push({ ...schedule, occurrence_date: key });
        });
        cursor.setDate(cursor.getDate() + 1);
    }
    return occurrences;
}

function switchView(view) {
    currentView = view;

    document.querySelectorAll('.tab-btn[data-view]').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-view') === view);
    });

    document.getElementById('week-view') ?.style && (document.getElementById('week-view').style.display  = 'none');
    document.getElementById('day-view')  ?.style && (document.getElementById('day-view').style.display   = 'none');
    document.getElementById('month-view')?.style && (document.getElementById('month-view').style.display = 'none');

    const target = document.getElementById(`${view}-view`);
    if (target) target.style.display = 'block';

    renderCalendar();
    injectBadges();
}

function renderCalendar() {
    const label = document.getElementById('current-month');
    if (label) {
        const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        label.textContent = `${names[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }

    if      (currentView === 'week')  renderWeekView();
    else if (currentView === 'day')   renderDayView();
    else if (currentView === 'month') renderMonthView();
}

function renderWeekView() {
    const weekHeader = document.getElementById('week-header');
    const weekGrid   = document.getElementById('week-grid');
    const timeLabels = document.getElementById('time-labels');
    const timeLines  = document.getElementById('time-lines');
    if (!weekGrid) return;

    const today       = new Date();
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const startHour = 7;
    const endHour   = 23;

    if (weekHeader) {
        weekHeader.innerHTML = '';
        weekHeader.style.gridTemplateColumns = `repeat(7, 1fr)`;
        dayNames.forEach((name, i) => {
            const date = new Date(startOfWeek);
            date.setDate(startOfWeek.getDate() + i);
            const cell = document.createElement('div');
            cell.className = 'time-grid-header-cell';
            cell.textContent = `${name} ${date.getDate()}`;
            weekHeader.appendChild(cell);
        });
    }

    if (timeLabels) {
        timeLabels.innerHTML = '';
        for (let h = startHour; h <= endHour; h++) {
            const label = document.createElement('div');
            label.className = 'time-label-cell';
            const suffix = h >= 12 ? 'pm' : 'am';
            const display = h > 12 ? h - 12 : h;
            label.textContent = `${display}${suffix}`;
            timeLabels.appendChild(label);
        }
    }

    if (timeLines) {
        timeLines.innerHTML = '';
        for (let h = startHour; h <= endHour; h++) {
            const line = document.createElement('div');
            line.className = 'time-grid-line';
            timeLines.appendChild(line);
        }
    }

    weekGrid.innerHTML = '';
    weekGrid.style.gridTemplateColumns = `repeat(7, 1fr)`;
    for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        const col = document.createElement('div');
        col.className = 'time-grid-col';
        if (dateKeyFromDate(date) === dateKeyFromDate(today)) col.classList.add('today');
        col.dataset.date = dateKeyFromDate(date);
        weekGrid.appendChild(col);
    }

    injectTimeGridEvents(startHour, endHour);
}

function injectTimeGridEvents(startHour, endHour) {
    const cols = document.querySelectorAll('.time-grid-col');
    const hourHeight = 48;

    cols.forEach(col => {
        const colDate = col.dataset.date;
        schedulesForDate(colDate).forEach(s => {
            if (!s.time) return;
            const [h, m] = s.time.split(':').map(Number);
            const top = ((h + m / 60) - startHour) * hourHeight;
            const height = Math.max((parseInt(s.duration || 60, 10) / 60) * hourHeight, 20);

            const block = document.createElement('div');
            block.className = 'sched-event-block';
            block.style.top    = `${top}px`;
            block.style.height = `${height}px`;
            block.textContent  = s.title;
            block.title        = `${s.time} — ${s.title} (${getScheduleRepeatLabel(s)})`;
            col.appendChild(block);
        });
    });
}

function renderMonthView() {
    const monthGrid = document.getElementById('month-grid');
    if (!monthGrid) return;

    monthGrid.innerHTML = '';

    const year          = currentDate.getFullYear();
    const month         = currentDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const lastDate      = new Date(year, month + 1, 0).getDate();
    const prevLastDate  = new Date(year, month, 0).getDate();
    const today         = new Date();

    for (let i = firstDayIndex; i > 0; i--) {
        const cell = document.createElement('div');
        cell.className = 'calendar-day other-month';
        const prevDate = new Date(year, month - 1, prevLastDate - i + 1);
        cell.dataset.date = dateKeyFromDate(prevDate);
        cell.innerHTML = `<div class="day-number">${prevLastDate - i + 1}</div>`;
        monthGrid.appendChild(cell);
    }

    for (let d = 1; d <= lastDate; d++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-day';
        const date = new Date(year, month, d);
        if (dateKeyFromDate(date) === dateKeyFromDate(today)) cell.classList.add('today');
        cell.dataset.date = dateKeyFromDate(date);
        cell.innerHTML = `<div class="day-number">${d}</div>`;
        monthGrid.appendChild(cell);
    }

    const remaining = 42 - (firstDayIndex + lastDate);
    for (let d = 1; d <= remaining; d++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-day other-month';
        const nextDate = new Date(year, month + 1, d);
        cell.dataset.date = dateKeyFromDate(nextDate);
        cell.innerHTML = `<div class="day-number">${d}</div>`;
        monthGrid.appendChild(cell);
    }
}

function renderDayView() {
    const daySlots = document.getElementById('day-slots');
    const dayTitle = document.getElementById('day-title');
    if (!daySlots) return;

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

function injectBadges() {
    if (currentView === 'month') {
        const cells = document.querySelectorAll('#month-grid .calendar-day');
        cells.forEach(cell => {
            const dateKey = cell.dataset.date;
            schedulesForDate(dateKey).forEach(schedule => {
                const badge = document.createElement('div');
                badge.className = 'calendar-event-badge';
                badge.dataset.id = `${schedule._id}-${dateKey}`;
                badge.textContent = schedule.time ? `${schedule.time} ${schedule.title}` : schedule.title;
                badge.title = getScheduleRepeatLabel(schedule);
                cell.appendChild(badge);
            });
        });
    }

    if (currentView === 'day') {
        const dayKey = dateKeyFromDate(currentDate);
        schedulesForDate(dayKey).forEach(schedule => {
            if (!schedule.time) return;
            const hour = parseInt(schedule.time.split(':')[0], 10);
            const slot = document.querySelector(`#day-slots .time-slot[data-hour="${hour}"] .time-content`);
            if (!slot) return;

            const item = document.createElement('div');
            item.className = 'day-event-item';
            item.textContent = `${schedule.time} — ${schedule.title}`;
            item.title = getScheduleRepeatLabel(schedule);
            slot.appendChild(item);
        });
    }
}

function parseScheduleDateTime(schedule) {
    if (!schedule || !schedule.date) return null;
    const time = schedule.time || '23:59';
    const [year, month, day] = String(schedule.date).split('-').map(Number);
    const [hour, minute] = String(time).split(':').map(Number);
    const date = new Date(year, (month || 1) - 1, day || 1, hour || 23, minute || 59);
    return Number.isNaN(date.getTime()) ? null : date;
}

function updateScheduleOverview(schedules) {
    const items = Array.isArray(schedules) ? schedules : [];
    const now = new Date();
    const todayKey = dateKeyFromDate(now);
    const weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() + 7);
    const weekEndKey = dateKeyFromDate(weekEnd);

    const todayOccurrences = getScheduleOccurrencesInRange(items, todayKey, todayKey);
    const weekOccurrences = getScheduleOccurrencesInRange(items, todayKey, weekEndKey);

    const upcoming = weekOccurrences
        .map(item => ({ item, date: parseScheduleDateTime({ ...item, date: item.occurrence_date }) }))
        .filter(entry => entry.date && entry.date >= now)
        .sort((a, b) => a.date - b.date)[0];

    const todayEl = document.getElementById('schedule-today-count');
    const weekEl = document.getElementById('schedule-week-count');
    const totalEl = document.getElementById('schedule-total-count');
    const nextTitleEl = document.getElementById('schedule-next-title');
    const nextTimeEl = document.getElementById('schedule-next-time');

    if (todayEl) todayEl.textContent = todayOccurrences.length;
    if (weekEl) weekEl.textContent = weekOccurrences.length;
    if (totalEl) totalEl.textContent = items.length;

    if (nextTitleEl && nextTimeEl) {
        if (upcoming) {
            nextTitleEl.textContent = upcoming.item.title || 'Upcoming schedule';
            nextTimeEl.textContent = upcoming.date.toLocaleString('en-NZ', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: upcoming.item.time ? 'numeric' : undefined,
                minute: upcoming.item.time ? '2-digit' : undefined
            });
        } else {
            nextTitleEl.textContent = 'No upcoming item';
            nextTimeEl.textContent = items.length ? 'No schedule is due in the next 7 days' : 'Add a schedule to get started';
        }
    }
}

function setupScheduleQuickActions() {
    document.getElementById('schedule-today-btn')?.addEventListener('click', () => {
        currentDate = new Date();
        switchView('day');
    });

    document.getElementById('schedule-week-btn')?.addEventListener('click', () => {
        switchView('week');
    });

    document.getElementById('schedule-month-btn')?.addEventListener('click', () => {
        switchView('month');
    });
}

function loadSchedules() {
    fetch('/api/schedules')
        .then(r => r.json())
        .then(schedules => {
            allSchedules = Array.isArray(schedules) ? schedules : [];
            updateScheduleOverview(allSchedules);
            renderCalendar();
            displaySchedules(allSchedules);
            injectBadges();
        })
        .catch(err => console.error('Error loading schedules:', err));
}

function isScheduleOutdated(schedule) {
    if (!schedule || !schedule.date) return false;
    const todayKey = getTodayKeyNZ();
    if ((schedule.repeat || 'never') !== 'never') {
        return !!schedule.repeat_until && schedule.repeat_until < todayKey;
    }
    return schedule.date < todayKey;
}

function displaySchedules(schedules) {
    const list = document.getElementById('schedule-list-items');
    if (!list) return;

    const items = Array.isArray(schedules) ? schedules : [];
    const filteredSchedules = items.filter(s => {
        const outdated = isScheduleOutdated(s);
        if (scheduleStatusFilter === 'current') return !outdated;
        if (scheduleStatusFilter === 'outdated') return outdated;
        return true;
    });

    if (!filteredSchedules.length) {
        const emptyMessage = scheduleStatusFilter === 'outdated'
            ? 'No outdated scheduled items'
            : 'No scheduled items yet';
        list.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-calendar-x" style="font-size:48px;color:#ccc;"></i>
                <p>${emptyMessage}</p>
                <p style="font-size:14px;color:#999;">${scheduleStatusFilter === 'outdated' ? 'Past schedules will appear here automatically.' : 'Click "Add Schedule" to create your first item'}</p>
            </div>`;
        return;
    }

    list.innerHTML = filteredSchedules.map(s => {
        const outdated = isScheduleOutdated(s);
        const repeatLabel = getScheduleRepeatLabel(s);
        const repeatUntil = s.repeat_until ? ` until ${formatDateNZ(s.repeat_until)}` : '';
        const safeTitle = escapeHtml(s.title || 'Untitled Schedule');
        const safeDescription = escapeHtml(s.description || '');
        return `
        <div class="schedule-item ${outdated ? 'outdated' : ''}" data-id="${s._id}">
            <div class="schedule-item-header">
                <div class="schedule-item-info">
                    <h4 class="schedule-title">${safeTitle}</h4>
                    <div class="schedule-meta">
                        ${s.date     ? `<span><i class="bi bi-calendar3"></i> Starts ${formatDateNZ(s.date)}</span>` : ''}
                        ${s.time     ? `<span><i class="bi bi-clock"></i> ${escapeHtml(s.time)}</span>` : ''}
                        ${s.duration ? `<span><i class="bi bi-hourglass-split"></i> ${escapeHtml(s.duration)} min</span>` : ''}
                        <span class="repeat-badge"><i class="bi bi-arrow-repeat"></i> ${escapeHtml(repeatLabel + repeatUntil)}</span>
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
            ${outdated ? '<div class="schedule-status-label">Outdated</div>' : ''}
            ${safeDescription ? `<div class="schedule-description"><p>${safeDescription}</p></div>` : ''}
        </div>`;
    }).join('');
}

function editSchedule(scheduleId) {
    const s = allSchedules.find(x => x._id === scheduleId);
    if (!s) return;

    document.getElementById('editScheduleId').value             = s._id;
    document.getElementById('editScheduleTitle').value          = s.title || '';
    document.getElementById('editScheduleDate').value           = s.date || '';
    document.getElementById('editScheduleTime').value           = s.time || '';
    document.getElementById('editScheduleDuration').value       = s.duration || '';
    document.getElementById('editScheduleRepeat').value         = s.repeat || 'never';
    document.getElementById('editScheduleRepeatUntil').value    = s.repeat_until || '';
    document.getElementById('editScheduleRepeatInterval').value = s.repeat_interval || 1;
    document.getElementById('editScheduleRepeatUnit').value     = s.repeat_unit || 'weeks';
    document.getElementById('editScheduleDescription').value    = s.description || '';
    toggleRepeatCustomRow('editSchedule');

    document.getElementById('editScheduleModal').classList.add('active');
}

function deleteSchedule(scheduleId) {
    document.getElementById('deleteScheduleId').value = scheduleId;
    document.getElementById('deleteScheduleModal').classList.add('active');
}

const editScheduleForm = document.getElementById('editScheduleForm');
if (editScheduleForm) {
    editScheduleForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const id   = document.getElementById('editScheduleId').value;
        const data = {
            title:           document.getElementById('editScheduleTitle').value,
            date:            document.getElementById('editScheduleDate').value,
            time:            document.getElementById('editScheduleTime').value,
            duration:        document.getElementById('editScheduleDuration').value,
            repeat:          document.getElementById('editScheduleRepeat')?.value || 'never',
            repeat_until:    document.getElementById('editScheduleRepeatUntil')?.value || '',
            repeat_interval: document.getElementById('editScheduleRepeatInterval')?.value || 1,
            repeat_unit:     document.getElementById('editScheduleRepeatUnit')?.value || 'weeks',
            description:     document.getElementById('editScheduleDescription').value
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
                showErrorToast(result.error || 'Failed to update schedule');
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
                time: document.getElementById('taskTime').value,
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

    const todayKey = getTodayKeyNZ();
    const activeTab = typeof currentTab !== 'undefined' ? currentTab : 'current';

    let filtered = allTasks.filter(task => {
        const name = task.name || '';
        const completed = !!task.completed;
        const isPast = !!task.date && task.date < todayKey;
        const isOverdue = isPast && !completed;

        const matchSearch   = name.toLowerCase().includes(search) ||
                              (task.description || '').toLowerCase().includes(search);
        const matchPriority = !priority || task.priority === priority;
        const matchStatus   = !status ||
                              (status === 'completed' && completed) ||
                              (status === 'pending'   && !completed);

        const matchTab =
            activeTab === 'completed' ? completed :
            activeTab === 'past'      ? isPast :
            activeTab === 'overdue'   ? isOverdue :
            (!completed && !isPast);

        return matchSearch && matchPriority && matchStatus && matchTab;
    });

    const priorityOrder = { high: 1, medium: 2, low: 3 };
    if (sort === 'newest')   filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    if (sort === 'oldest')   filtered.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    if (sort === 'priority') filtered.sort((a, b) => (priorityOrder[a.priority] || 9) - (priorityOrder[b.priority] || 9));
    if (sort === 'name')     filtered.sort((a, b) => a.name.localeCompare(b.name));

    displayTasks(filtered, activeTab);
}

function displayTasks(tasks, activeTab = 'current') {
    const grid = document.getElementById('tasks-grid');
    if (!grid) return;

    if (!tasks.length) {
        const emptyMessages = {
            current: 'No current pending tasks. Click "Add Task" to create one.',
            completed: 'No completed tasks yet. When you click "Mark Completed", finished work will appear here.',
            past: 'No past tasks found.',
            overdue: 'No overdue tasks. Great job staying on track!'
        };
        grid.innerHTML = `<p class="empty-state">${emptyMessages[activeTab] || 'No tasks found.'}</p>`;
        return;
    }

    grid.innerHTML = tasks.map(task => {
        const done = !!task.completed;
        const safeName = escapeHtml(task.name || 'Untitled Task');
        const safeDescription = escapeHtml(task.description || 'No description');
        const safePriority = escapeHtml(task.priority || 'medium');

        let colorClass = 'card-border-low';
        if (done) colorClass = 'card-border-done';
        else if (task.priority === 'high') colorClass = 'card-border-high';
        else if (task.priority === 'medium') colorClass = 'card-border-medium';

        const doneStyle = done ? 'text-decoration:line-through;opacity:0.6;' : '';
        const completeButtonClass = done ? 'btn-undo' : 'btn-done';
        const completeIcon = done ? 'arrow-counterclockwise' : 'check-circle';
        const completeLabel = done ? 'Undo Completed' : 'Mark Completed';

        return `
            <div class="item-card ${colorClass} ${done ? 'completed' : ''}">
                <div class="item-card-header">
                    <h4 style="${doneStyle}">${safeName}</h4>
                    <div class="task-header-badges">
                        ${done ? '<span class="urgency-badge urgency-done">Completed</span>' : '<span class="urgency-badge urgency-medium">Pending</span>'}
                        <span class="priority-badge priority-${safePriority}">${safePriority}</span>
                    </div>
                </div>
                <div class="item-card-body">
                    <p style="${done ? 'opacity:0.6;' : ''}">${safeDescription}</p>
                    <div class="item-meta">
                        ${task.date ? `<span><i class="bi bi-calendar"></i> ${formatDateNZ(task.date)}</span>` : ''}
                        ${task.time ? `<span><i class="bi bi-clock"></i> ${task.time}</span>` : ''}
                    </div>
                    <div class="item-actions">
                        <button class="btn-action ${completeButtonClass}" onclick="toggleTaskComplete('${task._id}')">
                            <i class="bi bi-${completeIcon}"></i> ${completeLabel}
                        </button>
                        <button class="btn-action btn-edit" onclick="editTask('${task._id}')">
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
        if (result.success) {
            showSuccessToast(newCompleted ? 'Task marked as completed!' : 'Task moved back to pending.');
            loadTasks();
        } else {
            showErrorToast('Failed to update task');
        }
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
    document.getElementById('editTaskName').value        = task.name || '';
    document.getElementById('editTaskPriority').value    = task.priority || 'medium';
    document.getElementById('editTaskDate').value        = task.date || '';

    const editTaskTime = document.getElementById('editTaskTime');
    if (editTaskTime) {
        editTaskTime.value = task.time || '23:59';
    }

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
const editTaskForm = document.getElementById('editTaskForm');
if (editTaskForm) {
    editTaskForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const id   = document.getElementById('editTaskId').value;
        const data = {
            name:        document.getElementById('editTaskName').value,
            priority:    document.getElementById('editTaskPriority').value,
            date:        document.getElementById('editTaskDate').value,
            time:        document.getElementById('editTaskTime')?.value || '23:59',
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

