import { $, escapeHtml } from './utils.js';
import { state } from './state.js';

function repoName(repoPath) {
  return repoPath.split('/').pop();
}

export function showToast(title, results) {
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
      row.innerHTML = `
        <span class="repo">${escapeHtml(label)}</span>
        <span class="fail">✗</span>
        <span class="detail">${escapeHtml(r.error)}</span>
      `;
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
