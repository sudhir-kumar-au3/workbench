import { state } from './state.js';
import { $ } from './utils.js';
import { renderMain } from './workspaceView.js';
import { renderSidebar } from './sidebar.js';
import { openPalette } from './commandPalette.js';
import { openKeyboardHelp } from './keyboardHelp.js';
import { toggleSidebarCollapse } from './displayMode.js';

function isInputFocused() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

function activeModal() {
  return document.querySelector('.modal:not(.hidden)');
}

export function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const cmd = e.metaKey || e.ctrlKey;

    // Esc closes any open modal.
    if (e.key === 'Escape') {
      const modal = activeModal();
      if (modal) {
        modal.classList.add('hidden');
        e.preventDefault();
        return;
      }
      const toast = $('#bulk-toast');
      if (toast && !toast.classList.contains('hidden')) {
        toast.classList.add('hidden');
        return;
      }
    }

    // Cmd+K: command palette (highest priority — works even when typing).
    if (cmd && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openPalette();
      return;
    }

    // Cmd+\: toggle sidebar.
    if (cmd && e.key === '\\') {
      e.preventDefault();
      toggleSidebarCollapse();
      return;
    }

    // Cmd+N: new workspace.
    if (cmd && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      $('#new-workspace').click();
      return;
    }

    // Cmd+1..9: switch workspace.
    if (cmd && /^[1-9]$/.test(e.key)) {
      e.preventDefault();
      const idx = Number.parseInt(e.key, 10) - 1;
      const ws = state.workspaces[idx];
      if (ws) {
        state.activeWorkspace = ws;
        renderSidebar();
        renderMain();
      }
      return;
    }

    if (isInputFocused()) return;

    // ?: keyboard help.
    if (e.key === '?') {
      e.preventDefault();
      openKeyboardHelp();
      return;
    }

    // R: run all (default command per card).
    if (e.key === 'r' || e.key === 'R') {
      const btn = $('#ws-run-all');
      if (btn && state.activeWorkspace) {
        e.preventDefault();
        btn.click();
      }
      return;
    }
    // S: stop all.
    if (e.key === 's' || e.key === 'S') {
      const btn = $('#ws-stop-all');
      if (btn && !btn.classList.contains('hidden')) {
        e.preventDefault();
        btn.click();
      } else if (state.runs.size > 0) {
        e.preventDefault();
        for (const [runId] of state.runs) globalThis.api.runs.stop(runId);
      }
    }
  });
}
