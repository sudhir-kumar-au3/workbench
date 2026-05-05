import { state } from './state.js';
import { $, escapeHtml } from './utils.js';
import { renderMain } from './workspaceView.js';
import { refreshSidebarStatuses } from './sidebarStatus.js';

let dragSrcName = null;

function attachDragHandlers(li, name) {
  li.draggable = true;
  li.dataset.name = name;
  li.addEventListener('dragstart', e => {
    dragSrcName = name;
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', name);
  });
  li.addEventListener('dragend', () => {
    li.classList.remove('dragging');
    document.querySelectorAll('#workspace-list li.drag-over')
      .forEach(el => el.classList.remove('drag-over'));
  });
  li.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    li.classList.add('drag-over');
  });
  li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
  li.addEventListener('drop', async e => {
    e.preventDefault();
    li.classList.remove('drag-over');
    if (!dragSrcName || dragSrcName === name) return;
    const order = state.workspaces.map(w => w.name);
    const fromIdx = order.indexOf(dragSrcName);
    const toIdx = order.indexOf(name);
    if (fromIdx < 0 || toIdx < 0) return;
    order.splice(toIdx, 0, ...order.splice(fromIdx, 1));
    state.workspaces = await globalThis.api.workspaces.reorder(order);
    renderSidebar();
  });
}

export function renderSidebar() {
  const list = $('#workspace-list');
  list.innerHTML = '';
  const showArchived = !!state.settings.showArchived;
  const visible = state.workspaces.filter(w => showArchived || !w.archived);
  for (const ws of visible) {
    const li = document.createElement('li');
    const branches = [...new Set(ws.members.map(m => m.branch))];
    const branchSuffix = branches.length === 1
      ? ` <span class="muted">${escapeHtml(branches[0])}</span>`
      : ` <span class="muted">${branches.length} branches</span>`;
    const archivedBadge = ws.archived ? ' <span class="archived-badge">archived</span>' : '';
    li.innerHTML = `
      <span class="ws-dot" aria-hidden="true"></span>
      <span class="ws-label">${escapeHtml(ws.name)}${branchSuffix}${archivedBadge}</span>
    `;
    if (ws.archived) li.classList.add('archived');
    if (state.activeWorkspace?.name === ws.name) li.classList.add('active');
    li.addEventListener('click', () => {
      const previous = state.activeWorkspace;
      if (previous && previous.name !== ws.name) {
        const paths = previous.members.map(m => m.worktreePath);
        globalThis.api.watch.stopForWorktrees(paths).catch(() => {});
        const toRemove = [];
        for (const k of state.watching) {
          if (paths.some(p => k.startsWith(p + '::'))) toRemove.push(k);
        }
        for (const k of toRemove) state.watching.delete(k);
      }
      state.activeWorkspace = ws;
      renderSidebar();
      renderMain();
    });
    attachDragHandlers(li, ws.name);
    list.appendChild(li);
  }
  refreshSidebarStatuses();
}
