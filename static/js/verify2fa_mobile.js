/* ──────────────────────────────────────────────
   Verify 2FA page logic — moved from inline <script> in verify2fa_mobile.html
────────────────────────────────────────────── */
        const boxes     = document.querySelectorAll('.otp-box');
        const hidden    = document.getElementById('otp-hidden');
        const verifyBtn = document.getElementById('verify-btn');
        const form      = document.getElementById('otp-form');
        const timerBar  = document.getElementById('timer-bar');
        const countdown = document.getElementById('countdown');

        const TOTAL = 600; // 10 minutes
        let seconds = TOTAL;

        /* ── Sync hidden input & enable button ── */
        function syncHidden() {
            const val = [...boxes].map(b => b.value).join('');
            hidden.value = val;
            verifyBtn.disabled = val.length < 6;
            boxes.forEach(b => {
                b.classList.toggle('filled', b.value.length === 1);
            });
        }

        /* ── OTP box behaviour ── */
        boxes.forEach((box, i) => {
            box.addEventListener('input', () => {
                box.value = box.value.replace(/\D/g, '');
                if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
                syncHidden();
                if (i === boxes.length - 1 && hidden.value.length === 6) {
                    setTimeout(() => form.submit(), 150);
                }
            });

            box.addEventListener('keydown', e => {
                if (e.key === 'Backspace' && !box.value && i > 0) {
                    boxes[i - 1].focus();
                    boxes[i - 1].value = '';
                    syncHidden();
                }
            });

            box.addEventListener('paste', e => {
                e.preventDefault();
                const pasted = (e.clipboardData || window.clipboardData)
                    .getData('text').replace(/\D/g, '').slice(0, 6);
                [...pasted].forEach((ch, idx) => {
                    if (boxes[idx]) boxes[idx].value = ch;
                });
                if (pasted.length > 0) boxes[Math.min(pasted.length, 5)].focus();
                syncHidden();
                if (pasted.length === 6) setTimeout(() => form.submit(), 150);
            });
        });

        boxes[0].focus();

        /* ── Countdown timer ── */
        const tick = setInterval(() => {
            seconds--;
            if (seconds <= 0) {
                clearInterval(tick);
                countdown.textContent = '0:00';
                timerBar.style.width = '0%';
                verifyBtn.disabled = true;
                verifyBtn.textContent = 'Code expired — resend to continue';
                return;
            }
            const m = Math.floor(seconds / 60);
            const s = (seconds % 60).toString().padStart(2, '0');
            countdown.textContent = `${m}:${s}`;
            timerBar.style.width = `${(seconds / TOTAL) * 100}%`;

            /* Change bar colour in last 2 minutes */
            if (seconds <= 120) {
                timerBar.style.background = '#dc2626';
            }
        }, 1000);
