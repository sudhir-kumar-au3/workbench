import { state, watchKey } from './state.js';
import { escapeHtml } from './utils.js';
import { runCommand, restoreOutput } from './runs.js';
import { attachBranchEditor } from './branchEditor.js';
import { notify } from './notify.js';
import { showActionMenu } from './actionMenu.js';
import { openModifiedFiles } from './modifiedFilesModal.js';

function bindCommandButton(btn, card) {
  const commandName = btn.dataset.command;
  btn.addEventListener('click', () => runCommand(card, commandName, btn));
}

function bindWatchToggle(btn, card) {
  const commandName = btn.dataset.command;
  const key = watchKey(card.dataset.worktreePath, commandName);
  if (state.watching.has(key)) btn.classList.add('active');
  btn.addEventListener('click', async () => {
    if (state.watching.has(key)) {
      await globalThis.api.watch.stop(key);
      state.watching.delete(key);
      btn.classList.remove('active');
    } else {
      await globalThis.api.watch.start(key, card.dataset.worktreePath);
      state.watching.add(key);
      btn.classList.add('active');
    }
  });
}

export function renderMembers() {
  const container = document.querySelector('#member-list');
  container.innerHTML = '';
  const ws = state.activeWorkspace;
  for (const m of ws.members) {
    const repo = state.repos.find(r => r.path === m.repoPath);
    const repoLabel = repo ? repo.name : (m.repoPath.split('/').pop() + ' (unregistered)');
    const commands = repo?.commands?.length ? repo.commands : [{ name: 'test', command: '' }];

    const card = document.createElement('div');
    card.className = 'member-card';
    card.dataset.worktreePath = m.worktreePath;
    card.dataset.repoPath = m.repoPath;

    const cmdSplitsHtml = commands.map(c => {
      const name = escapeHtml(c.name);
      return `
        <div class="cmd-split">
          <button class="btn cmd-btn cmd-run" data-action="run" data-command="${name}">${name}</button>
          <button class="btn cmd-watch" data-action="watch" data-command="${name}" title="Watch ${name} on file changes" aria-label="Watch ${name}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        </div>
      `;
    }).join('');

    card.innerHTML = `
      <div class="member-header">
        <div class="member-info">
          <div class="member-name">
            ${escapeHtml(repoLabel)}
            <span class="member-branch" data-branch>${escapeHtml(m.branch)} <span class="caret">▾</span></span>
            <span class="status-badge" data-status></span>
            <span class="ahead-behind" data-ahead-behind></span>
          </div>
          <div class="member-path" title="${escapeHtml(m.worktreePath)}">${escapeHtml(m.worktreePath)}</div>
        </div>
        <div class="member-actions">
          <button class="btn" data-action="finder" title="Open in Finder">Finder</button>
          <button class="btn" data-action="terminal" title="Open in Terminal">Terminal</button>
          <button class="btn" data-action="editor" title="Open in editor (VS Code/Cursor)">Editor</button>
          <span class="command-buttons">${cmdSplitsHtml}</span>
          <button class="btn btn-ghost" data-action="more" title="More actions" aria-label="More actions">⋯</button>
        </div>
      </div>
    `;

    card.querySelector('[data-action="finder"]').addEventListener('click', () => {
      globalThis.api.fs.openPath(m.worktreePath);
    });
    card.querySelector('[data-action="terminal"]').addEventListener('click', async () => {
      try { await globalThis.api.terminal.open(m.worktreePath); }
      catch (e) { notify.error(e.message); }
    });
    card.querySelector('[data-action="editor"]').addEventListener('click', async () => {
      try { await globalThis.api.editor.open(m.worktreePath); }
      catch (e) { notify.error(e.message); }
    });
    card.querySelectorAll('[data-action="run"]').forEach(btn => bindCommandButton(btn, card));
    card.querySelectorAll('[data-action="watch"]').forEach(btn => bindWatchToggle(btn, card));
    const moreBtn = card.querySelector('[data-action="more"]');
    if (moreBtn) moreBtn.addEventListener('click', () => showActionMenu(moreBtn, card));
    const statusBadge = card.querySelector('[data-status]');
    if (statusBadge) {
      statusBadge.addEventListener('click', () => {
        if (statusBadge.classList.contains('dirty')) {
          openModifiedFiles(repoLabel, m.worktreePath);
        }
      });
    }
    attachBranchEditor(card, card.querySelector('[data-branch]'), m.branch);

    // Restore most-recent saved run for this worktree (any command).
    const savedForWorktree = state.savedRuns[m.worktreePath];
    if (savedForWorktree) {
      const entries = Object.entries(savedForWorktree)
        .filter(([, v]) => v?.lines)
        .sort(([, a], [, b]) => (b.ranAt || '').localeCompare(a.ranAt || ''));
      if (entries.length > 0) {
        const [cmdName, run] = entries[0];
        restoreOutput(card, cmdName, run);
      }
    }
    container.appendChild(card);
  }
}
