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

// Only show the "…" loading state on a badge that has nothing in it yet (a brand-new
// card). On re-polls, leave the previous value visible so it doesn't flicker on every
// window-focus refresh — we'll swap it only if the new value actually differs.
function markLoadingIfEmpty(badge) {
  if (badge && !badge.textContent.trim()) {
    badge.textContent = '…';
    badge.className = 'status-badge loading';
  }
}

// Set element text/class/title only when they differ — avoids needless DOM writes
// (and the visible flash they cause).
function setIfChanged(el, { text, className, title }) {
  if (!el) return;
  if (text !== undefined && el.textContent !== text) el.textContent = text;
  if (className !== undefined && el.className !== className) el.className = className;
  if (title !== undefined && (el.title || '') !== (title || '')) el.title = title || '';
}

function applyStatusToCard(card, r) {
  const badge = card.querySelector('[data-status]');
  const ab = card.querySelector('[data-ahead-behind]');
  if (badge) {
    if (r.error) {
      setIfChanged(badge, { text: 'error', className: 'status-badge error', title: r.error });
    } else if (r.dirty) {
      setIfChanged(badge, { text: `● ${r.fileCount} modified`, className: 'status-badge dirty', title: '' });
    } else {
      setIfChanged(badge, { text: '✓ clean', className: 'status-badge clean', title: '' });
    }
  }
  if (ab) {
    setIfChanged(ab, { text: formatAheadBehind(r), title: r.upstream ? `vs ${r.upstream}` : '' });
  }
  if (r.branch) {
    const branchEl = card.querySelector('[data-branch]');
    if (branchEl?.firstChild && branchEl.firstChild.nodeValue !== r.branch + ' ') {
      branchEl.firstChild.nodeValue = r.branch + ' ';
    }
    const ws = state.activeWorkspace;
    if (ws) {
      const member = ws.members.find(m => m.worktreePath === card.dataset.worktreePath);
      if (member) member.branch = r.branch;
    }
  }
}

function applyErrorToCard(card, message) {
  const badge = card.querySelector('[data-status]');
  setIfChanged(badge, { text: 'error', className: 'status-badge error', title: message });
}

export async function loadStatusFor(worktreePath) {
  const card = document.querySelector(`#member-list .member-card[data-worktree-path="${CSS.escape(worktreePath)}"]`);
  if (!card) return;
  markLoadingIfEmpty(card.querySelector('[data-status]'));
  try {
    const r = await fetchStatusOnce(worktreePath);
    if (!card.isConnected) return;
    applyStatusToCard(card, r);
  } catch (e) {
    if (!card.isConnected) return;
    applyErrorToCard(card, e.message);
  }
}

export async function loadAllStatuses() {
  if (!state.activeWorkspace) return;
  const cards = document.querySelectorAll('#member-list .member-card');
  await Promise.all(Array.from(cards).map(async (card) => {
    markLoadingIfEmpty(card.querySelector('[data-status]'));
    try {
      const r = await fetchStatusOnce(card.dataset.worktreePath);
      // Card might have been removed during the fetch (workspace switch / member removed).
      if (!card.isConnected) return;
      applyStatusToCard(card, r);
    } catch (e) {
      if (!card.isConnected) return;
      applyErrorToCard(card, e.message);
    }
  }));
}
