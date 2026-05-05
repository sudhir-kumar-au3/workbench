import { state } from './state.js';
import { $, escapeHtml } from './utils.js';
import { renderSidebar } from './sidebar.js';
import { renderMain } from './workspaceView.js';
import { runCommand } from './runs.js';
import { openKeyboardHelp } from './keyboardHelp.js';
import { toggleSidebarCollapse } from './displayMode.js';

let active = -1;
let entries = [];

function buildEntries() {
  const out = [];
  // Workspaces
  for (const ws of state.workspaces) {
    const branches = [...new Set(ws.members.map(m => m.branch))].slice(0, 3).join(', ');
    out.push({
      group: 'Workspace',
      label: ws.name,
      detail: `${ws.members.length} repo${ws.members.length === 1 ? '' : 's'} • ${branches}`,
      keywords: `workspace ${ws.name} ${branches}`,
      run: () => {
        state.activeWorkspace = ws;
        renderSidebar();
        renderMain();
      },
    });
  }
  // Per-card commands in the active workspace
  if (state.activeWorkspace) {
    for (const m of state.activeWorkspace.members) {
      const repo = state.repos.find(r => r.path === m.repoPath);
      if (!repo) continue;
      for (const c of repo.commands || []) {
        if (!c.name) continue;
        out.push({
          group: 'Run',
          label: `${repo.name}: ${c.name}`,
          detail: c.command || '(unset)',
          keywords: `run ${repo.name} ${c.name} ${c.command}`,
          run: () => {
            const card = document.querySelector(`.member-card[data-worktree-path="${CSS.escape(m.worktreePath)}"]`);
            if (!card) return;
            const btn = card.querySelector(`[data-action="run"][data-command="${CSS.escape(c.name)}"]`);
            if (btn) runCommand(card, c.name, btn);
          },
        });
      }
    }
  }
  // Static actions
  out.push(
    { group: 'Action', label: 'New workspace', detail: 'Cmd+N', keywords: 'new workspace create', run: () => $('#new-workspace').click() },
    { group: 'Action', label: 'Import existing workspace', detail: '', keywords: 'import existing', run: () => $('#import-workspace').click() },
    { group: 'Action', label: 'Manage repos', detail: '', keywords: 'manage repos', run: () => $('#manage-repos').click() },
    { group: 'Action', label: 'Settings', detail: '', keywords: 'settings preferences', run: () => $('#settings-btn').click() },
    { group: 'Action', label: 'Toggle sidebar', detail: 'Cmd+\\', keywords: 'toggle sidebar collapse', run: () => toggleSidebarCollapse() },
    { group: 'Action', label: 'Toggle compact mode', detail: '', keywords: 'compact mode dense', run: () => $('#ws-compact-toggle').click() },
    { group: 'Action', label: 'Keyboard shortcuts', detail: '?', keywords: 'help shortcuts keyboard', run: () => openKeyboardHelp() },
    { group: 'Action', label: 'Toggle theme', detail: '', keywords: 'theme dark light', run: () => $('#theme-toggle').click() },
  );
  if (state.activeWorkspace) {
    out.push(
      { group: 'Workspace action', label: 'Fetch workspace', detail: 'fetch all', keywords: 'fetch git', run: () => $('#ws-fetch').click() },
      { group: 'Workspace action', label: 'Pull workspace', detail: 'ff-only', keywords: 'pull git', run: () => $('#ws-pull').click() },
      { group: 'Workspace action', label: 'Sync workspace', detail: 'fetch + rebase', keywords: 'sync rebase git', run: () => $('#ws-sync').click() },
      { group: 'Workspace action', label: 'Run all', detail: 'parallel', keywords: 'run all parallel', run: () => $('#ws-run-all').click() },
      { group: 'Workspace action', label: 'Run sequentially', detail: 'one by one', keywords: 'run sequentially', run: () => $('#ws-run-all-seq').click() },
    );
  }
  return out;
}

function score(entry, query) {
  const q = query.toLowerCase().trim();
  if (!q) return 1;
  const text = `${entry.label} ${entry.keywords}`.toLowerCase();
  if (text.includes(q)) return 2 + (entry.label.toLowerCase().startsWith(q) ? 1 : 0);
  // subsequence match
  let i = 0;
  for (const ch of q) {
    const idx = text.indexOf(ch, i);
    if (idx === -1) return 0;
    i = idx + 1;
  }
  return 1;
}

function render(query) {
  const list = $('#palette-results');
  const ranked = entries
    .map(e => ({ e, s: score(e, query) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 50)
    .map(x => x.e);
  list.innerHTML = '';
  if (ranked.length === 0) {
    list.innerHTML = '<div class="palette-empty">No matches.</div>';
    return;
  }
  ranked.forEach((e, i) => {
    const row = document.createElement('div');
    row.className = 'palette-row' + (i === active ? ' active' : '');
    row.innerHTML = `
      <span class="palette-group">${escapeHtml(e.group)}</span>
      <span class="palette-label">${escapeHtml(e.label)}</span>
      <span class="palette-detail">${escapeHtml(e.detail || '')}</span>
    `;
    row.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      close();
      e.run();
    });
    row.addEventListener('mouseover', () => {
      active = i;
      render($('#palette-input').value);
    });
    list.appendChild(row);
  });
  // Filtered list overrides global entries while open.
  list.dataset.count = ranked.length;
  list._ranked = ranked;
}

function close() {
  $('#palette-modal').classList.add('hidden');
  $('#palette-input').value = '';
  $('#palette-results').innerHTML = '';
  active = -1;
}

export function openPalette() {
  entries = buildEntries();
  active = 0;
  $('#palette-modal').classList.remove('hidden');
  render('');
  setTimeout(() => $('#palette-input').focus(), 50);
}

export function setupCommandPalette() {
  const input = $('#palette-input');
  input.addEventListener('input', () => { active = 0; render(input.value); });
  input.addEventListener('keydown', (e) => {
    const list = $('#palette-results');
    const ranked = list._ranked || [];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = Math.min(ranked.length - 1, active + 1);
      render(input.value);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(0, active - 1);
      render(input.value);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const entry = ranked[active];
      if (entry) {
        close();
        entry.run();
      }
    } else if (e.key === 'Escape') {
      close();
    }
  });
  $('#palette-modal').addEventListener('click', (e) => {
    if (e.target.id === 'palette-modal') close();
  });
}
