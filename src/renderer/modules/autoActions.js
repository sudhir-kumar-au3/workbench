import { state, watchKey } from './state.js';
import { runCommand } from './runs.js';
import { loadAllStatuses } from './statuses.js';

let lastFocusFetchAt = 0;
let lastFocusStatusAt = 0;
const FOCUS_FETCH_COOLDOWN_MS = 60_000;
const FOCUS_STATUS_COOLDOWN_MS = 5_000; // don't re-poll all worktree statuses on every alt-tab

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

  // Auto-fetch on app focus (rate-limited), then refresh statuses (also rate-limited
  // so rapid window switching doesn't fan out N git processes per focus).
  globalThis.api.onAppFocus(async () => {
    const now = Date.now();
    const doStatus = () => {
      if (now - lastFocusStatusAt < FOCUS_STATUS_COOLDOWN_MS) return;
      lastFocusStatusAt = now;
      loadAllStatuses();
    };
    if (now - lastFocusFetchAt < FOCUS_FETCH_COOLDOWN_MS) {
      doStatus();
      return;
    }
    lastFocusFetchAt = now;
    const ws = state.activeWorkspace;
    if (ws) {
      const paths = ws.members.map(m => m.worktreePath);
      try { await globalThis.api.git.bulkOp('fetch', paths); }
      catch { /* surface via status */ }
    }
    // A fetch changes upstream state, so always refresh after one.
    lastFocusStatusAt = Date.now();
    loadAllStatuses();
  });
}
