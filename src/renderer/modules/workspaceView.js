import { state } from './state.js';
import { $ } from './utils.js';
import { renderMembers } from './memberCard.js';
import { loadAllStatuses } from './statuses.js';

export function renderMain() {
  const empty = $('#empty-state');
  const view = $('#workspace-view');
  if (!state.activeWorkspace) {
    empty.classList.remove('hidden');
    view.classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');
  view.classList.remove('hidden');

  const ws = state.activeWorkspace;
  $('#ws-name').textContent = ws.name;
  $('#ws-meta').textContent = `${ws.members.length} repo${ws.members.length === 1 ? '' : 's'} • ${ws.parentDir}/${ws.name}`;

  const desc = $('#ws-description');
  if (ws.description) {
    desc.textContent = ws.description;
    desc.classList.remove('hidden');
  } else {
    desc.classList.add('hidden');
  }

  const notesWrap = $('#ws-notes-wrap');
  if (ws.notes?.trim()) {
    $('#ws-notes').textContent = ws.notes;
    notesWrap.classList.remove('hidden');
  } else {
    notesWrap.classList.add('hidden');
  }

  // Archive button label reflects current state.
  const archBtn = $('#ws-archive');
  if (archBtn) archBtn.textContent = ws.archived ? 'Restore' : 'Archive';

  // Document title reflects current workspace + state.
  const runningCount = state.runs.size;
  const runningSuffix = runningCount > 0 ? ` • ${runningCount} running` : '';
  document.title = ws ? `${ws.name}${runningSuffix} — Worktree Workbench` : 'Worktree Workbench';

  const linksEl = $('#ws-links');
  linksEl.innerHTML = '';
  for (const link of ws.links || []) {
    if (!link.url) continue;
    const a = document.createElement('a');
    a.href = link.url;
    a.textContent = link.name || link.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.addEventListener('click', e => {
      e.preventDefault();
      globalThis.api.fs.openPath(link.url);
    });
    linksEl.appendChild(a);
  }

  renderMembers();
  loadAllStatuses();
}
