/**
 * Wide Screen Toggle Feature
 * Allows users to toggle between normal and wide screen modes.
 * Inspired by OI-Wiki.
 */

document$.subscribe(() => {
  // Check if toggle button already exists to avoid duplicates
  if (document.querySelector('.width-toggle-btn')) {
    return;
  }

  // Determine initial state from localStorage
  const isWide = localStorage.getItem('wide-screen') === 'true';
  if (isWide) {
    document.body.setAttribute('data-wide-screen', 'true');
  }

  // SVG icon: arrows pointing outward (expand to wide-screen)
  const ICON_EXPAND = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <path d="M2 7V5C2 3.9 2.9 3 4 3H20C21.1 3 22 3.9 22 5V7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M2 17V19C2 20.1 2.9 21 4 21H20C21.1 21 22 20.1 22 19V17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M8 12H2M2 12L4.5 9.5M2 12L4.5 14.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M16 12H22M22 12L19.5 9.5M22 12L19.5 14.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  // SVG icon: arrows pointing inward (compress back to normal)
  const ICON_COMPRESS = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <path d="M2 7V5C2 3.9 2.9 3 4 3H20C21.1 3 22 3.9 22 5V7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M2 17V19C2 20.1 2.9 21 4 21H20C21.1 21 22 20.1 22 19V17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M2 12H8M8 12L5.5 9.5M8 12L5.5 14.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M22 12H16M16 12L18.5 9.5M16 12L18.5 14.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  // Sync button icon and tooltip to current state
  const updateButton = (wide) => {
    button.innerHTML = wide ? ICON_COMPRESS : ICON_EXPAND;
    button.setAttribute('aria-label', wide ? 'Switch to normal mode' : 'Switch to wide-screen mode');
  };

  // Create toggle button
  const button = document.createElement('button');
  button.className = 'md-header__option md-icon';
  button.classList.add('width-toggle-btn');

  // Set initial icon based on current state
  updateButton(isWide);

  button.addEventListener('click', () => {
    const body = document.body;
    const isWide = body.getAttribute('data-wide-screen') === 'true';

    if (isWide) {
      body.removeAttribute('data-wide-screen');
      localStorage.setItem('wide-screen', 'false');
      updateButton(false);
    } else {
      body.setAttribute('data-wide-screen', 'true');
      localStorage.setItem('wide-screen', 'true');
      updateButton(true);
    }
  });

  // Insert button into header
  const target = document.querySelector('.md-header__option[data-md-component="palette"]');
  if (target) {
    target.parentNode.insertBefore(button, target);
  } else {
    // Fallback if palette is missing
    const search = document.querySelector('.md-header__option[data-md-component="search"]');
    if (search) {
      search.parentNode.insertBefore(button, search);
    }
  }

  // Auto-update copyright year parameter in footer
  const yearEl = document.getElementById('copyright-year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }
});
