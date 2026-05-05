import { state } from './state.js';
import { $ } from './utils.js';
import { refresh } from './refresh.js';
import { runCommand } from './runs.js';
import { loadAllStatuses } from './statuses.js';
import { showToast } from './bulkGitToast.js';
import { notify } from './notify.js';

function defaultCommand(card) {
  // Pick a deterministic default command — first one configured for the repo.
  const repoPath = card.dataset.repoPath;
  const repo = state.repos.find(r => r.path === repoPath);
  const cmdName = repo?.commands?.[0]?.name || 'test';
  const btn = card.querySelector(`[data-action="run"][data-command="${cmdName}"]`);
  return btn ? { btn, cmdName } : null;
}

async function runBulkOp(op, label) {
  const ws = state.activeWorkspace;
  if (!ws) return;
  const paths = ws.members.map(m => m.worktreePath);
  showToast(`${label} (running…)`, paths.map(p => ({ worktreePath: p, ok: true, output: '…' })));
  try {
    const results = await globalThis.api.git.bulkOp(op, paths);
    showToast(label, results);
    loadAllStatuses();
  } catch (e) {
    showToast(label, paths.map(p => ({ worktreePath: p, ok: false, error: e.message })));
  }
}

export function setupWorkspaceToolbar({ openMetadataModal }) {
  $('#ws-refresh').addEventListener('click', () => loadAllStatuses());
  $('#ws-fetch').addEventListener('click', () => runBulkOp('fetch', 'Fetch'));
  $('#ws-pull').addEventListener('click', () => runBulkOp('pull', 'Pull (--ff-only)'));
  $('#ws-sync').addEventListener('click', async () => {
    await runBulkOp('fetch', 'Fetch');
    await runBulkOp('rebase', 'Rebase on upstream');
  });
  $('#ws-push').addEventListener('click', () => {
    if (!confirm('Push all members of this workspace?')) return;
    runBulkOp('push', 'Push');
  });

  $('#ws-run-all').addEventListener('click', () => {
    document.querySelectorAll('#member-list .member-card').forEach(card => {
      const def = defaultCommand(card);
      if (def && !def.btn.dataset.runId) runCommand(card, def.cmdName, def.btn);
    });
  });

  $('#ws-run-all-seq').addEventListener('click', async () => {
    if (state.sequentialActive) return;
    state.sequentialActive = true;
    $('#ws-stop-all').classList.remove('hidden');
    const cards = Array.from(document.querySelectorAll('#member-list .member-card'));
    for (const card of cards) {
      if (!state.sequentialActive) break;
      const def = defaultCommand(card);
      if (!def || def.btn.dataset.runId) continue;
      await runCommand(card, def.cmdName, def.btn);
    }
    state.sequentialActive = false;
    $('#ws-stop-all').classList.add('hidden');
  });

  $('#ws-stop-all').addEventListener('click', () => {
    state.sequentialActive = false;
    for (const [runId] of state.runs) globalThis.api.runs.stop(runId);
  });

  $('#ws-edit-meta').addEventListener('click', () => openMetadataModal());

  $('#ws-archive').addEventListener('click', async () => {
    const ws = state.activeWorkspace;
    if (!ws) return;
    try {
      state.workspaces = await globalThis.api.workspaces.setArchived(ws.name, !ws.archived);
      const next = state.workspaces.find(w => w.name === ws.name);
      state.activeWorkspace = next?.archived && !state.settings.showArchived ? null : next;
      await refresh();
      notify.success(next?.archived ? `Archived ${ws.name}` : `Restored ${ws.name}`);
    } catch (e) {
      notify.error(e.message);
    }
  });

  $('#ws-delete').addEventListener('click', async () => {
    const ws = state.activeWorkspace;
    if (!ws) return;
    if (!confirm(`Delete workspace "${ws.name}"? This will remove all its worktrees.`)) return;
    try {
      await globalThis.api.workspaces.delete(ws.name, false);
      state.activeWorkspace = null;
      await refresh();
    } catch (e) {
      if (confirm(`${e.message}\n\nForce remove (discards local changes in worktrees)?`)) {
        try {
          await globalThis.api.workspaces.delete(ws.name, true);
          state.activeWorkspace = null;
          await refresh();
        } catch (error_) {
          notify.error(error_.message);
        }
      }
    }
  });
}
