(function () {
    'use strict';

    /* Apply dark mode before/at page load. */
    if (localStorage.getItem('darkMode') === 'true') {
        document.documentElement.classList.add('dark-mode-pre');
        document.addEventListener('DOMContentLoaded', function () {
            document.body.classList.add('dark-mode');
            document.documentElement.classList.remove('dark-mode-pre');
        });
    }

    function setSidebarState(sidebar, overlay, open) {
        var isMobile = window.innerWidth <= 768;
        sidebar.classList.toggle('collapsed', !open);

        if (overlay) {
            overlay.classList.toggle('active', Boolean(open && isMobile));
        }

        localStorage.setItem('sidebarOpen', open ? 'true' : 'false');
    }

    function initSidebarOnce() {
        if (window.__studyPlannerSidebarInitialized) return;
        window.__studyPlannerSidebarInitialized = true;

        var sidebar   = document.getElementById('sidebar');
        var overlay   = document.getElementById('sidebar-overlay');
        var toggleBtn = document.getElementById('sidebar-toggle');
        var actToggle = document.getElementById('activities-toggle');
        var actSubmenu = document.getElementById('activities-submenu');
        var actArrow = document.getElementById('activities-arrow');

        if (!sidebar) return;

        var savedOpen = localStorage.getItem('sidebarOpen') === 'true';
        setSidebarState(sidebar, overlay, savedOpen);

        if (toggleBtn) {
            toggleBtn.addEventListener('click', function (e) {
                e.preventDefault();
                var opening = sidebar.classList.contains('collapsed');
                setSidebarState(sidebar, overlay, opening);
            });
        }

        if (overlay) {
            overlay.addEventListener('click', function () {
                setSidebarState(sidebar, overlay, false);
            });
        }

        if (actToggle && actSubmenu) {
            actToggle.addEventListener('click', function (e) {
                e.preventDefault();

                /* YouTube-style behavior: when the sidebar is icon-only,
                   clicking the Activities icon first opens the sidebar so
                   the activity links can be selected. */
                if (sidebar.classList.contains('collapsed')) {
                    setSidebarState(sidebar, overlay, true);
                    actSubmenu.classList.add('active');
                    if (actArrow) actArrow.classList.add('rotated');
                    return;
                }

                actSubmenu.classList.toggle('active');
                if (actArrow) actArrow.classList.toggle('rotated');
            });
        }
    }

    document.addEventListener('DOMContentLoaded', initSidebarOnce);
})();
