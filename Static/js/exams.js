// Exams page JavaScript
// This file contains only exam-page logic moved out of script.js.
// Shared helpers such as showSuccessToast(), showErrorToast(), formatDateNZ(),
// formatTimeNZ(), escapeHtml(), and the shared delete modal still come from script.js.

// EXAMS
function initExams() {
    const addExamBtn   = document.getElementById('add-exam-page-btn');
    const addExamModal = document.getElementById('addExamModal');
    const closeModal   = addExamModal ? addExamModal.querySelector('.close') : null;
    const addExamForm  = document.getElementById('addExamForm');

    if (addExamBtn && addExamModal) {
        addExamBtn.addEventListener('click', () => { addExamModal.style.display = 'flex'; });
    }
    if (closeModal) {
        closeModal.addEventListener('click', () => { addExamModal.style.display = ''; });
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
                addExamModal.style.display = '';
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
        reflectionClose.addEventListener('click', () => { reflectionModal.style.display = ''; });
    }
    if (skipReflectionBtn && reflectionModal) {
        skipReflectionBtn.addEventListener('click', () => {
            reflectionModal.style.display = '';
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
    modal.style.display = 'flex';
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
            document.getElementById('examReflectionModal').style.display = '';
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
            document.getElementById('editExamModal').style.display = 'flex';
        })
        .catch(() => showErrorToast('Failed to load exam data'));
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
                document.getElementById('editExamModal').style.display = '';
                loadExams();
            } else showErrorToast('Failed to update exam');
        } catch { showErrorToast('Failed to update exam'); }
    });
}