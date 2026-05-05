import { state } from './state.js';
import { $ } from './utils.js';

const ORDER = ['system', 'light', 'dark'];

export function applyTheme() {
  const theme = state.settings.theme || 'system';
  document.body.dataset.theme = theme;
  const btn = $('#theme-toggle');
  if (btn) btn.textContent = `Theme: ${theme}`;
}

export function setupThemeToggle() {
  $('#theme-toggle').addEventListener('click', async () => {
    const current = state.settings.theme || 'system';
    const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
    state.settings.theme = next;
    await globalThis.api.settings.setTheme(next);
    applyTheme();
  });
  applyTheme();
}
