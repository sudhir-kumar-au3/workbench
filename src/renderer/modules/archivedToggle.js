import { state } from './state.js';
import { $ } from './utils.js';
import { renderSidebar } from './sidebar.js';

function updateLabel() {
  $('#show-archived-toggle').textContent = state.settings.showArchived ? 'Hide archived' : 'Show archived';
}

export function setupShowArchivedToggle() {
  updateLabel();
  $('#show-archived-toggle').addEventListener('click', async () => {
    state.settings.showArchived = !state.settings.showArchived;
    updateLabel();
    renderSidebar();
    try { await globalThis.api.settings.setPref('showArchived', state.settings.showArchived); }
    catch { /* ignore */ }
  });
}

export function refreshArchivedToggleLabel() { updateLabel(); }
