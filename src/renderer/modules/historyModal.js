import { $, escapeHtml } from './utils.js';
import { notify } from './notify.js';
import { showRawDiff } from './diffModal.js';
import { icons } from './icons.js';

let allCommits = [];
let currentLabel = '';

function shortDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return iso; }
}

function renderList(filter = '') {
  const list = $('#history-list');
  list.innerHTML = '';
  const f = filter.trim().toLowerCase();
  const matches = f
    ? allCommits.filter(c =>
        c.message.toLowerCase().includes(f) ||
        c.authorName.toLowerCase().includes(f) ||
        c.hash.toLowerCase().startsWith(f) ||
        c.shortHash.toLowerCase().startsWith(f))
    : allCommits;
  if (!matches.length) {
    list.innerHTML = '<div class="empty-row">No matching commits.</div>';
    return;
  }
  for (const c of matches) {
    const row = document.createElement('div');
    row.className = 'history-row';
    row.innerHTML = `
      <div class="history-row-main">
        <div class="history-row-message">${escapeHtml(c.message)}</div>
        <div class="history-row-meta">
          <span class="history-hash" title="${escapeHtml(c.hash)}">${escapeHtml(c.shortHash)}</span>
          <span class="muted">${escapeHtml(c.authorName)}</span>
          <span class="muted">${escapeHtml(shortDate(c.date))}</span>
        </div>
      </div>
      <button class="btn btn-icon" data-action="copy" title="Copy hash" aria-label="Copy hash">${icons.copy(13)}</button>
    `;
    row.addEventListener('click', async (e) => {
      if (e.target.closest('[data-action="copy"]')) return;
      try {
        const diff = await globalThis.api.git.diffOfCommit(currentWorktreePath, c.hash);
        showRawDiff(`${currentLabel} — ${c.shortHash}: ${c.message.slice(0, 60)}`, diff || '(empty)', currentWorktreePath);
      } catch (err) {
        notify.error(err.message);
      }
    });
    row.querySelector('[data-action="copy"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(c.hash);
        notify.success('Hash copied');
      } catch (err) { notify.error(err.message); }
    });
    list.appendChild(row);
  }
}

let currentWorktreePath = null;

export async function openHistoryModal(label, worktreePath) {
  currentWorktreePath = worktreePath;
  currentLabel = label;
  $('#history-title').textContent = `History — ${label}`;
  $('#history-meta').textContent = worktreePath;
  $('#history-filter').value = '';
  $('#history-list').innerHTML = '<div class="empty-row">Loading…</div>';
  $('#history-modal').classList.remove('hidden');
  try {
    allCommits = await globalThis.api.git.log(worktreePath, 100);
  } catch (e) {
    $('#history-list').innerHTML = `<div class="empty-row error">${escapeHtml(e.message)}</div>`;
    return;
  }
  renderList('');
}

export function setupHistoryModal() {
  $('#history-close').addEventListener('click', () => {
    $('#history-modal').classList.add('hidden');
  });
  $('#history-filter').addEventListener('input', (e) => renderList(e.target.value));
}
