import { state } from './state.js';

const MIN = 200;
const MAX = 600;
const VAR_NAME = '--sidebar-width';

export function applySidebarWidth() {
  const w = state.settings.sidebarWidth;
  if (typeof w === 'number' && w >= MIN && w <= MAX) {
    document.documentElement.style.setProperty(VAR_NAME, `${w}px`);
  }
}

function clamp(n) { return Math.min(MAX, Math.max(MIN, n)); }

export function setupResizer() {
  const handle = document.getElementById('sidebar-resizer');
  if (!handle) return;

  applySidebarWidth();

  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  const onMouseDown = (e) => {
    dragging = true;
    startX = e.clientX;
    startWidth = document.querySelector('.sidebar').offsetWidth;
    handle.classList.add('dragging');
    document.body.classList.add('resizing');
    e.preventDefault();
  };

  const onMouseMove = (e) => {
    if (!dragging) return;
    const next = clamp(startWidth + (e.clientX - startX));
    document.documentElement.style.setProperty(VAR_NAME, `${next}px`);
  };

  const onMouseUp = async () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.classList.remove('resizing');
    const computed = getComputedStyle(document.documentElement).getPropertyValue(VAR_NAME);
    const width = Number.parseInt(computed, 10);
    if (Number.isFinite(width)) {
      state.settings.sidebarWidth = width;
      try { await globalThis.api.settings.setSidebarWidth(width); }
      catch { /* surface elsewhere if needed */ }
    }
  };

  handle.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);

  // Double-click handle resets to default.
  handle.addEventListener('dblclick', async () => {
    document.documentElement.style.setProperty(VAR_NAME, '260px');
    state.settings.sidebarWidth = 260;
    try { await globalThis.api.settings.setSidebarWidth(260); }
    catch { /* ignore */ }
  });
}
