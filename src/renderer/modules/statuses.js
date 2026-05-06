import { state } from './state.js';

function formatAheadBehind(r) {
  if (!r.hasUpstream) return 'no upstream';
  if (r.ahead === 0 && r.behind === 0) return 'in sync';
  const parts = [];
  if (r.ahead > 0) parts.push(`↑${r.ahead}`);
  if (r.behind > 0) parts.push(`↓${r.behind}`);
  return parts.join(' ');
}

// Coalesce concurrent status calls for the same worktree path.
// If a status call is in flight when another arrives, the second await reuses the first promise.
const inFlight = new Map();

function fetchStatusOnce(worktreePath) {
  const existing = inFlight.get(worktreePath);
  if (existing) return existing;
  const p = globalThis.api.worktrees.status(worktreePath).finally(() => {
    inFlight.delete(worktreePath);
  });
  inFlight.set(worktreePath, p);
  return p;
}

function applyStatusToCard(card, r) {
  const badge = card.querySelector('[data-status]');
  const ab = card.querySelector('[data-ahead-behind]');
  if (!badge) return;
  if (r.error) {
    badge.textContent = 'error';
    badge.className = 'status-badge error';
    badge.title = r.error;
  } else if (r.dirty) {
    badge.textContent = `● ${r.fileCount} modified`;
    badge.className = 'status-badge dirty';
    badge.title = '';
  } else {
    badge.textContent = '✓ clean';
    badge.className = 'status-badge clean';
    badge.title = '';
  }
  if (ab) {
    ab.textContent = formatAheadBehind(r);
    ab.title = r.upstream ? `vs ${r.upstream}` : '';
  }
  if (r.branch) {
    const branchEl = card.querySelector('[data-branch]');
    if (branchEl?.firstChild) branchEl.firstChild.nodeValue = r.branch + ' ';
    const ws = state.activeWorkspace;
    if (ws) {
      const member = ws.members.find(m => m.worktreePath === card.dataset.worktreePath);
      if (member) member.branch = r.branch;
    }
  }
}

export async function loadStatusFor(worktreePath) {
  const card = document.querySelector(`#member-list .member-card[data-worktree-path="${CSS.escape(worktreePath)}"]`);
  if (!card) return;
  const badge = card.querySelector('[data-status]');
  if (badge && !badge.classList.contains('loading')) {
    badge.textContent = '…';
    badge.className = 'status-badge loading';
  }
  try {
    const r = await fetchStatusOnce(worktreePath);
    if (!card.isConnected) return;
    applyStatusToCard(card, r);
  } catch (e) {
    if (!card.isConnected) return;
    if (badge) {
      badge.textContent = 'error';
      badge.className = 'status-badge error';
      badge.title = e.message;
    }
  }
}

export async function loadAllStatuses() {
  if (!state.activeWorkspace) return;
  const cards = document.querySelectorAll('#member-list .member-card');
  await Promise.all(Array.from(cards).map(async (card) => {
    const badge = card.querySelector('[data-status]');
    const ab = card.querySelector('[data-ahead-behind]');
    if (badge && !badge.classList.contains('loading')) {
      badge.textContent = '…';
      badge.className = 'status-badge loading';
    }
    if (ab && !ab.textContent) ab.textContent = '';
    try {
      const r = await fetchStatusOnce(card.dataset.worktreePath);
      // Card might have been removed during the fetch (workspace switch / member removed).
      if (!card.isConnected) return;
      applyStatusToCard(card, r);
    } catch (e) {
      if (!card.isConnected) return;
      if (badge) {
        badge.textContent = 'error';
        badge.className = 'status-badge error';
        badge.title = e.message;
      }
    }
  }));
}
