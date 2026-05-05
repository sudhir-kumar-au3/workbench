import { state } from './state.js';
import { $, escapeHtml } from './utils.js';
import { renderMain } from './workspaceView.js';

function renderLinks(links) {
  const container = $('#meta-links');
  container.innerHTML = '';
  links.forEach((link, idx) => {
    const row = document.createElement('div');
    row.className = 'meta-link-row';
    row.innerHTML = `
      <input type="text" class="link-name" placeholder="Label (e.g. PR)" value="${escapeHtml(link.name || '')}" />
      <input type="url" class="link-url" placeholder="https://…" value="${escapeHtml(link.url || '')}" />
      <button class="btn btn-danger" data-remove>Remove</button>
    `;
    row.querySelector('[data-remove]').addEventListener('click', () => {
      links.splice(idx, 1);
      renderLinks(links);
    });
    container.appendChild(row);
  });
}

export function openMetadataModal() {
  const ws = state.activeWorkspace;
  if (!ws) return;
  $('#meta-description').value = ws.description || '';
  $('#meta-notes').value = ws.notes || '';
  const linksDraft = (ws.links || []).map(l => ({ ...l }));
  renderLinks(linksDraft);
  $('#meta-modal').dataset.linksDraft = JSON.stringify(linksDraft);
  // Re-bind add-link to the live draft.
  const addBtn = $('#meta-add-link');
  addBtn.onclick = () => {
    linksDraft.push({ name: '', url: '' });
    renderLinks(linksDraft);
    $('#meta-modal').dataset.linksDraft = JSON.stringify(linksDraft);
  };
  // Save button captures latest values from inputs.
  $('#meta-save').onclick = async () => {
    const rows = Array.from(document.querySelectorAll('#meta-links .meta-link-row'));
    const links = rows
      .map(r => ({
        name: r.querySelector('.link-name').value.trim(),
        url: r.querySelector('.link-url').value.trim(),
      }))
      .filter(l => l.url);
    const description = $('#meta-description').value;
    const notes = $('#meta-notes').value;
    state.workspaces = await globalThis.api.workspaces.updateMetadata(ws.name, { description, links });
    state.workspaces = await globalThis.api.workspaces.setNotes(ws.name, notes);
    state.activeWorkspace = state.workspaces.find(w => w.name === ws.name) || null;
    $('#meta-modal').classList.add('hidden');
    renderMain();
  };
  $('#meta-modal').classList.remove('hidden');
}

export function setupMetadataModal() {
  $('#meta-cancel').addEventListener('click', () => {
    $('#meta-modal').classList.add('hidden');
  });
}
