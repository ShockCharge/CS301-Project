
(function () {
    'use strict';
    if (localStorage.getItem('darkMode') === 'true') {
        document.documentElement.classList.add('dark-mode-pending');
        document.addEventListener('DOMContentLoaded', function () {
            document.body.classList.add('dark-mode');
            document.documentElement.classList.remove('dark-mode-pending');
        });
    }
})();
