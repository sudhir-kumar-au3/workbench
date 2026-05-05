import { $ } from './utils.js';
import { notify } from './notify.js';
import { loadAllStatuses } from './statuses.js';

let currentTarget = null;

export function openCommitModal(label, worktreePath) {
  currentTarget = worktreePath;
  $('#commit-title').textContent = `Commit — ${label}`;
  $('#commit-meta').textContent = worktreePath;
  $('#commit-message').value = '';
  $('#commit-push').checked = false;
  $('#commit-error').textContent = '';
  $('#commit-modal').classList.remove('hidden');
  setTimeout(() => $('#commit-message').focus(), 50);
}

async function confirm() {
  const message = $('#commit-message').value.trim();
  const errEl = $('#commit-error');
  errEl.textContent = '';
  if (!message) { errEl.textContent = 'Message is required.'; return; }
  if (!currentTarget) return;
  $('#commit-confirm').disabled = true;
  try {
    await globalThis.api.git.commitAll(currentTarget, message);
    if ($('#commit-push').checked) {
      const results = await globalThis.api.git.bulkOp('push', [currentTarget]);
      const r = results[0];
      if (!r.ok) throw new Error(r.error);
      notify.success('Committed and pushed.');
    } else {
      notify.success('Committed.');
    }
    $('#commit-modal').classList.add('hidden');
    loadAllStatuses();
  } catch (e) {
    errEl.textContent = e.message;
  } finally {
    $('#commit-confirm').disabled = false;
  }
}

export function setupCommitModal() {
  $('#commit-cancel').addEventListener('click', () => $('#commit-modal').classList.add('hidden'));
  $('#commit-confirm').addEventListener('click', confirm);
  $('#commit-message').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      confirm();
    }
  });
}
