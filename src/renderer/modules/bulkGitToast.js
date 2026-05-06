import { $, escapeHtml } from './utils.js';
import { state } from './state.js';
import { openGitFailure } from './gitFailureModal.js';

function repoName(repoPath) {
  return repoPath.split('/').pop();
}

export function showToast(title, results, op = null) {
  $('#bulk-toast-title').textContent = title;
  const body = $('#bulk-toast-body');
  body.innerHTML = '';
  for (const r of results) {
    const member = state.activeWorkspace?.members.find(m => m.worktreePath === r.worktreePath);
    const label = member ? repoName(member.repoPath) : repoName(r.worktreePath);
    const row = document.createElement('div');
    row.className = 'bulk-toast-row';
    if (r.ok) {
      const detail = (r.output || '').trim() || 'OK';
      row.innerHTML = `
        <span class="repo">${escapeHtml(label)}</span>
        <span class="ok">✓</span>
        <span class="detail">${escapeHtml(detail)}</span>
      `;
    } else {
      const investigable = op && r.worktreePath;
      row.innerHTML = `
        <span class="repo">${escapeHtml(label)}</span>
        <span class="fail">✗</span>
        <span class="detail">${escapeHtml(r.error)}</span>
        ${investigable ? '<button class="btn btn-ghost btn-investigate" type="button">Investigate…</button>' : ''}
      `;
      if (investigable) {
        row.querySelector('.btn-investigate').addEventListener('click', () => {
          $('#bulk-toast').classList.add('hidden');
          openGitFailure({ op, worktreePath: r.worktreePath, label, error: r.error });
        });
      }
    }
    body.appendChild(row);
  }
  $('#bulk-toast').classList.remove('hidden');
}

export function setupBulkToast() {
  $('#bulk-toast-close').addEventListener('click', () => {
    $('#bulk-toast').classList.add('hidden');
  });
}
