// Tasks page JavaScript
// This file contains only task-page logic moved out of script.js.
// Shared helpers such as showToast(), showSuccessToast(), showErrorToast(),
// formatDateNZ(), getTodayKeyNZ(), escapeHtml(), and the shared delete modal
// still come from script.js.

function initTasks() {
    const addTaskBtn   = document.getElementById('add-task-page-btn');
    const addTaskModal = document.getElementById('addTaskModal');
    const closeModal   = addTaskModal ? addTaskModal.querySelector('.close') : null;
    const addTaskForm  = document.getElementById('addTaskForm');

    if (addTaskBtn && addTaskModal) {
        addTaskBtn.addEventListener('click', () => { addTaskModal.style.display = 'flex'; });
    }
    if (closeModal) {
        closeModal.addEventListener('click', () => { addTaskModal.style.display = ''; });
    }
    if (addTaskForm) {
        addTaskForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const taskData = {
                name:        document.getElementById('taskName').value,
                priority:    document.getElementById('taskPriority').value,
                date:        document.getElementById('taskDate').value,
                time:        document.getElementById('taskTime').value,
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
                addTaskModal.style.display = '';
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
    document.getElementById('editTaskModal').style.display = 'flex';
}

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
                document.getElementById('editTaskModal').style.display = '';
                loadTasks();
            } else showErrorToast('Failed to update task');
        } catch { showErrorToast('Failed to update task'); }
    });
}