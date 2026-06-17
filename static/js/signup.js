    /* Password visibility toggles */
    function setupToggle(btnId, inputId) {
        document.getElementById(btnId).addEventListener('click', function () {
            const inp = document.getElementById(inputId);
            const icon = this.querySelector('i');
            if (inp.type === 'password') {
                inp.type = 'text';
                icon.classList.replace('bi-eye', 'bi-eye-slash');
            } else {
                inp.type = 'password';
                icon.classList.replace('bi-eye-slash', 'bi-eye');
            }
        });
    }

    setupToggle('toggle-password', 'password');
    setupToggle('toggle-confirm',  'confirm-password');

    /* Client-side password match check */
    document.getElementById('signup-form').addEventListener('submit', function (e) {
        const pw  = document.getElementById('password').value;
        const cpw = document.getElementById('confirm-password').value;
        if (pw !== cpw) {
            e.preventDefault();
            alert('Passwords do not match. Please try again.');
        }
    });
