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

window.dashboardUtils = {
    refreshDashboard,
    toggleTaskCompletion,
    clearOutdatedItems,
    fetchDashboardSuggestions,
    loadDashboardStats,
    formatDateNZDashboard,
    showNotification
};

/* ──────────────────────────────────────────────
   Moved from inline <script> in dashboard.html
────────────────────────────────────────────── */
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

        // Progress circle is styled through the --progress CSS variable in the hero card.
