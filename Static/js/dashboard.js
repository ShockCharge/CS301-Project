const DASHBOARD_CONFIG = {
    suggestionRefreshInterval: 5 * 60 * 1000, // 5 minutes
    apiEndpoints: {
        suggestions: '/get_ai_suggestions',
        tasks: '/api/tasks',
        exams: '/api/exams'
    }
};


document.addEventListener('DOMContentLoaded', function() {
    const currentPage = window.location.pathname;
    
    if (currentPage.includes('/V2dashboard')) {
        initDashboardEnhanced();
        setupEventListeners();
        setupAutoRefresh();
    }
});


function initDashboardEnhanced() {
    fetchAISuggestions();
    loadDashboardStats();
    setupSidebarToggle();
}


function setupAutoRefresh() {
    setInterval(() => {
        fetchAISuggestions();
    }, DASHBOARD_CONFIG.suggestionRefreshInterval);
}


function setupSidebarToggle() {
    const hamburgerBtn = document.querySelector('.hamburger-btn');
    const sidebar = document.querySelector('.sidebar');
    const activitiesToggle = document.getElementById('activities-toggle');
    const activitiesSubmenu = document.getElementById('activities-submenu');

    // Hamburger menu toggle
    if (hamburgerBtn && sidebar) {
        hamburgerBtn.addEventListener('click', function() {
            sidebar.classList.toggle('show');
        });
    }

    // Activities submenu toggle
    if (activitiesToggle && activitiesSubmenu) {
        activitiesToggle.addEventListener('click', function(e) {
            e.preventDefault();
            activitiesSubmenu.classList.toggle('show');
            const arrow = activitiesToggle.querySelector('.submenu-arrow');
            if (arrow) {
                arrow.classList.toggle('rotated');
            }
        });
    }

    // Close sidebar when clicking outside
    document.addEventListener('click', function(event) {
        if (sidebar && !sidebar.contains(event.target) && 
            hamburgerBtn && !hamburgerBtn.contains(event.target)) {
            sidebar.classList.remove('show');
        }
    });
}


function fetchAISuggestions() {
    const suggestionBox = document.getElementById('suggestionBox');
    const suggestionContent = document.getElementById('suggestionContent');
    
    if (!suggestionBox || !suggestionContent) return;

    // Show loading state
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
            console.error("AI Fetch Error:", err);
            suggestionBox.classList.remove('loading');
            setFallbackSuggestion(suggestionContent);
            suggestionBox.style.display = 'block';
        });
}


function setFallbackSuggestion(element) {
    const fallbackMessages = [
        "You've got this! Focus on one task at a time and celebrate small wins. 💪",
        "Keep pushing forward! Every task completed brings you closer to your goals. 🚀",
        "Remember: Progress over perfection. You're doing great! 🌟",
        "Break down your goals into smaller tasks. You can do it! 📚"
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
            const totalTasks = tasks.length;
            const completedTasks = tasks.filter(t => t.completed).length;
            const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

            updateStatElement('totalTasks', totalTasks);
            updateStatElement('completedTasks', completedTasks);
            updateStatElement('completionRate', completionRate + '%');

            updateProgressCircle(completionRate);
            updateProgressBar(completionRate);
        })
        .catch(error => console.error('Error loading tasks:', error));
}


function loadExamStats() {
    fetch(DASHBOARD_CONFIG.apiEndpoints.exams)
        .then(response => response.json())
        .then(exams => {
            const upcomingExams = exams.filter(e => {
                const examDate = new Date(e.date);
                return examDate >= new Date();
            }).length;

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

function updateProgressCircle(percentage) {
    const progressCircle = document.getElementById('progress-circle');
    const progressValue = document.getElementById('progress-value');
    
    if (progressCircle) {
        progressCircle.style.background = `conic-gradient(#007bff 0%, #007bff ${percentage}%, #e9ecef ${percentage}%, #e9ecef 100%)`;
    }
    
    if (progressValue) {
        progressValue.innerText = percentage + '%';
    }
}

function updateProgressBar(percentage) {
    const weekProgress = document.getElementById('weekProgress');
    if (weekProgress) {
        weekProgress.style.width = percentage + '%';
    }
}

function toggleTaskCompletion(taskElement, taskId) {
    taskElement.style.opacity = '0.5';
    taskElement.style.textDecoration = 'line-through';
    
    fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ completed: true })
    })
    .then(response => response.json())
    .then(data => {
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

function setupEventListeners() {
    setupTaskEventListeners();
    setupButtonEventListeners();
    setupOutdatedItemsEventListeners();
}   

function setupTaskEventListeners() {
    const taskItems = document.querySelectorAll('.task-item');
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

function clearOutdatedItems() {
    if (confirm('Are you sure you want to clear all outdated items?')) {
        fetch('/api/clear-outdated', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
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
    fetchAISuggestions();
    loadDashboardStats();
}

function formatDateNZ(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function showNotification(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
}

window.dashboardUtils = {
    refreshDashboard,
    toggleTaskCompletion,
    clearOutdatedItems,
    fetchAISuggestions,
    loadDashboardStats,
    formatDateNZ,
    showNotification
};

function generateStudyPlan() {
    const btn      = document.getElementById('generatePlanBtn');
    const loading  = document.getElementById('studyPlanLoading');
    const content  = document.getElementById('studyPlanContent');
    const planText = document.getElementById('studyPlanText');
    const empty    = document.getElementById('studyPlanEmpty');

    if (!btn) return;

    // Show loading state
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Generating...';
    if (loading) loading.style.display = 'flex';
    if (content) content.style.display = 'none';
    if (empty)   empty.style.display   = 'none';

    fetch('/api/study_plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requested_at: new Date().toISOString() })

    })
    .then(r => {
        if (!r.ok) throw new Error('Server error');
        return r.json();
    })
    .then(data => {
        if (loading) loading.style.display = 'none';

        if (data.plan) {
            if (planText) planText.textContent = data.plan;
            if (content)  content.style.display = 'block';
        } else {
            if (empty) {
                empty.innerHTML = '<p style="color:#e74c3c;">Could not generate a plan. Please try again.</p>';
                empty.style.display = 'block';
            }
        }
    })
    .catch(() => {
        if (loading) loading.style.display = 'none';
        if (empty) {
            empty.innerHTML = '<p style="color:#e74c3c;">Network error. Please check your connection and try again.</p>';
            empty.style.display = 'block';
        }
    })
    .finally(() => {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-magic"></i> Generate Plan';
    });
}
