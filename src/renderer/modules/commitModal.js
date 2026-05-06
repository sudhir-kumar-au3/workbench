import { $ } from './utils.js';
import { notify } from './notify.js';
import { loadStatusFor } from './statuses.js';
import { openGitFailure } from './gitFailureModal.js';

let currentTarget = null;

function setProgress(text, kind = 'busy') {
  const el = $('#commit-progress');
  const txt = el.querySelector('[data-progress-text]');
  if (!text) {
    el.classList.add('hidden');
    el.classList.remove('done', 'busy');
    txt.textContent = '';
    return;
  }
  txt.textContent = text;
  el.classList.remove('hidden', 'done', 'busy');
  el.classList.add(kind);
}

function setBusy(busy, label = 'Commit') {
  $('#commit-confirm').disabled = busy;
  $('#commit-cancel').disabled = busy;
  $('#commit-confirm').textContent = label;
}

export function openCommitModal(label, worktreePath) {
  currentTarget = worktreePath;
  $('#commit-title').textContent = `Commit — ${label}`;
  $('#commit-meta').textContent = worktreePath;
  $('#commit-message').value = '';
  $('#commit-push').checked = false;
  $('#commit-error').textContent = '';
  setProgress('');
  setBusy(false);
  $('#commit-modal').classList.remove('hidden');
  setTimeout(() => $('#commit-message').focus(), 50);
}

async function confirm() {
  const message = $('#commit-message').value.trim();
  const errEl = $('#commit-error');
  errEl.textContent = '';
  if (!message) { errEl.textContent = 'Message is required.'; return; }
  if (!currentTarget) return;
  const willPush = $('#commit-push').checked;
  const target = currentTarget;
  const titleLabel = ($('#commit-title').textContent || '').replace(/^Commit\s*—\s*/, '').trim() || target.split('/').pop();

  try {
    setBusy(true, 'Committing…');
    setProgress('Committing…');
    try {
      await globalThis.api.git.commitAll(target, message);
    } catch (e) {
      // Commit failures are usually about hooks or message format — keep inline.
      errEl.textContent = e.message;
      setProgress('');
      return;
    }

    if (willPush) {
      setBusy(true, 'Pushing…');
      setProgress('Pushing to remote…');
      const results = await globalThis.api.git.bulkOp('push', [target]);
      const r = results[0];
      if (!r.ok) {
        // Commit succeeded; surface the push failure in the rich diagnostic dialog.
        $('#commit-modal').classList.add('hidden');
        loadStatusFor(target);
        openGitFailure({
          op: 'push',
          worktreePath: target,
          label: titleLabel,
          error: r.error,
        });
        notify.success('Committed (push failed — see dialog).');
        return;
      }
      setProgress('✓ Pushed', 'done');
    } else {
      setProgress('✓ Committed', 'done');
    }

    loadStatusFor(target);
    await new Promise(resolve => setTimeout(resolve, 600));
    $('#commit-modal').classList.add('hidden');
    notify.success(willPush ? 'Committed and pushed.' : 'Committed.');
  } finally {
    setBusy(false);
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
