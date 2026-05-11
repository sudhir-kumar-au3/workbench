import { state, watchKey } from './state.js';
import { escapeHtml } from './utils.js';
import { runCommand, restoreOutput } from './runs.js';
import { attachBranchEditor } from './branchEditor.js';
import { notify } from './notify.js';
import { showActionMenu } from './actionMenu.js';
import { openModifiedFiles } from './modifiedFilesModal.js';
import { icons } from './icons.js';

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

function commandsSignature(commands) {
  return commands.map(c => `${c.name}|${c.command || ''}`).join(';');
}

async function loadPrChip(card, worktreePath) {
  const chip = card.querySelector('[data-pr]');
  if (!chip) return;
  try {
    const pr = await globalThis.api.git.prForBranch(worktreePath);
    if (!card.isConnected) return;
    if (!pr?.number) {
      chip.classList.add('hidden');
      chip.textContent = '';
      return;
    }
    const stateClass = (pr.state || '').toLowerCase();
    chip.classList.remove('hidden');
    chip.dataset.url = pr.url || '';
    chip.dataset.state = stateClass;
    chip.title = pr.title ? `${pr.title} — ${pr.url}` : pr.url || '';
    chip.textContent = `PR #${pr.number}`;
  } catch {
    // gh not installed or non-GitHub remote — silently ignore.
  }
}

// Re-runs PR lookup for every member card currently in the DOM.
// Pair with `globalThis.api.git.clearPrCache()` first to bust the 60s server-side cache.
export async function refreshPrChips() {
  const cards = document.querySelectorAll('#member-list .member-card');
  await Promise.all(Array.from(cards).map(card => loadPrChip(card, card.dataset.worktreePath)));
}

async function loadAndRestoreSavedRun(card, worktreePath) {
  try {
    const saved = await globalThis.api.runs.forWorktree(worktreePath);
    state.savedRuns[worktreePath] = saved || {};
    const entries = Object.entries(state.savedRuns[worktreePath])
      .filter(([, v]) => v?.lines && !v.dismissed)
      .sort(([, a], [, b]) => (b.ranAt || '').localeCompare(a.ranAt || ''));
    if (entries.length > 0) {
      const [cmdName, run] = entries[0];
      restoreOutput(card, cmdName, run);
    }
  } catch { /* ignore */ }
}

function buildCard(m) {
  const repo = state.repos.find(r => r.path === m.repoPath);
  const repoLabel = repo ? repo.name : (m.repoPath.split('/').pop() + ' (unregistered)');
  const commands = repo?.commands?.length ? repo.commands : [{ name: 'test', command: '' }];

  const card = document.createElement('div');
  card.className = 'member-card';
  card.dataset.worktreePath = m.worktreePath;
  card.dataset.repoPath = m.repoPath;
  card.dataset.repoLabel = repoLabel;
  card.dataset.commandsSig = commandsSignature(commands);

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
          <span data-repo-label>${escapeHtml(repoLabel)}</span>
          <span class="member-branch" data-branch>${escapeHtml(m.branch)} <span class="caret">▾</span></span>
          <span class="status-badge" data-status></span>
          <span class="ahead-behind" data-ahead-behind></span>
          <span class="pr-chip hidden" data-pr></span>
        </div>
        <div class="member-path" data-path-display title="${escapeHtml(m.worktreePath)}">${escapeHtml(m.worktreePath)}</div>
      </div>
      <div class="member-actions">
        <span class="member-quick-actions">
          <button class="btn btn-icon" data-action="finder" title="Open in Finder" aria-label="Open in Finder">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            </svg>
          </button>
          <button class="btn btn-icon" data-action="terminal" title="Open in Terminal" aria-label="Open in Terminal">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="4 7 10 12 4 17"/>
              <line x1="12" y1="19" x2="20" y2="19"/>
            </svg>
          </button>
          <button class="btn btn-icon" data-action="editor" title="Open in editor (VS Code/Cursor)" aria-label="Open in editor">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="16 18 22 12 16 6"/>
              <polyline points="8 6 2 12 8 18"/>
            </svg>
          </button>
        </span>
        <span class="command-buttons" data-command-buttons>${cmdSplitsHtml}</span>
        <button class="btn btn-icon" data-action="more" title="More actions" aria-label="More actions">${icons.more()}</button>
      </div>
    </div>
  `;

  card.querySelector('[data-action="finder"]').addEventListener('click', () => {
    globalThis.api.fs.openPath(card.dataset.worktreePath);
  });
  card.querySelector('[data-action="terminal"]').addEventListener('click', async () => {
    try { await globalThis.api.terminal.open(card.dataset.worktreePath); }
    catch (e) { notify.error(e.message); }
  });
  card.querySelector('[data-action="editor"]').addEventListener('click', async () => {
    try { await globalThis.api.editor.open(card.dataset.worktreePath); }
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
        openModifiedFiles(card.dataset.repoLabel, card.dataset.worktreePath);
      }
    });
  }
  attachBranchEditor(card, card.querySelector('[data-branch]'), m.branch);

  const prChip = card.querySelector('[data-pr]');
  if (prChip) {
    prChip.addEventListener('click', () => {
      const url = prChip.dataset.url;
      if (url) globalThis.api.fs.openPath(url);
    });
  }

  loadAndRestoreSavedRun(card, m.worktreePath);
  loadPrChip(card, m.worktreePath);
  return card;
}

function rebuildCommandButtons(card, commands) {
  const wrap = card.querySelector('[data-command-buttons]');
  if (!wrap) return;
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
  wrap.innerHTML = cmdSplitsHtml;
  wrap.querySelectorAll('[data-action="run"]').forEach(btn => bindCommandButton(btn, card));
  wrap.querySelectorAll('[data-action="watch"]').forEach(btn => bindWatchToggle(btn, card));
}

function updateExistingCard(card, m) {
  const repo = state.repos.find(r => r.path === m.repoPath);
  const repoLabel = repo ? repo.name : (m.repoPath.split('/').pop() + ' (unregistered)');
  const commands = repo?.commands?.length ? repo.commands : [{ name: 'test', command: '' }];

  if (card.dataset.repoLabel !== repoLabel) {
    card.dataset.repoLabel = repoLabel;
    const labelEl = card.querySelector('[data-repo-label]');
    if (labelEl) labelEl.textContent = repoLabel;
  }
  if (card.dataset.repoPath !== m.repoPath) {
    card.dataset.repoPath = m.repoPath;
  }
  const pathEl = card.querySelector('[data-path-display]');
  if (pathEl && pathEl.textContent !== m.worktreePath) {
    pathEl.textContent = m.worktreePath;
    pathEl.title = m.worktreePath;
  }
  const branchEl = card.querySelector('[data-branch]');
  if (branchEl?.firstChild && branchEl.firstChild.nodeValue.trim() !== m.branch) {
    branchEl.firstChild.nodeValue = m.branch + ' ';
  }

  // Skip command-button DOM thrash if signature unchanged.
  const sig = commandsSignature(commands);
  if (card.dataset.commandsSig !== sig) {
    card.dataset.commandsSig = sig;
    rebuildCommandButtons(card, commands);
  }
}

export function renderMembers() {
  const container = document.querySelector('#member-list');
  const ws = state.activeWorkspace;
  if (!ws) {
    container.innerHTML = '';
    return;
  }

  const existing = new Map();
  for (const card of container.querySelectorAll('.member-card')) {
    existing.set(card.dataset.worktreePath, card);
  }

  // Remove orphan cards (and their watchers / open menus).
  const desiredPaths = new Set(ws.members.map(m => m.worktreePath));
  for (const [p, card] of existing) {
    if (!desiredPaths.has(p)) {
      card.remove();
      existing.delete(p);
    }
  }

  // Insert / update / reorder. Iterate in desired order; append/move each card to maintain order.
  for (const m of ws.members) {
    let card = existing.get(m.worktreePath);
    if (card) {
      updateExistingCard(card, m);
    } else {
      card = buildCard(m);
      existing.set(m.worktreePath, card);
    }
    // appendChild on an existing child moves it — cheap reorder.
    container.appendChild(card);
  }
}
