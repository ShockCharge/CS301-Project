(function () {
    'use strict';

    /* ── 1. Apply dark-mode class BEFORE paint to avoid flash ── */
    if (localStorage.getItem('darkMode') === 'true') {
        document.documentElement.classList.add('dark-mode-pre');
        document.addEventListener('DOMContentLoaded', function () {
            document.body.classList.add('dark-mode');
            document.documentElement.classList.remove('dark-mode-pre');
        });
    }

    /* ── 2. Sidebar persistence across pages ── */
    document.addEventListener('DOMContentLoaded', function () {
        var sidebar   = document.getElementById('sidebar');
        var overlay   = document.getElementById('sidebar-overlay');
        var toggleBtn = document.getElementById('sidebar-toggle');
        if (!sidebar) return;

        /* Restore saved state */
        if (localStorage.getItem('sidebarOpen') === 'true') {
            sidebar.classList.remove('collapsed');
            if (overlay) overlay.classList.add('active');
        } else {
            sidebar.classList.add('collapsed');
            if (overlay) overlay.classList.remove('active');
        }

        /* Toggle button */
        if (toggleBtn) {
            toggleBtn.addEventListener('click', function () {
                var opening = sidebar.classList.contains('collapsed');
                sidebar.classList.toggle('collapsed', !opening);
                if (overlay) overlay.classList.toggle('active', opening);
                localStorage.setItem('sidebarOpen', opening ? 'true' : 'false');
            });
        }

        /* Close on overlay click */
        if (overlay) {
            overlay.addEventListener('click', function () {
                sidebar.classList.add('collapsed');
                overlay.classList.remove('active');
                localStorage.setItem('sidebarOpen', 'false');
            });
        }

        /* Activities submenu — single clean handler */
        var actToggle  = document.getElementById('activities-toggle');
        var actSubmenu = document.getElementById('activities-submenu');
        var actArrow   = document.getElementById('activities-arrow');
        if (actToggle && actSubmenu) {
            actToggle.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                actSubmenu.classList.toggle('active');
                if (actArrow) actArrow.classList.toggle('rotated');
            });
        }
    });
})();