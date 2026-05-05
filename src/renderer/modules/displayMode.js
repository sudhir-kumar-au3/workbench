import { state } from './state.js';
import { $ } from './utils.js';

export function applyDisplayPrefs() {
  document.body.classList.toggle('compact', !!state.settings.compactMode);
  document.body.classList.toggle('sidebar-collapsed', !!state.settings.sidebarCollapsed);
  document.body.classList.toggle('reduced-motion', !!state.settings.reducedMotion);
  document.body.dataset.accent = state.settings.accentColor || 'indigo';
  const collapseBtn = $('#sidebar-collapse-toggle');
  if (collapseBtn) collapseBtn.textContent = state.settings.sidebarCollapsed ? '›' : '‹';
}

async function setPref(key, value) {
  state.settings[key] = value;
  applyDisplayPrefs();
  try { await globalThis.api.settings.setPref(key, value); }
  catch { /* surface elsewhere if needed */ }
}

export function setupDisplayMode() {
  applyDisplayPrefs();
  $('#ws-compact-toggle').addEventListener('click', () => {
    setPref('compactMode', !state.settings.compactMode);
  });
  $('#sidebar-collapse-toggle').addEventListener('click', () => {
    setPref('sidebarCollapsed', !state.settings.sidebarCollapsed);
  });
}

export function toggleSidebarCollapse() {
  setPref('sidebarCollapsed', !state.settings.sidebarCollapsed);
}
