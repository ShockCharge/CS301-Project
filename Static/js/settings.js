// Settings page JavaScript
// This file contains only the settings-page logic moved out of script.js.
// Shared helpers such as showToast() still come from script.js.

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
    }

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
    }
}
