const DASHBOARD_CONFIG = {
    suggestionRefreshInterval: 5 * 60 * 1000,
    apiEndpoints: {
        suggestions: '/get_ai_suggestions',
        tasks: '/api/tasks',
        exams: '/api/exams'
    }
};

document.addEventListener('DOMContentLoaded', function() {
    const currentPage = window.location.pathname;

    if (currentPage.includes('/dashboard') || currentPage.includes('/V2dashboard')) {
        initDashboardEnhanced();
        setupEventListeners();
        setupAutoRefresh();
    }
});

function initDashboardEnhanced() {
    fetchDashboardSuggestions();
    loadDashboardStats();
    initDashCalendar();
    loadDashCalendar();
}

function setupAutoRefresh() {
    setInterval(() => {
        fetchDashboardSuggestions();
    }, DASHBOARD_CONFIG.suggestionRefreshInterval);
}

function fetchDashboardSuggestions() {
    const suggestionBox = document.getElementById('suggestionBox');
    const suggestionContent = document.getElementById('suggestionContent');

    if (!suggestionBox || !suggestionContent) return;

    suggestionBox.classList.add('loading');
    suggestionContent.innerHTML = '<span class="spinner"></span> Loading your personalized advice...';

    fetch(DASHBOARD_CONFIG.apiEndpoints.suggestions)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            suggestionBox.classList.remove('loading');
            if (data.suggestions) {
                suggestionContent.innerText = data.suggestions;
                suggestionBox.style.display = 'block';
                suggestionBox.classList.add('fade-in');
            } else {
                setFallbackSuggestion(suggestionContent);
            }
        })
        .catch(err => {
            console.error('AI Fetch Error:', err);
            suggestionBox.classList.remove('loading');
            setFallbackSuggestion(suggestionContent);
            suggestionBox.style.display = 'block';
        });
}

function setFallbackSuggestion(element) {
    const fallbackMessages = [
        'Focus on one important task first, then move to the next one.',
        'A short, consistent study session is better than waiting for the perfect time.',
        'Review upcoming exams early so your schedule stays realistic.',
        'Use Collaboration when you need help from classmates or study groups.'
    ];

    const randomMessage = fallbackMessages[Math.floor(Math.random() * fallbackMessages.length)];
    element.innerText = randomMessage;
}

function loadDashboardStats() {
    loadTaskStats();
    loadExamStats();
}

function loadTaskStats() {
    fetch(DASHBOARD_CONFIG.apiEndpoints.tasks)
        .then(response => response.json())
        .then(tasks => {
            const totalTasks = Array.isArray(tasks) ? tasks.length : 0;
            const completedTasks = Array.isArray(tasks) ? tasks.filter(t => t.completed).length : 0;
            const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

            updateStatElement('totalTasks', totalTasks);
            updateStatElement('completedTasks', completedTasks);
            updateStatElement('completionRate', completionRate + '%');
        })
        .catch(error => console.error('Error loading tasks:', error));
}

function loadExamStats() {
    fetch(DASHBOARD_CONFIG.apiEndpoints.exams)
        .then(response => response.json())
        .then(exams => {
            const upcomingExams = Array.isArray(exams) ? exams.filter(e => {
                const examDate = new Date(e.date);
                return examDate >= new Date();
            }).length : 0;

            updateStatElement('upcomingExams', upcomingExams);
        })
        .catch(error => console.error('Error loading exams:', error));
}

function updateStatElement(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerText = value;
    }
}

function setupEventListeners() {
    setupTaskEventListeners();
    setupOutdatedItemsEventListeners();
}

function setupTaskEventListeners() {
    const taskItems = document.querySelectorAll('.task-item[data-task-id]');
    taskItems.forEach(item => {
        item.addEventListener('click', function(e) {
            if (!e.target.closest('button')) {
                const taskId = this.getAttribute('data-task-id');
                if (taskId) {
                    toggleTaskCompletion(this, taskId);
                }
            }
        });
    });
}

function setupOutdatedItemsEventListeners() {
    const clearOutdatedBtn = document.getElementById('clear-outdated-btn');
    if (clearOutdatedBtn) {
        clearOutdatedBtn.addEventListener('click', function() {
            clearOutdatedItems();
        });
    }
}

function toggleTaskCompletion(taskElement, taskId) {
    taskElement.style.opacity = '0.5';
    taskElement.style.textDecoration = 'line-through';

    fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: true })
    })
        .then(response => response.json())
        .then(() => {
            setTimeout(() => {
                taskElement.remove();
                loadDashboardStats();
            }, 300);
        })
        .catch(error => {
            console.error('Error updating task:', error);
            taskElement.style.opacity = '1';
            taskElement.style.textDecoration = 'none';
        });
}

function clearOutdatedItems() {
    if (confirm('Are you sure you want to clear all outdated items?')) {
        fetch('/api/clear-outdated', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    location.reload();
                }
            })
            .catch(error => console.error('Error clearing outdated items:', error));
    }
}

function refreshDashboard() {
    fetchDashboardSuggestions();
    loadDashboardStats();
}

function formatDateNZDashboard(dateString) {
    if (!dateString) return '';

    const parts = String(dateString).split('-');
    if (parts.length === 3) {
        const [year, month, day] = parts;
        return `${day}/${month}/${year}`;
    }

    return dateString;
}

function showNotification(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
}

async function generateStudyPlan() {
    const btn = document.getElementById('generatePlanBtn');
    const loading = document.getElementById('studyPlanLoading');
    const content = document.getElementById('studyPlanContent');
    const planText = document.getElementById('studyPlanText');
    const empty = document.getElementById('studyPlanEmpty');

    if (!btn) return;

    const showError = (message) => {
        if (loading) loading.style.display = 'none';
        if (content) content.style.display = 'none';
        if (empty) {
            empty.innerHTML = `<p style="color:#e74c3c;">${message}</p>`;
            empty.style.display = 'block';
        }
    };

    const showPlan = (plan) => {
        if (loading) loading.style.display = 'none';
        if (empty) empty.style.display = 'none';
        if (planText) planText.textContent = plan;
        if (content) content.style.display = 'block';
    };

    const resetButton = () => {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-magic"></i> Generate Plan';
    };

    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Generating...';
    if (loading) loading.style.display = 'flex';
    if (content) content.style.display = 'none';
    if (empty) empty.style.display = 'none';

    try {
        const response = await fetch('/api/study_plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requested_at: new Date().toISOString() })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Server error while starting plan generation.');
        }

        // Some versions may return the plan immediately.
        if (data.plan) {
            showPlan(data.plan);
            return;
        }

        // Current backend returns HTTP 202 with task_id, then the browser must poll the task-status endpoint.

        if (!data.task_id) {
            showError('Could not start plan generation. Please try again.');
            return;
        }

        const maxAttempts = 40; // 40 x 2 seconds = up to 80 seconds
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 2000));

            const statusResponse = await fetch(`/api/ai-task-status/${data.task_id}`);

            const statusData = await statusResponse.json();

            if (!statusResponse.ok) {
                throw new Error(statusData.error || 'Server error while checking plan status.');
            }

            if (statusData.status === 'success') {
                const result = statusData.result || {};
                if (result.success && result.plan) {
                    showPlan(result.plan);
                    return;
                }
                showError(result.error || 'The AI finished but did not return a study plan.');
                return;
            }

            if (statusData.status === 'failed') {
                showError(statusData.error || 'Plan generation failed. Please check Flask/Celery logs.');
                return;
            }
        }

        showError('Plan generation is taking too long. Please make sure Redis and the Celery worker are running, then try again.');
    } catch (error) {
        console.error('Study plan generation error:', error);
        showError(error.message || 'Network error. Please check your connection and try again.');
    } finally {
        resetButton();
    }
}

/* MINI CALENDAR */

let dashCalDate = new Date();
let dashCalItems = [];   // normalised calendar items for the dashboard

// Month names helper
const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

// Date key helper (YYYY-MM-DD)
function dashDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

// Fetch all calendar data and render
function loadDashCalendar() {
    Promise.all([
        fetch('/api/schedules').then(r => r.json()).catch(() => []),
        fetch('/api/tasks').then(r => r.json()).catch(() => []),
        fetch('/api/exams').then(r => r.json()).catch(() => []),
        fetch('/api/classes').then(r => r.json()).catch(() => []),
        fetch('/api/vacations').then(r => r.json()).catch(() => [])
    ]).then(([schedules, tasks, exams, classes, vacations]) => {
        dashCalItems = buildDashCalItems(schedules, tasks, exams, classes, vacations);
        renderDashCalendar();
        loadProgressBreakdown(tasks, exams, schedules);
    }).catch(err => console.error('Dashboard calendar load error:', err));
}

// Normalise all items into a flat array
function buildDashCalItems(schedules, tasks, exams, classes, vacations) {
    const items = [];
    (Array.isArray(schedules) ? schedules : []).forEach(s => {
        items.push({ ...s, _type: 'schedule', _title: s.title || 'Schedule', _date: s.date || '', _end: s.date || '' });
    });
    (Array.isArray(tasks) ? tasks : []).forEach(t => {
        items.push({ ...t, _type: 'task', _title: t.name || 'Task', _date: t.date || '', _end: t.date || '' });
    });
    (Array.isArray(exams) ? exams : []).forEach(e => {
        items.push({ ...e, _type: 'exam', _title: e.subject || 'Exam', _date: e.date || '', _end: e.date || '' });
    });
    (Array.isArray(classes) ? classes : []).forEach(c => {
        items.push({ ...c, _type: 'class', _title: c.name || 'Class', _date: c.date || '', _end: c.date || '' });
    });
    (Array.isArray(vacations) ? vacations : []).forEach(v => {
        items.push({ ...v, _type: 'vacation', _title: v.title || 'Vacation', _date: v.start_date || '', _end: v.end_date || v.start_date || '' });
    });
    return items.filter(i => i._date);
}

// Check if an item occurs on a given date key
function dashItemOnDate(item, dateKey) {
    if (!item || !item._date || !dateKey) return false;
    if (item._type === 'vacation') {
        return item._date <= dateKey && dateKey <= (item._end || item._date);
    }
    // Recurring schedule/class
    if ((item._type === 'schedule' || item._type === 'class') && item.repeat && item.repeat !== 'never') {
        return dashScheduleOccurs(item, dateKey);
    }
    return item._date === dateKey;
}

// Simple recurrence check (mirrors schedule.js logic)
function dashScheduleOccurs(item, dateKey) {
    const repeat = item.repeat || 'never';
    if (repeat === 'never') return item._date === dateKey;
    if (item.repeat_until && dateKey > item.repeat_until) return false;
    const start = new Date(item._date + 'T00:00:00');
    const target = new Date(dateKey + 'T00:00:00');
    const diff = Math.round((target - start) / 86400000);
    if (diff < 0) return false;
    if (repeat === 'daily') return true;
    if (repeat === 'weekdays') { const d = target.getDay(); return d >= 1 && d <= 5; }
    if (repeat === 'weekly') return diff % 7 === 0;
    if (repeat === 'monthly') return target.getDate() === start.getDate();
    if (repeat === 'yearly') return target.getMonth() === start.getMonth() && target.getDate() === start.getDate();
    if (repeat === 'custom') {
        const interval = parseInt(item.repeat_interval || 1, 10);
        const unit = item.repeat_unit || 'weeks';
        if (unit === 'days')   return diff % interval === 0;
        if (unit === 'weeks')  return diff % (interval * 7) === 0;
        if (unit === 'months') return target.getDate() === start.getDate() && (target.getMonth() - start.getMonth() + (target.getFullYear() - start.getFullYear()) * 12) % interval === 0;
    }
    return false;
}

// Get items for a specific date key
function dashItemsForDate(dateKey) {
    return dashCalItems.filter(i => dashItemOnDate(i, dateKey));
}

// Render the mini calendar grid
function renderDashCalendar() {
    const grid = document.getElementById('dash-cal-grid');
    const label = document.getElementById('dash-cal-month-label');
    if (!grid) return;

    const year  = dashCalDate.getFullYear();
    const month = dashCalDate.getMonth();
    if (label) label.textContent = `${MONTH_NAMES[month]} ${year}`;

    const today         = new Date();
    const todayKey      = dashDateKey(today);
    const firstDayIdx   = new Date(year, month, 1).getDay();
    const lastDate      = new Date(year, month + 1, 0).getDate();
    const prevLastDate  = new Date(year, month, 0).getDate();

    grid.innerHTML = '';

    // Leading cells from previous month
    for (let i = firstDayIdx; i > 0; i--) {
        const cell = document.createElement('div');
        cell.className = 'mini-cal-day other-month';
        cell.innerHTML = `<span class="mini-cal-day-num">${prevLastDate - i + 1}</span>`;
        grid.appendChild(cell);
    }

    // Current month cells
    for (let d = 1; d <= lastDate; d++) {
        const date    = new Date(year, month, d);
        const dateKey = dashDateKey(date);
        const items   = dashItemsForDate(dateKey);

        const cell = document.createElement('div');
        cell.className = 'mini-cal-day';
        if (dateKey === todayKey) cell.classList.add('today');
        if (items.length > 0)    cell.classList.add('has-events');
        cell.dataset.date = dateKey;

        // Day number
        const numSpan = document.createElement('span');
        numSpan.className = 'mini-cal-day-num';
        numSpan.textContent = d;
        cell.appendChild(numSpan);

        // Dots (max 4 to keep it tidy)
        if (items.length > 0) {
            const dotsRow = document.createElement('div');
            dotsRow.className = 'mini-cal-dots';
            const shown = items.slice(0, 4);
            shown.forEach(item => {
                const dot = document.createElement('span');
                dot.className = `mini-cal-dot dot-${item._type}`;
                dotsRow.appendChild(dot);
            });
            cell.appendChild(dotsRow);
        }

        // Click handler > show detail
        cell.addEventListener('click', () => showDashCalDetail(dateKey, items));
        grid.appendChild(cell);
    }

    // Trailing cells
    const total = firstDayIdx + lastDate;
    const trailing = total % 7 === 0 ? 0 : 7 - (total % 7);
    for (let d = 1; d <= trailing; d++) {
        const cell = document.createElement('div');
        cell.className = 'mini-cal-day other-month';
        cell.innerHTML = `<span class="mini-cal-day-num">${d}</span>`;
        grid.appendChild(cell);
    }
}

// Show day detail popover
function showDashCalDetail(dateKey, items) {
    const detail = document.getElementById('dash-cal-detail');
    const dateLabel = document.getElementById('dash-cal-detail-date');
    const list = document.getElementById('dash-cal-detail-list');
    if (!detail || !list) return;

    // Format date label
    const [y, m, d] = dateKey.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const opts = { weekday: 'short', day: 'numeric', month: 'short' };
    if (dateLabel) dateLabel.textContent = dateObj.toLocaleDateString('en-NZ', opts);

    list.innerHTML = '';
    if (!items || items.length === 0) {
        list.innerHTML = `<li class="mini-cal-detail-empty">No events on this day.</li>`;
    } else {
        items.forEach(item => {
            const li = document.createElement('li');
            const dot = document.createElement('span');
            dot.className = `mini-cal-dot dot-${item._type}`;
            const text = document.createTextNode(item._title);
            li.appendChild(dot);
            li.appendChild(text);
            list.appendChild(li);
        });
    }

    detail.style.display = 'block';
}

// Progress breakdown bars
function loadProgressBreakdown(tasks, exams, schedules) {
    const taskArr  = Array.isArray(tasks)     ? tasks     : [];
    const examArr  = Array.isArray(exams)     ? exams     : [];
    const schedArr = Array.isArray(schedules) ? schedules : [];

    const taskPct  = taskArr.length  > 0 ? Math.round(taskArr.filter(t => t.completed).length  / taskArr.length  * 100) : 0;
    const examPct  = examArr.length  > 0 ? Math.round(examArr.filter(e => e.completed).length  / examArr.length  * 100) : 0;
    const schedPct = schedArr.length > 0 ? Math.round(schedArr.filter(s => s.completed).length / schedArr.length * 100) : 0;

    const setBar = (fillId, pctId, pct) => {
        const fill = document.getElementById(fillId);
        const pctEl = document.getElementById(pctId);
        if (fill)  fill.style.width = pct + '%';
        if (pctEl) pctEl.textContent = pct + '%';
    };

    setBar('pb-tasks-fill',     'pb-tasks-pct',     taskPct);
    setBar('pb-exams-fill',     'pb-exams-pct',     examPct);
    setBar('pb-schedules-fill', 'pb-schedules-pct', schedPct);
}

// Wire up calendar nav buttons
function initDashCalendar() {
    document.getElementById('dash-cal-prev')?.addEventListener('click', () => {
        dashCalDate.setMonth(dashCalDate.getMonth() - 1);
        renderDashCalendar();
    });
    document.getElementById('dash-cal-next')?.addEventListener('click', () => {
        dashCalDate.setMonth(dashCalDate.getMonth() + 1);
        renderDashCalendar();
    });
    document.getElementById('dash-cal-detail-close')?.addEventListener('click', () => {
        const detail = document.getElementById('dash-cal-detail');
        if (detail) detail.style.display = 'none';
    });
    // Close detail when clicking outside
    document.addEventListener('click', (e) => {
        const detail = document.getElementById('dash-cal-detail');
        if (!detail) return;
        if (!detail.contains(e.target) && !e.target.closest('.mini-cal-day')) {
            detail.style.display = 'none';
        }
    });
}

window.dashboardUtils = {
    refreshDashboard,
    toggleTaskCompletion,
    clearOutdatedItems,
    fetchDashboardSuggestions,
    loadDashboardStats,
    formatDateNZDashboard,
    showNotification
};

        // Live clock
        function updateTime() {
            const now = new Date();
            document.getElementById('header-time').textContent =
                now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            document.getElementById('header-date').textContent =
                now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });
        }
        updateTime();
        setInterval(updateTime, 1000);



        // Activities submenu
        /* document.getElementById('activities-toggle').addEventListener('click', function (e) {
            e.preventDefault();
            document.getElementById('activities-submenu').classList.toggle('active');
            document.getElementById('activities-arrow').classList.toggle('rotated');
        }); */

        // Modal open
        document.getElementById('add-task-btn').addEventListener('click', function () {
            document.getElementById('addTaskModal').classList.add('active');
        });

        // Modal close
        document.getElementById('modal-close').addEventListener('click', function () {
            document.getElementById('addTaskModal').classList.remove('active');
        });

        document.getElementById('addTaskModal').addEventListener('click', function (e) {
            if (e.target === this) this.classList.remove('active');
        });
