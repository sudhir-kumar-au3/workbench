import { state } from './state.js';

const DOT_CLASSES = ['dot-clean', 'dot-dirty', 'dot-error', 'dot-running', 'dot-loading'];

function setDotClass(li, cls) {
  for (const c of DOT_CLASSES) li.classList.remove(c);
  li.classList.add(cls);
}

async function aggregateStatus(workspace) {
  let anyError = false;
  let anyDirty = false;
  await Promise.all(workspace.members.map(async (m) => {
    try {
      const r = await globalThis.api.worktrees.status(m.worktreePath);
      if (r.error) anyError = true;
      else if (r.dirty) anyDirty = true;
    } catch {
      anyError = true;
    }
  }));
  if (anyError) return 'dot-error';
  if (anyDirty) return 'dot-dirty';
  return 'dot-clean';
}

export async function refreshSidebarStatuses() {
  const items = document.querySelectorAll('#workspace-list li');
  for (const li of items) setDotClass(li, 'dot-loading');
  for (const ws of state.workspaces) {
    // Visual indicator if any of this workspace's members are running tests.
    const hasRunning = [...state.runs.values()].some(run => {
      return ws.members.some(m => m.worktreePath === run.card?.dataset.worktreePath);
    });
    const li = document.querySelector(`#workspace-list li[data-name="${CSS.escape(ws.name)}"]`);
    if (!li) continue;
    if (hasRunning) {
      setDotClass(li, 'dot-running');
      continue;
    }
    aggregateStatus(ws).then(cls => {
      const stillThere = document.querySelector(`#workspace-list li[data-name="${CSS.escape(ws.name)}"]`);
      if (stillThere) setDotClass(stillThere, cls);
    });
  }
}
