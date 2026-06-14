/* ──────────────────────────────────────────────
   Chatbot page logic — moved from inline <script> in chatbot.html
────────────────────────────────────────────── */
    /* ── Clock ── */
    function updateTime() {
        const now = new Date();
        document.getElementById('header-time').textContent = now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
        document.getElementById('header-date').textContent = now.toLocaleDateString('en-US',{weekday:'long',day:'numeric',month:'long'});
    }
    updateTime(); setInterval(updateTime, 1000);

    // Sidebar toggle

    /* ── Sidebar (darkmode.js handles toggle + persistence) ── */

    /* ── Chat helpers ── */
    function getTime() {
        return new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
    }

    function addMessage(text, type) {
        const box  = document.getElementById('chatMessages');
        const div  = document.createElement('div');
        div.className = `chat-msg ${type}-msg`;

        const icon = type === 'bot'
            ? '<div class="chat-msg-avatar"><i class="bi bi-robot"></i></div>'
            : '';

        div.innerHTML = `
            ${icon}
            <div class="chat-msg-bubble">
                <p>${escapeHtml(text)}</p>
                <span class="chat-msg-time">${getTime()}</span>
            </div>
        `;
        box.appendChild(div);
        box.scrollTop = box.scrollHeight;

        /* hide chips once user has sent a message */
        if (type === 'user') {
            document.getElementById('chatbot-chips').style.display = 'none';
        }
        return div;
    }

    function escapeHtml(s) {
        return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function setTyping(show) {
        let el = document.getElementById('typing-indicator');
        if (show && !el) {
            const box = document.getElementById('chatMessages');
            el = document.createElement('div');
            el.id = 'typing-indicator';
            el.className = 'chat-msg bot-msg typing-msg';
            el.innerHTML = `
                <div class="chat-msg-avatar"><i class="bi bi-robot"></i></div>
                <div class="chat-msg-bubble typing-bubble">
                    <span></span><span></span><span></span>
                </div>`;
            box.appendChild(el);
            box.scrollTop = box.scrollHeight;
        } else if (!show && el) {
            el.remove();
        }
    }

    function streamText(element, text) {
        const p = element.querySelector('p');
        p.textContent = '';
        let i = 0;
        const box = document.getElementById('chatMessages');
        function type() {
            if (i < text.length) {
                p.textContent += text.charAt(i++);
                box.scrollTop = box.scrollHeight;
                setTimeout(type, 12);
            }
        }
        type();
    }

    async function sendMessage() {
        const input = document.getElementById('chatInput');
        const text  = input.value.trim();
        if (!text) return;

        input.value = '';
        input.style.height = 'auto';
        input.disabled = true;
        document.getElementById('sendBtn').disabled = true;

        addMessage(text, 'user');
        setTyping(true);

        try {
            const res  = await fetch('/api/chat', {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({message: text})
            });
            const data = await res.json();
            setTyping(false);

            if (data.error) {
                addMessage(data.error, 'bot');
            } else {
                const msgEl = addMessage('', 'bot');
                streamText(msgEl, data.response);

                /* show source links if web was used */
                if (data.web_used && data.sources && data.sources.length) {
                    const srcDiv = document.createElement('div');
                    srcDiv.className = 'chat-sources';
                    srcDiv.innerHTML = '<strong>Sources:</strong><br>' +
                        data.sources.map(s =>
                            `<a href="${s.url}" target="_blank" rel="noopener">[${s.index}] ${escapeHtml(s.title)}</a>`
                        ).join('<br>');
                    msgEl.querySelector('.chat-msg-bubble').appendChild(srcDiv);
                }
            }
        } catch {
            setTyping(false);
            addMessage("Sorry, I couldn't reach the AI assistant. Please try again.", 'bot');
        }

        input.disabled = false;
        document.getElementById('sendBtn').disabled = false;
        input.focus();
    }

    /* ── Enter key ── */
    document.getElementById('chatInput').addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    /* ── Auto-grow textarea ── */
    document.getElementById('chatInput').addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 140) + 'px';
    });

    /* ── Suggestion chips ── */
    document.querySelectorAll('.chip').forEach(btn => {
        btn.addEventListener('click', function() {
            document.getElementById('chatInput').value = this.dataset.msg;
            sendMessage();
        });
    });

    /* ── Clear chat ── */
    document.getElementById('clearChatBtn').addEventListener('click', function() {
        const box = document.getElementById('chatMessages');
        box.innerHTML = `
            <div class="chat-msg bot-msg">
                <div class="chat-msg-avatar"><i class="bi bi-robot"></i></div>
                <div class="chat-msg-bubble">
                    <p>Chat cleared! How can I help you study today?</p>
                    <span class="chat-msg-time">${getTime()}</span>
                </div>
            </div>`;
        document.getElementById('chatbot-chips').style.display = 'flex';
    });
