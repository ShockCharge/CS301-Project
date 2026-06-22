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

    // Change password modal
    document.getElementById('changePasswordBtn').addEventListener('click', () => {
        document.getElementById('changePasswordModal').classList.add('active');
    });
    document.getElementById('closePwModal').addEventListener('click', () => {
        document.getElementById('changePasswordModal').classList.remove('active');
    });
    document.getElementById('changePasswordModal').addEventListener('click', function(e) {
        if (e.target === this) this.classList.remove('active');
    });

    document.getElementById('submitPasswordChange').addEventListener('click', async function() {
        const current = document.getElementById('currentPassword').value;
        const newPw   = document.getElementById('newPassword').value;
        const confirm = document.getElementById('confirmPassword').value;
        const errEl   = document.getElementById('pwError');

        if (!current || !newPw || !confirm) { errEl.textContent = 'All fields are required.'; errEl.style.display = 'block'; return; }
        if (newPw !== confirm)               { errEl.textContent = 'New passwords do not match.'; errEl.style.display = 'block'; return; }
        if (newPw.length < 8)                { errEl.textContent = 'Password must be at least 8 characters.'; errEl.style.display = 'block'; return; }
        if (!/[A-Z]/.test(newPw))            { errEl.textContent = 'Password needs at least one uppercase letter.'; errEl.style.display = 'block'; return; }
        if (!/[0-9]/.test(newPw))            { errEl.textContent = 'Password needs at least one number.'; errEl.style.display = 'block'; return; }

        errEl.style.display = 'none';
        try {
            const res    = await fetch('/api/change_password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ current_password: current, new_password: newPw })
            });
            const result = await res.json();
            if (result.success) {
                showToast('Password updated successfully!', 'success');
                document.getElementById('changePasswordModal').classList.remove('active');
                document.getElementById('currentPassword').value = '';
                document.getElementById('newPassword').value     = '';
                document.getElementById('confirmPassword').value = '';
            } else {
                errEl.textContent  = result.error || 'Failed to update password.';
                errEl.style.display = 'block';
            }
        } catch { errEl.textContent = 'Network error.'; errEl.style.display = 'block'; }
    });

    function showToast(message, type) {
        const c     = document.getElementById('toastContainer') || document.body;
        const toast = document.createElement('div');
        toast.className   = `toast-msg toast-${type}`;
        toast.textContent = message;
        c.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity    = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
        }, 3000);
    }
