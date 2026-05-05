import { state, watchKey } from './state.js';
import { runCommand } from './runs.js';
import { loadAllStatuses } from './statuses.js';

let lastFocusFetchAt = 0;
const FOCUS_FETCH_COOLDOWN_MS = 60_000;

export function setupAutoActions() {
  // Watch trigger -> re-run the matching command if its card is mounted.
  globalThis.api.watch.onTrigger((key) => {
    for (const card of document.querySelectorAll('#member-list .member-card')) {
      for (const btn of card.querySelectorAll('[data-action="run"]')) {
        if (watchKey(card.dataset.worktreePath, btn.dataset.command) === key) {
          if (!btn.dataset.runId) runCommand(card, btn.dataset.command, btn);
          return;
        }
      }
    }
  });

  // Auto-fetch on app focus (rate-limited).
  globalThis.api.onAppFocus(async () => {
    const now = Date.now();
    if (now - lastFocusFetchAt < FOCUS_FETCH_COOLDOWN_MS) {
      loadAllStatuses();
      return;
    }
    lastFocusFetchAt = now;
    const ws = state.activeWorkspace;
    if (ws) {
      const paths = ws.members.map(m => m.worktreePath);
      try { await globalThis.api.git.bulkOp('fetch', paths); }
      catch { /* surface via status */ }
    }
    loadAllStatuses();
  });
}
