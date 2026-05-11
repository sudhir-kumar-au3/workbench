import { state } from './state.js';
import { $ } from './utils.js';
import { refresh } from './refresh.js';
import { runCommand } from './runs.js';
import { loadAllStatuses } from './statuses.js';
import { showToast } from './bulkGitToast.js';
import { notify } from './notify.js';
import { openGitFailure } from './gitFailureModal.js';
import { refreshPrChips } from './memberCard.js';
import { icons } from './icons.js';
import { openCreatePrBulk } from './createPrModal.js';

const OP_DISPLAY_TO_KIND = {
  fetch: 'pull',  // fetch failures are basically network/auth — group with pull
  pull: 'pull',
  rebase: 'sync',
  push: 'push',
};

function defaultCommand(card) {
  // Pick a deterministic default command — first one configured for the repo.
  const repoPath = card.dataset.repoPath;
  const repo = state.repos.find(r => r.path === repoPath);
  const cmdName = repo?.commands?.[0]?.name || 'test';
  const btn = card.querySelector(`[data-action="run"][data-command="${cmdName}"]`);
  return btn ? { btn, cmdName } : null;
}

// Run the default command on every mounted card, at most `concurrency` at a time.
// concurrency = 1 → strictly sequential; concurrency >= card count → all at once.
async function runPool(concurrency) {
  if (state.runPoolActive) return;
  state.runPoolActive = true;
  const stopBtn = $('#ws-stop-all');
  stopBtn.classList.remove('hidden');
  const queue = Array.from(document.querySelectorAll('#member-list .member-card'))
    .map(card => ({ card, def: defaultCommand(card) }))
    .filter(x => x.def && !x.def.btn.dataset.runId);
  const total = queue.length;
  let started = 0;
  let finished = 0;
  const refreshLabel = () => {
    if (total === 0) { stopBtn.textContent = 'Stop all'; return; }
    const running = started - finished;
    const queued = total - started;
    const bits = [`${finished}/${total}`];
    if (running) bits.push(`${running} running`);
    if (queued) bits.push(`${queued} queued`);
    stopBtn.textContent = `Stop all · ${bits.join(' · ')}`;
  };
  refreshLabel();
  const worker = async () => {
    while (state.runPoolActive && started < queue.length) {
      const { card, def } = queue[started++];
      refreshLabel();
      if (def.btn.dataset.runId) { finished++; refreshLabel(); continue; } // started elsewhere
      await runCommand(card, def.cmdName, def.btn);
      finished++;
      refreshLabel();
    }
  };
  const n = Math.max(1, Math.min(Math.round(concurrency) || 1, total || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  state.runPoolActive = false;
  stopBtn.textContent = 'Stop all';
  stopBtn.classList.add('hidden');
}

async function runBulkOp(op, label) {
  const ws = state.activeWorkspace;
  if (!ws) return;
  const paths = ws.members.map(m => m.worktreePath);
  const failureOp = OP_DISPLAY_TO_KIND[op] || op;
  showToast(`${label} (running…)`, paths.map(p => ({ worktreePath: p, ok: true, output: '…' })));
  try {
    const results = await globalThis.api.git.bulkOp(op, paths);
    const failures = results.filter(r => !r.ok);
    // If exactly one member failed, open the failure dialog directly — saves a click.
    // Multiple failures still go through the toast (with per-row "Investigate…" buttons).
    if (failures.length === 1 && results.length > 1) {
      showToast(label, results, failureOp);
      const f = failures[0];
      const member = ws.members.find(m => m.worktreePath === f.worktreePath);
      const repoLabel = member ? state.repos.find(r => r.path === member.repoPath)?.name || member.repoPath.split('/').pop() : '';
      openGitFailure({ op: failureOp, worktreePath: f.worktreePath, label: repoLabel, error: f.error });
    } else if (failures.length === 1 && results.length === 1) {
      // Single-member workspace: skip the toast entirely; open the dialog.
      const f = failures[0];
      const member = ws.members.find(m => m.worktreePath === f.worktreePath);
      const repoLabel = member ? state.repos.find(r => r.path === member.repoPath)?.name || member.repoPath.split('/').pop() : '';
      openGitFailure({ op: failureOp, worktreePath: f.worktreePath, label: repoLabel, error: f.error });
    } else {
      showToast(label, results, failureOp);
    }
    loadAllStatuses();
  } catch (e) {
    showToast(label, paths.map(p => ({ worktreePath: p, ok: false, error: e.message })), failureOp);
  }
}

export function setupWorkspaceToolbar({ openMetadataModal }) {
  // Fill the icon-only toolbar buttons from the shared icon set.
  $('#ws-refresh').innerHTML = icons.refresh();
  $('#ws-compact-toggle').innerHTML = icons.rows();
  $('#ws-edit-meta').innerHTML = icons.edit();

  $('#ws-refresh').addEventListener('click', async () => {
    // Explicit refresh: bust the PR cache so chips re-query GitHub.
    await globalThis.api.git.clearPrCache(null).catch(() => {});
    loadAllStatuses();
    refreshPrChips();
  });
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
  $('#ws-create-prs').addEventListener('click', () => {
    if (!state.activeWorkspace) return;
    openCreatePrBulk();
  });

  $('#ws-run-all').addEventListener('click', () => {
    const n = Number(state.settings?.runConcurrency) || 4;
    runPool(n);
  });
  $('#ws-run-all-seq').addEventListener('click', () => runPool(1));

  $('#ws-stop-all').addEventListener('click', () => {
    state.runPoolActive = false;
    for (const [runId] of state.runs) globalThis.api.runs.stop(runId);
  });

  $('#ws-open-ide').addEventListener('click', async () => {
    const ws = state.activeWorkspace;
    if (!ws) return;
    try { await globalThis.api.editor.open(`${ws.parentDir}/${ws.name}`); }
    catch (e) { notify.error(e.message); }
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
