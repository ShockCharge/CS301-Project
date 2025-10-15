document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.expand-submenu > a').forEach(menu => {
      menu.addEventListener('click', e => {
        e.preventDefault(); // prevent navigation
        const parent = menu.parentElement;
        parent.classList.toggle('active'); // toggle submenu visibility
      });
    });
  });