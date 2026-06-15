/* ──────────────────────────────────────────────
   Profile page logic — moved from inline <script> in profile.html
────────────────────────────────────────────── */
    /* ── Clock ── */
    function updateTime() {
        const now = new Date();
        document.getElementById('header-time').textContent = now.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
        document.getElementById('header-date').textContent = now.toLocaleDateString('en-US', { weekday:'long', day:'numeric', month:'long' });
    }
    updateTime(); setInterval(updateTime, 1000);

    // Sidebar toggle

    /* ── Toast ── */
    function showToast(msg, type) {
        const c = document.getElementById('toastContainer') || document.body;
        const t = document.createElement('div');
        t.className   = `toast-msg toast-${type}`;
        t.textContent = msg;
        c.appendChild(t);
        setTimeout(() => { t.style.opacity='0'; t.style.transition='opacity 0.3s'; setTimeout(()=>{ if(t.parentNode) t.parentNode.removeChild(t); },300); }, 3000);
    }

    /* ── Profile picture ── */
    const serverProfilePictureData = document.getElementById('serverProfilePictureData');
    const serverProfilePicture = serverProfilePictureData
        ? JSON.parse(serverProfilePictureData.textContent || '""')
        : '';

    window.addEventListener('DOMContentLoaded', function() {
        const saved = serverProfilePicture || localStorage.getItem('profilePicture');
        if (saved) document.getElementById('profile-pic').src = saved;
    });

    document.getElementById('profile-upload').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            showToast('Please choose an image file.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = async function(e) {
            const data = e.target.result;
            document.getElementById('profile-pic').src = data;
            localStorage.setItem('profilePicture', data);

            try {
                const res = await fetch('/api/profile', {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ profile_picture: data })
                });
                const r = await res.json();
                if (r.success) showToast('Profile photo updated!', 'success');
                else showToast(r.error || 'Photo changed locally, but was not saved online.', 'error');
            } catch {
                showToast('Photo changed locally, but network save failed.', 'error');
            }
        };
        reader.readAsDataURL(file);
    });

    /* ── Personal info ── */
    document.getElementById('personal-info-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target));
        try {
            const res = await fetch('/api/profile', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
            const r   = await res.json();
            if (r.success) showToast('Personal information saved!', 'success');
            else           showToast('Failed to save changes.', 'error');
        } catch { showToast('Network error.', 'error'); }
    });

    /* ── Study info ── */
    document.getElementById('study-info-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target));
        try {
            const res = await fetch('/api/profile', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
            const r   = await res.json();
            if (r.success) showToast('Study information saved!', 'success');
            else           showToast('Failed to save changes.', 'error');
        } catch { showToast('Network error.', 'error'); }
    });

    /* ── Change password ── */
    document.getElementById('change-password-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        const cur     = document.getElementById('current-password').value;
        const newPw   = document.getElementById('new-password').value;
        const confirm = document.getElementById('confirm-new-password').value;
        const errEl   = document.getElementById('pw-error');

        if (newPw !== confirm) { errEl.textContent='Passwords do not match.'; errEl.style.display='block'; return; }
        if (newPw.length < 8)  { errEl.textContent='Password must be at least 8 characters.'; errEl.style.display='block'; return; }
        if (!/[A-Z]/.test(newPw)) { errEl.textContent='Needs at least one uppercase letter.'; errEl.style.display='block'; return; }
        if (!/[0-9]/.test(newPw)) { errEl.textContent='Needs at least one number.'; errEl.style.display='block'; return; }
        errEl.style.display = 'none';

        try {
            const res = await fetch('/api/change_password', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ current_password:cur, new_password:newPw }) });
            const r   = await res.json();
            if (r.success) { showToast('Password updated!', 'success'); e.target.reset(); }
            else { errEl.textContent = r.error || 'Failed to update password.'; errEl.style.display='block'; }
        } catch { errEl.textContent='Network error.'; errEl.style.display='block'; }
    });

    /* ── Delete account ── */
    function confirmDeleteAccount() {
        if (!confirm('Are you absolutely sure? This will permanently delete your account and all data.')) return;
        if (!confirm('Last warning — this cannot be undone. Continue?')) return;
        fetch('/api/account', { method:'DELETE' })
            .then(r => r.json())
            .then(d => {
                if (d.success) { showToast('Account deleted.', 'success'); setTimeout(()=>{ window.location.href=document.body.dataset.logoutUrl; }, 1500); }
                else showToast('Failed to delete account.', 'error');
            }).catch(() => showToast('Network error.', 'error'));
    }
