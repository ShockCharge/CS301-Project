// CLASSES PAGE JAVASCRIPT
// This file contains only the Classes page logic.
// Shared helpers such as escapeHtml, formatDateNZ, formatTimeNZ, showSuccessToast,
// showErrorToast, and showDeleteModal remain in static/js/script.js.

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

// DELETE FUNCTION
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

// EDIT FUNCTION
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

// EDIT FORM SUBMIT HANDLER
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
