// Global variables
let currentDate = new Date();
let currentView = 'week';

// NZ Date/Time Formatting Functions
function formatDateNZ(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function formatTimeNZ(timeString) {
    if (!timeString) return '';
    // Already in 24-hour format, just return as is
    return timeString;
}

function formatDateTimeNZ(dateString, timeString) {
    return `${formatDateNZ(dateString)} ${formatTimeNZ(timeString)}`;
}

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

// Sidebar Submenu Toggle
document.addEventListener('DOMContentLoaded', function() {
    const activitiesToggle = document.getElementById('activities-toggle');
    const activitiesSubmenu = document.getElementById('activities-submenu');
    
    if (activitiesToggle && activitiesSubmenu) {
        activitiesToggle.addEventListener('click', function(e) {
            e.preventDefault();
            activitiesSubmenu.classList.toggle('active');
            const arrow = activitiesToggle.querySelector('.submenu-arrow');
            if (arrow) {
                arrow.classList.toggle('rotated');
            }
        });
    }
    
    // Initialize page-specific functionality
    const currentPage = window.location.pathname;
    
    if (currentPage.includes('/dashboard')) {
        initDashboard();
    } else if (currentPage.includes('/schedule')) {
        initSchedule();
    } else if (currentPage.includes('/tasks')) {
        initTasks();
    } else if (currentPage.includes('/exams')) {
        initExams();
    } else if (currentPage.includes('/classes')) {
        initClasses();
    } else if (currentPage.includes('/vacations')) {
        initVacations();
    } else if (currentPage.includes('/settings')) {
        initSettings();
    }
});

function initSettings() {
    fetch('/api/settings')
        .then(r => r.ok ? r.json() : {})
        .then(data => {
            const map = {
                darkMode:       'dark_mode',
                taskReminders:  'task_reminders',
                examAlerts:     'exam_alerts',
                studyDuration:  'study_duration',
                breakDuration:  'break_duration',
                defaultView:    'default_view'
            };

            for (const [elementId, key] of Object.entries(map)) {
                const el = document.getElementById(elementId);
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
    }
}


if (typeof showToast === 'undefined') {
    function showToast(message, type = 'success') {
        const icon  = type === 'success' ? 'check-circle' : 'exclamation-circle';
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<i class="bi bi-${icon}"></i> ${message}`;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'toastSlideOut 0.3s ease-in forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}


// Dashboard Functions
function initDashboard() {
    fetchAISuggestions();
    const addTaskBtn = document.getElementById('add-task-btn');
    const addTaskModal = document.getElementById('addTaskModal');
    const closeModal = addTaskModal ? addTaskModal.querySelector('.close') : null;
    const addTaskForm = document.getElementById('addTaskForm');
    
    if (addTaskBtn && addTaskModal) {
        addTaskBtn.addEventListener('click', function() {
            addTaskModal.style.display = 'block';
        });
    }
    
    if (closeModal) {
        closeModal.addEventListener('click', function() {
            addTaskModal.style.display = 'none';
        });
    }
    
    if (addTaskForm) {
        addTaskForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const taskData = {
                name: document.getElementById('taskName').value,
                priority: document.getElementById('taskPriority').value
            };
            
            fetch('/api/tasks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(taskData)
            })
            .then(response => response.json())
            .then(data => {
                alert('Task added successfully!');
                addTaskModal.style.display = 'none';
                addTaskForm.reset();
                location.reload();
            })
            .catch(error => {
                console.error('Error:', error);
                alert('Failed to add task');
            });
        });
    }
    
    // Load tasks and exams for dashboard
    loadDashboardData();
}

function loadDashboardData() {
    // Load tasks
    fetch('/api/tasks')
        .then(response => response.json())
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
        .catch(error => console.error('Error loading tasks:', error));
    
    // Load exams
    fetch('/api/exams')
        .then(response => response.json())
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
        .catch(error => console.error('Error loading exams:', error));
}

// Schedule Functions
function initSchedule() {
    const addScheduleBtn = document.getElementById('add-schedule-btn');
    const addScheduleModal = document.getElementById('addScheduleModal');
    const closeModal = addScheduleModal ? addScheduleModal.querySelector('.close') : null;
    const addScheduleForm = document.getElementById('addScheduleForm');
    
    // Tab buttons
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const view = this.getAttribute('data-view');
            switchView(view);
        });
    });
    
    // Month navigation
    const prevMonthBtn = document.getElementById('prev-month');
    const nextMonthBtn = document.getElementById('next-month');
    
    if (prevMonthBtn) {
        prevMonthBtn.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            renderCalendar();
        });
    }
    
    if (nextMonthBtn) {
        nextMonthBtn.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            renderCalendar();
        });
    }
    
    // Add schedule modal
    if (addScheduleBtn && addScheduleModal) {
        addScheduleBtn.addEventListener('click', function() {
            addScheduleModal.style.display = 'block';
        });
    }
    
    if (closeModal) {
        closeModal.addEventListener('click', function() {
            addScheduleModal.style.display = 'none';
        });
    }
    
    if (addScheduleForm) {
        addScheduleForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const scheduleData = {
                title: document.getElementById('scheduleTitle').value,
                date: document.getElementById('scheduleDate').value,
                time: document.getElementById('scheduleTime').value,
                duration: document.getElementById('scheduleDuration').value,
                description: document.getElementById('scheduleDescription').value
            };
            
            fetch('/api/schedules', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(scheduleData)
            })
            .then(response => response.json())
            .then(data => {
                alert('Schedule added successfully!');
                addScheduleModal.style.display = 'none';
                addScheduleForm.reset();
                loadSchedules();
            })
            .catch(error => {
                console.error('Error:', error);
                alert('Failed to add schedule');
            });
        });
    }
    
    // Initial render
    renderCalendar();
    loadSchedules();
}

function switchView(view) {
    currentView = view;
    
    // Update active tab
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-view') === view) {
            btn.classList.add('active');
        }
    });
    
    // Hide all views
    const weekView = document.getElementById('week-view');
    const dayView = document.getElementById('day-view');
    const monthView = document.getElementById('month-view');
    
    if (weekView) weekView.style.display = 'none';
    if (dayView) dayView.style.display = 'none';
    if (monthView) monthView.style.display = 'none';
    
    // Show selected view
    if (view === 'week' && weekView) {
        weekView.style.display = 'block';
    } else if (view === 'day' && dayView) {
        dayView.style.display = 'block';
    } else if (view === 'month' && monthView) {
        monthView.style.display = 'block';
    }
    
    renderCalendar();
}

function renderCalendar() {
    const monthYearElement = document.getElementById('current-month');
    if (monthYearElement) {
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];
        monthYearElement.textContent = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
    
    if (currentView === 'week') {
        renderWeekView();
    } else if (currentView === 'day') {
        renderDayView();
    } else if (currentView === 'month') {
        renderMonthView();
    }
}

function renderWeekView() {
    const weekGrid = document.getElementById('week-grid');
    if (!weekGrid) return;
    
    weekGrid.innerHTML = '';
    
    const today = new Date();
    const dayOfWeek = today.getDay();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek);
    
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        
        const dayCard = document.createElement('div');
        dayCard.className = 'calendar-day';
        if (date.toDateString() === today.toDateString()) {
            dayCard.classList.add('today');
        }
        
        dayCard.innerHTML = `
            <div class="day-number">${days[i]} ${date.getDate()}</div>
            <div class="day-events"></div>
        `;
        
        weekGrid.appendChild(dayCard);
    }
}

function renderDayView() {
    const dayTimeline = document.getElementById('day-slots');
    if (!dayTimeline) return;
    
    dayTimeline.innerHTML = '';
    
    for (let hour = 0; hour < 24; hour++) {
        const timeSlot = document.createElement('div');
        timeSlot.className = 'time-slot';
        
        const timeLabel = String(hour).padStart(2, '0') + ':00';
        
        timeSlot.innerHTML = `
            <div class="time-label">${timeLabel}</div>
            <div class="time-content"></div>
        `;
        
        dayTimeline.appendChild(timeSlot);
    }
}

function renderMonthView() {
    const monthGrid = document.getElementById('month-grid');
    if (!monthGrid) return;
    
    monthGrid.innerHTML = '';
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const prevLastDay = new Date(year, month, 0);
    
    const firstDayIndex = firstDay.getDay();
    const lastDateOfMonth = lastDay.getDate();
    const prevLastDate = prevLastDay.getDate();
    
    // Previous month days
    for (let i = firstDayIndex; i > 0; i--) {
        const day = document.createElement('div');
        day.className = 'calendar-day other-month';
        day.innerHTML = `<div class="day-number">${prevLastDate - i + 1}</div>`;
        monthGrid.appendChild(day);
    }
    
    // Current month days
    const today = new Date();
    for (let i = 1; i <= lastDateOfMonth; i++) {
        const day = document.createElement('div');
        day.className = 'calendar-day';
        
        if (i === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
            day.classList.add('today');
        }
        
        day.innerHTML = `<div class="day-number">${i}</div>`;
        monthGrid.appendChild(day);
    }
    
    // Next month days
    const remainingCells = 42 - (firstDayIndex + lastDateOfMonth);
    for (let i = 1; i <= remainingCells; i++) {
        const day = document.createElement('div');
        day.className = 'calendar-day other-month';
        day.innerHTML = `<div class="day-number">${i}</div>`;
        monthGrid.appendChild(day);
    }
}

function loadSchedules() {
    fetch('/api/schedules')
        .then(response => response.json())
        .then(schedules => {
            displaySchedules(schedules);
        })
        .catch(error => console.error('Error loading schedules:', error));
}

function displaySchedules(schedules) {
    const scheduleListItems = document.getElementById('schedule-list-items');
    if (!scheduleListItems) {
        console.error('schedule-list-items element not found');
        return;
    }
    
    if (schedules.length === 0) {
        scheduleListItems.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-calendar-x" style="font-size: 48px; color: #ccc;"></i>
                <p>No scheduled items yet</p>
                <p style="font-size: 14px; color: #999;">Click "Add Schedule" to create your first schedule item</p>
            </div>
        `;
        return;
    }
    
    scheduleListItems.innerHTML = schedules.map(schedule => `
        <div class="schedule-item" data-id="${schedule._id}">
            <div class="schedule-item-header">
                <div class="schedule-item-info">
                    <h4 class="schedule-title">${schedule.title}</h4>
                    <div class="schedule-meta">
                        <span class="schedule-date">
                            <i class="bi bi-calendar3"></i> ${schedule.date}
                        </span>
                        <span class="schedule-time">
                            <i class="bi bi-clock"></i> ${schedule.time}
                        </span>
                        ${schedule.duration ? `
                        <span class="schedule-duration">
                            <i class="bi bi-hourglass-split"></i> ${schedule.duration} min
                        </span>
                        ` : ''}
                    </div>
                </div>
                <div class="schedule-actions">
                    <button class="btn-icon btn-edit" onclick="editSchedule('${schedule._id}')" title="Edit">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn-icon btn-delete" onclick="deleteSchedule('${schedule._id}')" title="Delete">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
            ${schedule.description ? `
            <div class="schedule-description">
                <p>${schedule.description}</p>
            </div>
            ` : ''}
        </div>
    `).join('');
}

// Tasks Page Functions
function initTasks() {
    const addTaskBtn = document.getElementById('add-task-page-btn');
    const addTaskModal = document.getElementById('addTaskModal');
    const closeModal = addTaskModal ? addTaskModal.querySelector('.close') : null;
    const addTaskForm = document.getElementById('addTaskForm');
    
    if (addTaskBtn && addTaskModal) {
        addTaskBtn.addEventListener('click', function() {
            addTaskModal.style.display = 'block';
        });
    }
    
    if (closeModal) {
        closeModal.addEventListener('click', function() {
            addTaskModal.style.display = 'none';
        });
    }
    
    if (addTaskForm) {
        addTaskForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const taskData = {
                name: document.getElementById('taskName').value,
                priority: document.getElementById('taskPriority').value,
                date: document.getElementById('taskDate').value,
                description: document.getElementById('taskDescription').value
            };
            
            fetch('/api/tasks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(taskData)
            })
            .then(response => response.json())
            .then(data => {
                alert('Task added successfully!');
                addTaskModal.style.display = 'none';
                addTaskForm.reset();
                loadTasks();
            })
            .catch(error => {
                console.error('Error:', error);
                alert('Failed to add task');
            });
        });
    }
    
    loadTasks();
}

let allTasks = [];

function loadTasks() {
    fetch('/api/tasks')
        .then(response => response.json())
        .then(tasks => {
            allTasks = tasks;
            filterTasks();
        })
        .catch(error => console.error('Error loading tasks:', error));
}

function filterTasks() {
    const search   = (document.getElementById('taskSearch')?.value || '').toLowerCase();
    const priority = document.getElementById('taskPriorityFilter')?.value || '';
    const status   = document.getElementById('taskStatusFilter')?.value || '';
    const sort     = document.getElementById('taskSort')?.value || 'newest';

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
    const tasksGrid = document.getElementById('tasks-grid');
    if (!tasksGrid) return;

    if (tasks.length === 0) {
        tasksGrid.innerHTML = '<p class="empty-state">No tasks yet. Click "Add Task" to create one.</p>';
        return;
    }

    tasksGrid.innerHTML = tasks.map(task => {
        const isCompleted = task.completed || false;

        // Determine left-border colour class
        let colorClass = 'card-border-low';
        if (isCompleted) {
            colorClass = 'card-border-done';
        } else if (task.priority === 'high') {
            colorClass = 'card-border-high';
        } else if (task.priority === 'medium') {
            colorClass = 'card-border-medium';
        }

        return `
            <div class="item-card ${colorClass} ${isCompleted ? 'completed' : ''}">
                <div class="item-card-header">
                    <div class="task-checkbox">
                        <input type="checkbox" ${isCompleted ? 'checked' : ''}
                               onchange="toggleTaskComplete('${task._id}')"
                               id="task-${task._id}">
                    </div>
                    <h4 style="${isCompleted ? 'text-decoration: line-through; opacity: 0.6;' : ''}">${task.name}</h4>
                    <span class="priority-badge priority-${task.priority}">${task.priority}</span>
                </div>
                <div class="item-card-body">
                    <p style="${isCompleted ? 'opacity: 0.6;' : ''}">${task.description || 'No description'}</p>
                    <div class="item-meta">
                        ${task.date ? `<span><i class="bi bi-calendar"></i> ${formatDateNZ(task.date)}</span>` : ''}
                    </div>
                    <div class="item-actions">
                        <button class="btn-action btn-edit" onclick="editTask('${task._id}')">
                            <i class="bi bi-pencil"></i> Edit
                        </button>
                        <button class="btn-action btn-delete" onclick="deleteTask('${task._id}')">
                            <i class="bi bi-trash"></i> Delete
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Exams Page Functions
function initExams() {
    const addExamBtn = document.getElementById('add-exam-page-btn');
    const addExamModal = document.getElementById('addExamModal');
    const closeModal = addExamModal ? addExamModal.querySelector('.close') : null;
    const addExamForm = document.getElementById('addExamForm');
    
    if (addExamBtn && addExamModal) {
        addExamBtn.addEventListener('click', function() {
            addExamModal.style.display = 'block';
        });
    }
    
    if (closeModal) {
        closeModal.addEventListener('click', function() {
            addExamModal.style.display = 'none';
        });
    }
    
    if (addExamForm) {
        addExamForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const examData = {
                subject: document.getElementById('examSubject').value,
                date: document.getElementById('examDate').value,
                time: document.getElementById('examTime').value,
                duration: document.getElementById('examDuration').value,
                notes: document.getElementById('examNotes').value
            };
            
            fetch('/api/exams', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(examData)
            })
            .then(response => response.json())
            .then(data => {
                alert('Exam added successfully!');
                addExamModal.style.display = 'none';
                addExamForm.reset();
                loadExams();
            })
            .catch(error => {
                console.error('Error:', error);
                alert('Failed to add exam');
            });
        });
    }
    
    loadExams();
}

let allExams = [];

function loadExams() {
    fetch('/api/exams')
        .then(response => response.json())
        .then(exams => {
            allExams = exams;
            filterExams();
        })
        .catch(error => console.error('Error loading exams:', error));
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

    examsGrid.innerHTML = exams.map(exam => {
        // Calculate days until exam for urgency colour
        const today    = new Date();
        const examDate = new Date(exam.date);
        const daysLeft = Math.ceil((examDate - today) / (1000 * 60 * 60 * 24));

        let colorClass = 'card-border-low';          // green — plenty of time
        if (daysLeft <= 3)      colorClass = 'card-border-high';    // red — urgent
        else if (daysLeft <= 7) colorClass = 'card-border-medium';  // orange — soon

        // Urgency label shown next to the subject
        let urgencyBadge = '';
        if (daysLeft <= 3)      urgencyBadge = '<span class="urgency-badge urgency-high">Urgent</span>';
        else if (daysLeft <= 7) urgencyBadge = '<span class="urgency-badge urgency-medium">Soon</span>';
        else                    urgencyBadge = '<span class="urgency-badge urgency-low">Upcoming</span>';

        return `
            <div class="item-card ${colorClass}">
                <div class="item-card-header">
                    <h4>${exam.subject}</h4>
                    ${urgencyBadge}
                </div>
                <div class="item-card-body">
                    <p>${exam.notes || 'No notes'}</p>
                    <div class="item-meta">
                        <span><i class="bi bi-calendar"></i> ${formatDateNZ(exam.date)}</span>
                        <span><i class="bi bi-clock"></i> ${formatTimeNZ(exam.time)}</span>
                        <span><i class="bi bi-hourglass"></i> ${exam.duration} min</span>
                    </div>
                    <div class="item-actions">
                        <button class="btn-action btn-edit" onclick="editExam('${exam._id}')">
                            <i class="bi bi-pencil"></i> Edit
                        </button>
                        <button class="btn-action btn-delete" onclick="deleteExam('${exam._id}')">
                            <i class="bi bi-trash"></i> Delete
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

// Classes Page Functions
function initClasses() {
    const addClassBtn = document.getElementById('add-class-page-btn');
    const addClassModal = document.getElementById('addClassModal');
    const closeModal = addClassModal ? addClassModal.querySelector('.close') : null;
    const addClassForm = document.getElementById('addClassForm');
    
    if (addClassBtn && addClassModal) {
        addClassBtn.addEventListener('click', function() {
            addClassModal.style.display = 'block';
        });
    }
    
    if (closeModal) {
        closeModal.addEventListener('click', function() {
            addClassModal.style.display = 'none';
        });
    }
    
    if (addClassForm) {
        addClassForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const classData = {
                name: document.getElementById('className').value,
                instructor: document.getElementById('classInstructor').value,
                day: document.getElementById('classDay').value,
                time: document.getElementById('classTime').value,
                room: document.getElementById('classRoom').value
            };
            
            fetch('/api/classes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(classData)
            })
            .then(response => response.json())
            .then(data => {
                alert('Class added successfully!');
                addClassModal.style.display = 'none';
                addClassForm.reset();
                loadClasses();
            })
            .catch(error => {
                console.error('Error:', error);
                alert('Failed to add class');
            });
        });
    }
    
    loadClasses();
}

// Store classes globally so search/filter/sort can work without re-fetching
let allClasses = [];

function loadClasses() {
    fetch('/api/classes')
        .then(response => response.json())
        .then(classes => {
            allClasses = classes;
            filterClasses();
        })
        .catch(error => console.error('Error loading classes:', error));
}

function filterClasses() {
    const search = (document.getElementById('classSearch')?.value || '').toLowerCase();
    const day    = document.getElementById('classDayFilter')?.value || '';
    const sort   = document.getElementById('classSort')?.value || 'name';

    let filtered = allClasses.filter(cls => {
        const matchSearch = cls.name.toLowerCase().includes(search) ||
                            (cls.instructor || '').toLowerCase().includes(search);
        const matchDay    = !day || cls.day === day;
        return matchSearch && matchDay;
    });

    const dayOrder = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 7 };

    if (sort === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'day')  filtered.sort((a, b) => (dayOrder[a.day] || 9) - (dayOrder[b.day] || 9));

    displayClasses(filtered);
}

    classesGrid.innerHTML = classes.map(classItem => `
        <div class="item-card card-border-info">
            <div class="item-card-header">
                <h4>${classItem.name}</h4>
                <span class="urgency-badge urgency-info">${classItem.day}</span>
            </div>
            <div class="item-card-body">
                <p><strong>Instructor:</strong> ${classItem.instructor || 'N/A'}</p>
                <div class="item-meta">
                    <span><i class="bi bi-calendar"></i> ${classItem.day}</span>
                    <span><i class="bi bi-clock"></i> ${formatTimeNZ(classItem.time)}</span>
                    ${classItem.room ? `<span><i class="bi bi-door-open"></i> ${classItem.room}</span>` : ''}
                </div>
                <div class="item-actions">
                    <button class="btn-action btn-edit" onclick="editClass('${classItem._id}')">
                        <i class="bi bi-pencil"></i> Edit
                    </button>
                    <button class="btn-action btn-delete" onclick="deleteClass('${classItem._id}')">
                        <i class="bi bi-trash"></i> Delete
                    </button>
                </div>
            </div>
        </div>
    `).join('');

// Vacations Page Functions
function initVacations() {
    const addVacationBtn = document.getElementById('add-vacation-page-btn');
    const addVacationModal = document.getElementById('addVacationModal');
    const closeModal = addVacationModal ? addVacationModal.querySelector('.close') : null;
    const addVacationForm = document.getElementById('addVacationForm');
    
    if (addVacationBtn && addVacationModal) {
        addVacationBtn.addEventListener('click', function() {
            addVacationModal.style.display = 'block';
        });
    }
    
    if (closeModal) {
        closeModal.addEventListener('click', function() {
            addVacationModal.style.display = 'none';
        });
    }
    
    if (addVacationForm) {
        addVacationForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const vacationData = {
                title: document.getElementById('vacationTitle').value,
                start_date: document.getElementById('vacationStart').value,
                end_date: document.getElementById('vacationEnd').value,
                description: document.getElementById('vacationDescription').value
            };
            
            fetch('/api/vacations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(vacationData)
            })
            .then(response => response.json())
            .then(data => {
                alert('Vacation added successfully!');
                addVacationModal.style.display = 'none';
                addVacationForm.reset();
                loadVacations();
            })
            .catch(error => {
                console.error('Error:', error);
                alert('Failed to add vacation');
            });
        });
    }
    
    loadVacations();
}

function loadVacations() {
    fetch('/api/vacations')
        .then(response => response.json())
        .then(vacations => {
            displayVacations(vacations);
        })
        .catch(error => console.error('Error loading vacations:', error));
}

function displayVacations(vacations) {
    const vacationsGrid = document.getElementById('vacations-grid');
    if (!vacationsGrid) return;
    
    if (vacations.length === 0) {
        vacationsGrid.innerHTML = '<p class="empty-state">No vacations planned. Click "Add Vacation" to create one.</p>';
        return;
    }
    
    vacationsGrid.innerHTML = vacations.map(vacation => `
        <div class="item-card">
            <div class="item-card-header">
                <h4>${vacation.title}</h4>
            </div>
            <div class="item-card-body">
                <p>${vacation.description || 'No description'}</p>
                <div class="item-meta">
                    <span><i class="bi bi-calendar-check"></i> ${formatDateNZ(vacation.start_date)}</span>
                    <span><i class="bi bi-calendar-x"></i> ${formatDateNZ(vacation.end_date)}</span>
                </div>
                <div class="item-actions">
                    <button class="btn-action btn-edit" onclick="editVacation('${vacation._id}')">
                        <i class="bi bi-pencil"></i> Edit
                    </button>
                    <button class="btn-action btn-delete" onclick="deleteVacation('${vacation._id}')">
                        <i class="bi bi-trash"></i> Delete
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
}

// Toggle task completion
async function toggleTaskComplete(taskId) {
    try {
        const response = await fetch(`/api/tasks/${taskId}/toggle`, {
            method: 'PUT'
        });
        
        const result = await response.json();
        if (result.success) {
            // Reload tasks to show updated status
            loadTasks();
        }
    } catch (error) {
        console.error('Error toggling task:', error);
    }
}
// Global variable to store delete callback
let deleteCallback = null;

function closeDeleteModal() {
    document.getElementById('deleteConfirmModal').classList.remove('active');
    deleteCallback = null;
}

function showDeleteModal(message, callback) {
    document.getElementById('deleteConfirmMessage').textContent = message;
    document.getElementById('deleteConfirmModal').classList.add('active');
    deleteCallback = callback;
}

// Setup delete confirm button (add this in DOMContentLoaded)
document.addEventListener('DOMContentLoaded', function() {
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    if (confirmBtn) {
        confirmBtn.onclick = function() {
            if (deleteCallback) {
                deleteCallback();
            }
            closeDeleteModal();
        };
    }
    
    // Close modal when clicking outside
    document.getElementById('deleteConfirmModal')?.addEventListener('click', function(e) {
        if (e.target === this) {
            closeDeleteModal();
        }
    });
});

// Updated delete functions
async function deleteTask(taskId) {
    showDeleteModal('Are you sure you want to delete this task? This action cannot be undone.', async function() {
        try {
            const response = await fetch(`/api/tasks/${taskId}`, { 
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });
            const result = await response.json();
            
            if (result.success) {
                showSuccessToast('Task deleted successfully!');
                loadTasks();
            } else {
                showErrorToast('Failed to delete task');
            }
        } catch (error) {
            console.error('Error:', error);
            showErrorToast('Failed to delete task');
        }
    });
}

async function deleteExam(examId) {
    showDeleteModal('Are you sure you want to delete this exam? This action cannot be undone.', async function() {
        try {
            const response = await fetch(`/api/exams/${examId}`, { 
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });
            const result = await response.json();
            
            if (result.success) {
                showSuccessToast('Exam deleted successfully!');
                loadExams();
            } else {
                showErrorToast('Failed to delete exam');
            }
        } catch (error) {
            console.error('Error:', error);
            showErrorToast('Failed to delete exam');
        }
    });
}

async function deleteClass(classId) {
    showDeleteModal('Are you sure you want to delete this class? This action cannot be undone.', async function() {
        try {
            const response = await fetch(`/api/classes/${classId}`, { 
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });
            const result = await response.json();
            
            if (result.success) {
                showSuccessToast('Class deleted successfully!');
                loadClasses();
            } else {
                showErrorToast('Failed to delete class');
            }
        } catch (error) {
            console.error('Error:', error);
            showErrorToast('Failed to delete class');
        }
    });
}

async function deleteSchedule(scheduleId) {
    showDeleteModal('Are you sure you want to delete this schedule? This action cannot be undone.', async function() {
        try {
            const response = await fetch(`/api/schedules/${scheduleId}`, { 
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });
            const result = await response.json();
            
            if (result.success) {
                showSuccessToast('Schedule deleted successfully!');
                loadSchedules();
            } else {
                showErrorToast('Failed to delete schedule');
            }
        } catch (error) {
            console.error('Error:', error);
            showErrorToast('Failed to delete schedule');
        }
    });
}

async function deleteVacation(vacationId) {
    showDeleteModal('Are you sure you want to delete this vacation? This action cannot be undone.', async function() {
        try {
            const response = await fetch(`/api/vacations/${vacationId}`, { 
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });
            const result = await response.json();
            
            if (result.success) {
                showSuccessToast('Vacation deleted successfully!');
                loadVacations();
            } else {
                showErrorToast('Failed to delete vacation');
            }
        } catch (error) {
            console.error('Error:', error);
            showErrorToast('Failed to delete vacation');
        }
    });
}

function showSuccessToast(message) {
    showToast(message, 'success');
}

function showErrorToast(message) {
    showToast(message, 'error');
}

function showToast(message, type) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="bi bi-${type === 'success' ? 'check-circle-fill' : 'exclamation-circle-fill'}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'toastSlideOut 0.3s ease-out';
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 3000);
}

function editTask(taskId) {
    fetch(`/api/tasks`)
        .then(response => response.json())
        .then(tasks => {
            const task = tasks.find(t => t._id === taskId);
            if (task) {
                document.getElementById('editTaskId').value = task._id;
                document.getElementById('editTaskName').value = task.name;
                document.getElementById('editTaskPriority').value = task.priority || 'medium';
                document.getElementById('editTaskDate').value = task.date || '';
                document.getElementById('editTaskDescription').value = task.description || '';
                document.getElementById('editTaskModal').style.display = 'block';
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showErrorToast('Failed to load task data');
        });
}

function editExam(examId) {
    fetch(`/api/exams`)
        .then(response => response.json())
        .then(exams => {
            const exam = exams.find(e => e._id === examId);
            if (exam) {
                document.getElementById('editExamId').value = exam._id;
                document.getElementById('editExamSubject').value = exam.subject;
                document.getElementById('editExamDate').value = exam.date || '';
                document.getElementById('editExamTime').value = exam.time || '';
                document.getElementById('editExamDuration').value = exam.duration || '';
                document.getElementById('editExamNotes').value = exam.notes || '';
                document.getElementById('editExamModal').style.display = 'block';
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showErrorToast('Failed to load exam data');
        });
}

function editClass(classId) {
    fetch(`/api/classes`)
        .then(response => response.json())
        .then(classes => {
            const classItem = classes.find(c => c._id === classId);
            if (classItem) {
                document.getElementById('editClassId').value = classItem._id;
                document.getElementById('editClassName').value = classItem.name;
                document.getElementById('editClassInstructor').value = classItem.instructor || '';
                document.getElementById('editClassDay').value = classItem.day || '';
                document.getElementById('editClassTime').value = classItem.time || '';
                document.getElementById('editClassRoom').value = classItem.room || '';
                document.getElementById('editClassModal').style.display = 'block';
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showErrorToast('Failed to load class data');
        });
}

function editSchedule(scheduleId) {
    fetch(`/api/schedules`)
        .then(response => response.json())
        .then(schedules => {
            const schedule = schedules.find(s => s._id === scheduleId);
            if (schedule) {
                document.getElementById('editScheduleId').value = schedule._id;
                document.getElementById('editScheduleTitle').value = schedule.title;
                document.getElementById('editScheduleDate').value = schedule.date || '';
                document.getElementById('editScheduleTime').value = schedule.time || '';
                document.getElementById('editScheduleDuration').value = schedule.duration || '';
                document.getElementById('editScheduleDescription').value = schedule.description || '';
                document.getElementById('editScheduleModal').style.display = 'block';
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showErrorToast('Failed to load schedule data');
        });
}

function editVacation(vacationId) {
    fetch(`/api/vacations`)
        .then(response => response.json())
        .then(vacations => {
            const vacation = vacations.find(v => v._id === vacationId);
            if (vacation) {
                document.getElementById('editVacationId').value = vacation._id;
                document.getElementById('editVacationTitle').value = vacation.title;
                document.getElementById('editVacationStart').value = vacation.start_date || '';
                document.getElementById('editVacationEnd').value = vacation.end_date || '';
                document.getElementById('editVacationDescription').value = vacation.description || '';
                document.getElementById('editVacationModal').style.display = 'block';
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showErrorToast('Failed to load vacation data');
        });
}

// Edit form submission handlers - ADD THIS TO THE END OF script.js

// Edit Task Form Handler
const editTaskForm = document.getElementById('editTaskForm');
if (editTaskForm) {
    editTaskForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const taskId = document.getElementById('editTaskId').value;
        const taskData = {
            name: document.getElementById('editTaskName').value,
            priority: document.getElementById('editTaskPriority').value,
            date: document.getElementById('editTaskDate').value,
            description: document.getElementById('editTaskDescription').value
        };
        
        try {
            const response = await fetch(`/api/tasks/${taskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskData)
            });
            
            const result = await response.json();
            if (result.success) {
                showSuccessToast('Task updated successfully!');
                document.getElementById('editTaskModal').style.display = 'none';
                loadTasks();
            } else {
                showErrorToast('Failed to update task');
            }
        } catch (error) {
            console.error('Error:', error);
            showErrorToast('Failed to update task');
        }
    });
}

// Edit Exam Form Handler
const editExamForm = document.getElementById('editExamForm');
if (editExamForm) {
    editExamForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const examId = document.getElementById('editExamId').value;
        const examData = {
            subject: document.getElementById('editExamSubject').value,
            date: document.getElementById('editExamDate').value,
            time: document.getElementById('editExamTime').value,
            duration: document.getElementById('editExamDuration').value,
            notes: document.getElementById('editExamNotes').value
        };
        
        try {
            const response = await fetch(`/api/exams/${examId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(examData)
            });
            
            const result = await response.json();
            if (result.success) {
                showSuccessToast('Exam updated successfully!');
                document.getElementById('editExamModal').style.display = 'none';
                loadExams();
            } else {
                showErrorToast('Failed to update exam');
            }
        } catch (error) {
            console.error('Error:', error);
            showErrorToast('Failed to update exam');
        }
    });
}

// Edit Class Form Handler
const editClassForm = document.getElementById('editClassForm');
if (editClassForm) {
    editClassForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const classId = document.getElementById('editClassId').value;
        const classData = {
            name: document.getElementById('editClassName').value,
            instructor: document.getElementById('editClassInstructor').value,
            day: document.getElementById('editClassDay').value,
            time: document.getElementById('editClassTime').value,
            room: document.getElementById('editClassRoom').value
        };
        
        try {
            const response = await fetch(`/api/classes/${classId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(classData)
            });
            
            const result = await response.json();
            if (result.success) {
                showSuccessToast('Class updated successfully!');
                document.getElementById('editClassModal').style.display = 'none';
                loadClasses();
            } else {
                showErrorToast('Failed to update class');
            }
        } catch (error) {
            console.error('Error:', error);
            showErrorToast('Failed to update class');
        }
    });
}

// Edit Schedule Form Handler
const editScheduleForm = document.getElementById('editScheduleForm');
if (editScheduleForm) {
    editScheduleForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const scheduleId = document.getElementById('editScheduleId').value;
        const scheduleData = {
            title: document.getElementById('editScheduleTitle').value,
            date: document.getElementById('editScheduleDate').value,
            time: document.getElementById('editScheduleTime').value,
            duration: document.getElementById('editScheduleDuration').value,
            description: document.getElementById('editScheduleDescription').value
        };
        
        try {
            const response = await fetch(`/api/schedules/${scheduleId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(scheduleData)
            });
            
            const result = await response.json();
            if (result.success) {
                showSuccessToast('Schedule updated successfully!');
                document.getElementById('editScheduleModal').style.display = 'none';
                loadSchedules();
            } else {
                showErrorToast('Failed to update schedule');
            }
        } catch (error) {
            console.error('Error:', error);
            showErrorToast('Failed to update schedule');
        }
    });
}

// Edit Vacation Form Handler
const editVacationForm = document.getElementById('editVacationForm');
if (editVacationForm) {
    editVacationForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const vacationId = document.getElementById('editVacationId').value;
        const vacationData = {
            title: document.getElementById('editVacationTitle').value,
            start_date: document.getElementById('editVacationStart').value,
            end_date: document.getElementById('editVacationEnd').value,
            description: document.getElementById('editVacationDescription').value
        };
        
        try {
            const response = await fetch(`/api/vacations/${vacationId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(vacationData)
            });
            
            const result = await response.json();
            if (result.success) {
                showSuccessToast('Vacation updated successfully!');
                document.getElementById('editVacationModal').style.display = 'none';
                loadVacations();
            } else {
                showErrorToast('Failed to update vacation');
            }
        } catch (error) {
            console.error('Error:', error);
            showErrorToast('Failed to update vacation');
        }
    });
}
