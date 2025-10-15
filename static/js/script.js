// Global variables
let currentDate = new Date();
let currentView = 'week';
let schedules = [];

// DOM Content Loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

// Initialize Application
function initializeApp() {
    // Connect Calendar button (signup page)
    const connectCalendarBtn = document.getElementById('connect-calendar');
    if (connectCalendarBtn) {
        connectCalendarBtn.addEventListener('click', (e) => {
            e.preventDefault();
            alert('Calendar connection coming soon!');
        });
    }

    // Dashboard functionality
    initializeDashboard();

    // Schedule functionality
    initializeSchedule();
}

// Dashboard Initialization
function initializeDashboard() {
    const addTaskBtn = document.getElementById('add-task-btn');
    const quickAddTaskBtn = document.getElementById('quick-add-task');
    const addTaskModal = document.getElementById('addTaskModal');
    const addTaskForm = document.getElementById('addTaskForm');

    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', () => {
            openModal(addTaskModal);
        });
    }

    if (quickAddTaskBtn) {
        quickAddTaskBtn.addEventListener('click', () => {
            openModal(addTaskModal);
        });
    }

    if (addTaskForm) {
        addTaskForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await addTask();
        });
    }

    // Close modal when clicking outside
    if (addTaskModal) {
        const closeBtn = addTaskModal.querySelector('.close');
        closeBtn.addEventListener('click', () => {
            closeModal(addTaskModal);
        });

        window.addEventListener('click', (e) => {
            if (e.target === addTaskModal) {
                closeModal(addTaskModal);
            }
        });
    }
}

// Schedule Initialization
function initializeSchedule() {
    const addScheduleBtn = document.getElementById('add-schedule-btn');
    const addScheduleModal = document.getElementById('addScheduleModal');
    const addScheduleForm = document.getElementById('addScheduleForm');
    const prevMonthBtn = document.getElementById('prev-month');
    const nextMonthBtn = document.getElementById('next-month');
    const tabBtns = document.querySelectorAll('.tab-btn');

    if (addScheduleBtn) {
        addScheduleBtn.addEventListener('click', () => {
            openModal(addScheduleModal);
        });
    }

    if (addScheduleForm) {
        addScheduleForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await addSchedule();
        });
    }

    if (addScheduleModal) {
        const closeBtn = addScheduleModal.querySelector('.close');
        closeBtn.addEventListener('click', () => {
            closeModal(addScheduleModal);
        });

        window.addEventListener('click', (e) => {
            if (e.target === addScheduleModal) {
                closeModal(addScheduleModal);
            }
        });
    }

    if (prevMonthBtn) {
        prevMonthBtn.addEventListener('click', () => {
            changeMonth(-1);
        });
    }

    if (nextMonthBtn) {
        nextMonthBtn.addEventListener('click', () => {
            changeMonth(1);
        });
    }

    if (tabBtns.length > 0) {
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                switchView(btn.dataset.view);
            });
        });
    }

    // Load schedules and render calendar
    loadSchedules();
    renderCalendar();
}

// Modal Functions
function openModal(modal) {
    if (modal) {
        modal.style.display = 'block';
    }
}

function closeModal(modal) {
    if (modal) {
        modal.style.display = 'none';
    }
}

// Add Task
async function addTask() {
    const taskName = document.getElementById('taskName').value;
    const taskPriority = document.getElementById('taskPriority').value;

    try {
        const response = await fetch('/api/tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: taskName,
                priority: taskPriority
            })
        });

        if (response.ok) {
            alert('Task added successfully!');
            closeModal(document.getElementById('addTaskModal'));
            document.getElementById('addTaskForm').reset();
            location.reload();
        } else {
            alert('Failed to add task');
        }
    } catch (error) {
        console.error('Error adding task:', error);
        alert('Error adding task');
    }
}

// Add Schedule
async function addSchedule() {
    const title = document.getElementById('scheduleTitle').value;
    const date = document.getElementById('scheduleDate').value;
    const time = document.getElementById('scheduleTime').value;
    const duration = document.getElementById('scheduleDuration').value;
    const description = document.getElementById('scheduleDescription').value;

    try {
        const response = await fetch('/api/schedules', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title,
                date,
                time,
                duration,
                description
            })
        });

        if (response.ok) {
            alert('Schedule added successfully!');
            closeModal(document.getElementById('addScheduleModal'));
            document.getElementById('addScheduleForm').reset();
            loadSchedules();
            renderCalendar();
        } else {
            alert('Failed to add schedule');
        }
    } catch (error) {
        console.error('Error adding schedule:', error);
        alert('Error adding schedule');
    }
}

// Load Schedules
async function loadSchedules() {
    try {
        const response = await fetch('/api/schedules');
        if (response.ok) {
            schedules = await response.json();
            renderScheduleList();
        }
    } catch (error) {
        console.error('Error loading schedules:', error);
    }
}

// Render Schedule List
function renderScheduleList() {
    const scheduleItems = document.getElementById('schedule-items');
    if (!scheduleItems) return;

    if (schedules.length === 0) {
        scheduleItems.innerHTML = '<p class="empty-state">No schedules yet. Click "Add Schedule" to create one.</p>';
        return;
    }

    scheduleItems.innerHTML = schedules.map(schedule => `
        <div class="schedule-item">
            <div class="schedule-item-header">
                <h4>${schedule.title}</h4>
                <span class="schedule-time">${schedule.date} at ${schedule.time}</span>
            </div>
            <p class="schedule-description">${schedule.description || ''}</p>
        </div>
    `).join('');
}

// Change Month
function changeMonth(delta) {
    currentDate.setMonth(currentDate.getMonth() + delta);
    renderCalendar();
}

// Switch View
function switchView(view) {
    currentView = view;
    
    // Update active tab
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.view === view) {
            btn.classList.add('active');
        }
    });

    // Hide all views first
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

    // Render calendar for the selected view
    renderCalendar();
}

// Render Calendar
function renderCalendar() {
    updateMonthDisplay();

    if (currentView === 'week') {
        renderWeekView();
    } else if (currentView === 'month') {
        renderMonthView();
    } else if (currentView === 'day') {
        renderDayView();
    }
}

// Update Month Display
function updateMonthDisplay() {
    const monthYearElement = document.getElementById('current-month');
    if (monthYearElement) {
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];
        monthYearElement.textContent = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
}

// Render Week View
function renderWeekView() {
    const calendarGrid = document.getElementById('calendar-grid');
    if (!calendarGrid) return;

    calendarGrid.innerHTML = '';

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const today = new Date();

    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
        const dayDiv = createDayElement(daysInPrevMonth - i, true, false);
        calendarGrid.appendChild(dayDiv);
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
        const isToday = day === today.getDate() && 
                       month === today.getMonth() && 
                       year === today.getFullYear();
        const dayDiv = createDayElement(day, false, isToday);
        calendarGrid.appendChild(dayDiv);
    }

    // Next month days
    const totalCells = calendarGrid.children.length;
    const remainingCells = 42 - totalCells;
    for (let day = 1; day <= remainingCells; day++) {
        const dayDiv = createDayElement(day, true, false);
        calendarGrid.appendChild(dayDiv);
    }
}

// Render Month View
function renderMonthView() {
    const monthGrid = document.getElementById('month-grid');
    if (!monthGrid) return;

    monthGrid.innerHTML = '';

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const today = new Date();

    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
        const dayDiv = createDayElement(daysInPrevMonth - i, true, false);
        monthGrid.appendChild(dayDiv);
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
        const isToday = day === today.getDate() && 
                       month === today.getMonth() && 
                       year === today.getFullYear();
        const dayDiv = createDayElement(day, false, isToday);
        monthGrid.appendChild(dayDiv);
    }

    // Next month days
    const totalCells = monthGrid.children.length;
    const remainingCells = 42 - totalCells;
    for (let day = 1; day <= remainingCells; day++) {
        const dayDiv = createDayElement(day, true, false);
        monthGrid.appendChild(dayDiv);
    }
}

// Render Day View
function renderDayView() {
    const timeSlots = document.getElementById('time-slots');
    if (!timeSlots) return;

    timeSlots.innerHTML = '';

    for (let hour = 0; hour < 24; hour++) {
        const timeSlot = document.createElement('div');
        timeSlot.className = 'time-slot';
        
        const timeLabel = document.createElement('div');
        timeLabel.className = 'time-label';
        timeLabel.textContent = `${hour.toString().padStart(2, '0')}:00`;
        
        const timeContent = document.createElement('div');
        timeContent.className = 'time-content';
        
        // Check if there are any schedules for this hour
        const dateStr = currentDate.toISOString().split('T')[0];
        const hourSchedules = schedules.filter(s => {
            if (s.date === dateStr && s.time) {
                const scheduleHour = parseInt(s.time.split(':')[0]);
                return scheduleHour === hour;
            }
            return false;
        });

        if (hourSchedules.length > 0) {
            hourSchedules.forEach(schedule => {
                const scheduleDiv = document.createElement('div');
                scheduleDiv.className = 'schedule-item';
                scheduleDiv.innerHTML = `
                    <div class="schedule-item-header">
                        <h4>${schedule.title}</h4>
                        <span class="schedule-time">${schedule.time}</span>
                    </div>
                `;
                timeContent.appendChild(scheduleDiv);
            });
        }
        
        timeSlot.appendChild(timeLabel);
        timeSlot.appendChild(timeContent);
        timeSlots.appendChild(timeSlot);
    }
}

// Create Day Element
function createDayElement(day, isOtherMonth, isToday) {
    const dayDiv = document.createElement('div');
    dayDiv.className = 'calendar-day';
    
    if (isOtherMonth) {
        dayDiv.classList.add('other-month');
    }
    if (isToday) {
        dayDiv.classList.add('today');
    }

    const dayNumber = document.createElement('div');
    dayNumber.className = 'day-number';
    dayNumber.textContent = day;
    dayDiv.appendChild(dayNumber);

    // Check for events on this day
    if (!isOtherMonth) {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        
        const daySchedules = schedules.filter(s => s.date === dateStr);
        if (daySchedules.length > 0) {
            const dayEvents = document.createElement('div');
            dayEvents.className = 'day-events';
            daySchedules.forEach(() => {
                const dot = document.createElement('span');
                dot.className = 'event-dot';
                dayEvents.appendChild(dot);
            });
            dayDiv.appendChild(dayEvents);
        }
    }

    return dayDiv;
}

// Utility Functions
function formatDate(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatTime(date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

