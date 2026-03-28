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

  // Create toggle button
  const button = document.createElement('button');
  button.className = 'md-header__option md-icon';
  // Removed title attribute to use custom CSS tooltip instead
  button.setAttribute('aria-label', 'Switch to wide-screen mode');

  // Icon (inline SVG for theme color support):
  button.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <path d="M2 7V5C2 3.9 2.9 3 4 3H20C21.1 3 22 3.9 22 5V7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M2 17V19C2 20.1 2.9 21 4 21H20C21.1 21 22 20.1 22 19V17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M8 12H2M2 12L4.5 9.5M2 12L4.5 14.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M16 12H22M22 12L19.5 9.5M22 12L19.5 14.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  // Add a specific class for precise styling
  button.classList.add('width-toggle-btn');

  button.addEventListener('click', () => {
    const body = document.body;
    const isWide = body.getAttribute('data-wide-screen') === 'true';

    if (isWide) {
      body.removeAttribute('data-wide-screen');
      localStorage.setItem('wide-screen', 'false');
    } else {
      body.setAttribute('data-wide-screen', 'true');
      localStorage.setItem('wide-screen', 'true');
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
});
