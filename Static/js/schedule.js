// Schedule page JavaScript
// This file contains only the calendar and schedule-page logic moved out of script.js.
// Shared helpers such as showToast(), formatDateNZ(), formatTimeNZ(), getTodayKeyNZ(), and escapeHtml() still come from script.js.

let currentDate = new Date();
let currentView = 'week';
let scheduleStatusFilter = 'current';
let allSchedules = [];   // editable schedule-only items
let allCalendarItems = [];   // schedules + tasks + exams + classes + vacations for calendar/list display

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
            displaySchedules(allCalendarItems);
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

function getItemTypeLabel(type) {
    return {
        schedule: 'Schedule',
        task: 'Task',
        exam: 'Exam',
        class: 'Class',
        vacation: 'Vacation'
    }[type] || 'Item';
}

function getItemTypeIcon(type) {
    return {
        schedule: 'bi-calendar-event',
        task: 'bi-check2-square',
        exam: 'bi-mortarboard',
        class: 'bi-journal-bookmark',
        vacation: 'bi-airplane'
    }[type] || 'bi-calendar3';
}

function normalizeCalendarItems(schedules, tasks, exams, classes, vacations) {
    const items = [];

    (Array.isArray(schedules) ? schedules : []).forEach(s => {
        items.push({
            ...s,
            calendar_type: 'schedule',
            calendar_id: `schedule-${s._id}`,
            title: s.title || 'Untitled Schedule',
            date: s.date || '',
            end_date: s.date || '',
            time: s.time || '',
            duration: s.duration || '',
            description: s.description || '',
            source_url: '/schedule'
        });
    });

    (Array.isArray(tasks) ? tasks : []).forEach(t => {
        items.push({
            ...t,
            calendar_type: 'task',
            calendar_id: `task-${t._id}`,
            title: t.name || 'Untitled Task',
            date: t.date || '',
            end_date: t.date || '',
            time: t.time || '',
            description: t.description || '',
            source_url: '/tasks'
        });
    });

    (Array.isArray(exams) ? exams : []).forEach(e => {
        items.push({
            ...e,
            calendar_type: 'exam',
            calendar_id: `exam-${e._id}`,
            title: e.subject || 'Untitled Exam',
            date: e.date || '',
            end_date: e.date || '',
            time: e.time || '',
            duration: e.duration || '',
            description: e.notes || '',
            source_url: '/exams'
        });
    });

    (Array.isArray(classes) ? classes : []).forEach(c => {
        items.push({
            ...c,
            calendar_type: 'class',
            calendar_id: `class-${c._id}`,
            title: c.name || 'Untitled Class',
            date: c.date || '',
            end_date: c.date || '',
            time: c.time || '',
            description: [c.instructor, c.room].filter(Boolean).join(' · '),
            source_url: '/classes'
        });
    });

    (Array.isArray(vacations) ? vacations : []).forEach(v => {
        items.push({
            ...v,
            calendar_type: 'vacation',
            calendar_id: `vacation-${v._id}`,
            title: v.title || 'Untitled Vacation',
            date: v.start_date || '',
            end_date: v.end_date || v.start_date || '',
            time: '',
            description: v.description || '',
            source_url: '/vacations'
        });
    });

    return items.filter(item => item.date);
}

function calendarItemOccursOnDate(item, dateKey) {
    if (!item || !dateKey) return false;
    if (item.calendar_type === 'vacation') {
        const start = item.date;
        const end = item.end_date || item.date;
        return start <= dateKey && dateKey <= end;
    }
    if (item.calendar_type === 'schedule' || item.calendar_type === 'class') {
        return scheduleOccursOnDate(item, dateKey);
    }
    return item.date === dateKey;
}

function schedulesForDate(dateKey) {
    return allCalendarItems.filter(item => calendarItemOccursOnDate(item, dateKey));
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

function getCalendarOccurrencesInRange(items, startKey, endKey) {
    const start = parseDateKey(startKey);
    const end = parseDateKey(endKey);
    if (!start || !end) return [];

    const occurrences = [];
    const cursor = new Date(start);
    while (cursor <= end) {
        const key = dateKeyFromDate(cursor);
        items.forEach(item => {
            if (calendarItemOccursOnDate(item, key)) occurrences.push({ ...item, occurrence_date: key });
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
            block.className = `sched-event-block calendar-type-${s.calendar_type || 'schedule'}`;
            block.style.top    = `${top}px`;
            block.style.height = `${height}px`;
            block.textContent  = `${getItemTypeLabel(s.calendar_type)}: ${s.title}`;
            block.title        = `${s.time ? s.time + ' — ' : ''}${s.title}`;
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
                badge.className = `calendar-event-badge calendar-type-${schedule.calendar_type || 'schedule'}`;
                badge.dataset.id = `${schedule._id}-${dateKey}`;
                badge.textContent = schedule.time ? `${schedule.time} ${schedule.title}` : schedule.title;
                badge.title = `${getItemTypeLabel(schedule.calendar_type)}: ${schedule.title}`;
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
            item.className = `day-event-item calendar-type-${schedule.calendar_type || 'schedule'}`;
            item.textContent = `${schedule.time ? schedule.time + ' — ' : ''}${getItemTypeLabel(schedule.calendar_type)}: ${schedule.title}`;
            item.title = `${getItemTypeLabel(schedule.calendar_type)}: ${schedule.title}`;
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

    const todayOccurrences = getCalendarOccurrencesInRange(items, todayKey, todayKey);
    const weekOccurrences = getCalendarOccurrencesInRange(items, todayKey, weekEndKey);

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
            nextTitleEl.textContent = upcoming.item.title || 'Upcoming item';
            nextTimeEl.textContent = upcoming.date.toLocaleString('en-NZ', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: upcoming.item.time ? 'numeric' : undefined,
                minute: upcoming.item.time ? '2-digit' : undefined
            });
        } else {
            nextTitleEl.textContent = 'No upcoming item';
            nextTimeEl.textContent = items.length ? 'No item is due in the next 7 days' : 'Add a schedule, task, exam, class, or vacation to get started';
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
    Promise.all([
        fetch('/api/schedules').then(r => r.json()).catch(() => []),
        fetch('/api/tasks').then(r => r.json()).catch(() => []),
        fetch('/api/exams').then(r => r.json()).catch(() => []),
        fetch('/api/classes').then(r => r.json()).catch(() => []),
        fetch('/api/vacations').then(r => r.json()).catch(() => [])
    ])
        .then(([schedules, tasks, exams, classes, vacations]) => {
            allSchedules = Array.isArray(schedules) ? schedules : [];
            allCalendarItems = normalizeCalendarItems(schedules, tasks, exams, classes, vacations);
            updateScheduleOverview(allCalendarItems);
            renderCalendar();
            displaySchedules(allCalendarItems);
            injectBadges();
        })
        .catch(err => console.error('Error loading calendar items:', err));
}

function isScheduleOutdated(schedule) {
    if (!schedule || !schedule.date) return false;
    const todayKey = getTodayKeyNZ();
    if (schedule.calendar_type === 'vacation') {
        return (schedule.end_date || schedule.date) < todayKey;
    }
    if ((schedule.repeat || 'never') !== 'never') {
        return !!schedule.repeat_until && schedule.repeat_until < todayKey;
    }
    return schedule.date < todayKey;
}

function getCalendarItemDateLabel(item) {
    if (item.calendar_type === 'vacation' && item.end_date && item.end_date !== item.date) {
        return `${formatDateNZ(item.date)} to ${formatDateNZ(item.end_date)}`;
    }
    return formatDateNZ(item.date);
}

function openCalendarSource(url) {
    if (url) window.location.href = url;
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
    }).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.time || '').localeCompare(String(b.time || '')));

    if (!filteredSchedules.length) {
        const emptyMessage = scheduleStatusFilter === 'outdated'
            ? 'No outdated scheduled items'
            : 'No scheduled items yet';
        list.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-calendar-x" style="font-size:48px;color:#ccc;"></i>
                <p>${emptyMessage}</p>
                <p style="font-size:14px;color:#999;">${scheduleStatusFilter === 'outdated' ? 'Past tasks, exams, classes, vacations, and schedules will appear here automatically.' : 'Add a schedule, task, exam, class, or vacation to show it here'}</p>
            </div>`;
        return;
    }

    list.innerHTML = filteredSchedules.map(s => {
        const outdated = isScheduleOutdated(s);
        const type = s.calendar_type || 'schedule';
        const typeLabel = getItemTypeLabel(type);
        const repeatLabel = (type === 'schedule' || type === 'class') ? getScheduleRepeatLabel(s) : '';
        const repeatUntil = s.repeat_until ? ` until ${formatDateNZ(s.repeat_until)}` : '';
        const safeTitle = escapeHtml(s.title || `Untitled ${typeLabel}`);
        const safeDescription = escapeHtml(s.description || '');
        const sourceUrl = escapeHtml(s.source_url || '/schedule');
        const dateLabel = getCalendarItemDateLabel(s);
        const scheduleButtons = type === 'schedule'
            ? `<button class="btn-icon btn-edit" onclick="editSchedule('${s._id}')" title="Edit schedule" aria-label="Edit schedule"><i class="bi bi-pencil-square"></i><span>Edit</span></button>
               <button class="btn-icon btn-delete" onclick="deleteSchedule('${s._id}')" title="Delete schedule" aria-label="Delete schedule"><i class="bi bi-trash3"></i><span>Delete</span></button>`
            : `<button class="btn-open-source" onclick="openCalendarSource('${sourceUrl}')" title="Open ${typeLabel} page" aria-label="Open ${typeLabel} page"><i class="bi bi-box-arrow-up-right"></i><span>Open</span></button>`;
        return `
        <div class="schedule-item calendar-list-item calendar-type-${type} ${outdated ? 'outdated' : ''}" data-id="${s.calendar_id || s._id}">
            <div class="schedule-item-header">
                <div class="schedule-item-info">
                    <div class="calendar-title-row">
                        <span class="calendar-type-pill calendar-type-${type}"><i class="bi ${getItemTypeIcon(type)}"></i> ${typeLabel}</span>
                        ${outdated ? '<span class="schedule-status-label inline-status">Outdated</span>' : ''}
                    </div>
                    <h4 class="schedule-title">${safeTitle}</h4>
                    <div class="schedule-meta">
                        ${dateLabel ? `<span><i class="bi bi-calendar3"></i> ${dateLabel}</span>` : ''}
                        ${s.time ? `<span><i class="bi bi-clock"></i> ${escapeHtml(s.time)}</span>` : ''}
                        ${s.duration ? `<span><i class="bi bi-hourglass-split"></i> ${escapeHtml(s.duration)} min</span>` : ''}
                        ${repeatLabel ? `<span class="repeat-badge"><i class="bi bi-arrow-repeat"></i> ${escapeHtml(repeatLabel + repeatUntil)}</span>` : ''}
                    </div>
                </div>
                <div class="schedule-actions">${scheduleButtons}</div>
            </div>
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


/* ──────────────────────────────────────────────
   Moved from inline <script> in schedule.html
────────────────────────────────────────────── */
    // Live clock
    function updateTime() {
        const now = new Date();
        document.getElementById('header-time').textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        document.getElementById('header-date').textContent = now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });
    }
    updateTime(); setInterval(updateTime, 1000);

    // Activities submenu
    /* document.getElementById('activities-toggle').addEventListener('click', function(e) {
        e.preventDefault();
        document.getElementById('activities-submenu').classList.toggle('active');
        document.getElementById('activities-arrow').classList.toggle('rotated');
    }); */

    // Modal helpers
    function openModal(id) { document.getElementById(id).classList.add('active'); }
    function closeModal(id) { document.getElementById(id).classList.remove('active'); }

    document.getElementById('add-schedule-btn').addEventListener('click', () => openModal('addScheduleModal'));
    document.getElementById('closeAddScheduleModal').addEventListener('click', () => closeModal('addScheduleModal'));
    document.getElementById('closeEditScheduleModal').addEventListener('click', () => closeModal('editScheduleModal'));
    document.getElementById('closeDeleteScheduleModal').addEventListener('click', () => closeModal('deleteScheduleModal'));
    document.getElementById('cancelDeleteSchedule').addEventListener('click', () => closeModal('deleteScheduleModal'));

    document.querySelectorAll('.modal').forEach(m => {
        m.addEventListener('click', function(e) { if (e.target === this) this.classList.remove('active'); });
    });

    // Tab switching — uses data-view attribute
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            switchView(this.getAttribute('data-view'));
        });
    });
