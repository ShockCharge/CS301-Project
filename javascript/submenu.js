document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.expand-submenu > a').forEach(menu => {
      menu.addEventListener('click', e => {
        e.preventDefault();
        const parent = menu.parentElement;
        parent.classList.toggle('active');
      });
    });
  });