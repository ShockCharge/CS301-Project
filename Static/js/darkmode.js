(function () {
    'use strict';

    // ── 1. Apply dark mode BEFORE DOM loads (no flash) ──────────────────────
    if (localStorage.getItem('darkMode') === 'true') {
        document.documentElement.classList.add('dark-mode-pre');
        document.addEventListener('DOMContentLoaded', function () {
            document.body.classList.add('dark-mode');
            document.documentElement.classList.remove('dark-mode-pre');
        });
    }

    // ── 2. Persist sidebar state across pages ────────────────────────────────
    // Sidebar is "open" (not collapsed) when localStorage sidebarOpen === 'true'
    document.addEventListener('DOMContentLoaded', function () {
        var sidebar = document.getElementById('sidebar');
        var overlay = document.getElementById('sidebar-overlay');
        var toggleBtn = document.getElementById('sidebar-toggle');

        if (!sidebar) return;

        // Restore state: default = collapsed on mobile, open on desktop (optional)
        var isOpen = localStorage.getItem('sidebarOpen') === 'true';
        if (isOpen) {
            sidebar.classList.remove('collapsed');
            if (overlay) overlay.classList.add('active');
        } else {
            sidebar.classList.add('collapsed');
            if (overlay) overlay.classList.remove('active');
        }

        // Toggle on button click
        if (toggleBtn) {
            toggleBtn.addEventListener('click', function () {
                var nowOpen = sidebar.classList.contains('collapsed');
                if (nowOpen) {
                    sidebar.classList.remove('collapsed');
                    if (overlay) overlay.classList.add('active');
                    localStorage.setItem('sidebarOpen', 'true');
                } else {
                    sidebar.classList.add('collapsed');
                    if (overlay) overlay.classList.remove('active');
                    localStorage.setItem('sidebarOpen', 'false');
                }
            });
        }

        // Close via overlay click
        if (overlay) {
            overlay.addEventListener('click', function () {
                sidebar.classList.add('collapsed');
                overlay.classList.remove('active');
                localStorage.setItem('sidebarOpen', 'false');
            });
        }
    });
})();