import { state } from './state.js';

function formatAheadBehind(r) {
  if (!r.hasUpstream) return 'no upstream';
  if (r.ahead === 0 && r.behind === 0) return 'in sync';
  const parts = [];
  if (r.ahead > 0) parts.push(`↑${r.ahead}`);
  if (r.behind > 0) parts.push(`↓${r.behind}`);
  return parts.join(' ');
}

export async function loadAllStatuses() {
  if (!state.activeWorkspace) return;
  const cards = document.querySelectorAll('#member-list .member-card');
  await Promise.all(Array.from(cards).map(async (card) => {
    const badge = card.querySelector('[data-status]');
    const ab = card.querySelector('[data-ahead-behind]');
    badge.textContent = '…';
    badge.className = 'status-badge loading';
    if (ab) ab.textContent = '';
    try {
      const r = await globalThis.api.worktrees.status(card.dataset.worktreePath);
      if (r.error) {
        badge.textContent = 'error';
        badge.className = 'status-badge error';
        badge.title = r.error;
      } else if (r.dirty) {
        badge.textContent = `● ${r.fileCount} modified`;
        badge.className = 'status-badge dirty';
      } else {
        badge.textContent = '✓ clean';
        badge.className = 'status-badge clean';
      }
      if (ab) {
        ab.textContent = formatAheadBehind(r);
        ab.title = r.upstream ? `vs ${r.upstream}` : '';
      }
      if (r.branch) {
        const branchEl = card.querySelector('[data-branch]');
        if (branchEl) {
          branchEl.firstChild.nodeValue = r.branch + ' ';
        }
        const ws = state.activeWorkspace;
        if (ws) {
          const member = ws.members.find(m => m.worktreePath === card.dataset.worktreePath);
          if (member) member.branch = r.branch;
        }
      }
    } catch (e) {
      badge.textContent = 'error';
      badge.className = 'status-badge error';
      badge.title = e.message;
    }
  }));
}
