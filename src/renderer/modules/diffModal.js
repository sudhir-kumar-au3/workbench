import { $, escapeHtml } from './utils.js';
import { notify } from './notify.js';

function colorize(diff) {
  // Lightweight unified-diff colorizer.
  return diff.split('\n').map(line => {
    if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) {
      return `<span class="diff-meta">${escapeHtml(line)}</span>`;
    }
    if (line.startsWith('@@')) return `<span class="diff-hunk">${escapeHtml(line)}</span>`;
    if (line.startsWith('+')) return `<span class="diff-add">${escapeHtml(line)}</span>`;
    if (line.startsWith('-')) return `<span class="diff-del">${escapeHtml(line)}</span>`;
    return escapeHtml(line);
  }).join('\n');
}

export async function openDiff(label, worktreePath) {
  $('#diff-title').textContent = label;
  $('#diff-meta').textContent = worktreePath;
  const body = $('#diff-body');
  body.innerHTML = '<span class="muted">Loading…</span>';
  $('#diff-modal').classList.remove('hidden');
  try {
    const diff = await globalThis.api.git.diff(worktreePath, { includeUntracked: true });
    body.innerHTML = diff.trim() ? colorize(diff) : '<span class="muted">Working tree is clean.</span>';
  } catch (e) {
    body.innerHTML = '';
    notify.error(e.message);
    $('#diff-modal').classList.add('hidden');
  }
}

// Show a pre-fetched diff (e.g. for a single commit) without re-running git diff.
export function showRawDiff(label, diffText, worktreePath = '') {
  $('#diff-title').textContent = label;
  $('#diff-meta').textContent = worktreePath;
  const body = $('#diff-body');
  body.innerHTML = diffText.trim() ? colorize(diffText) : '<span class="muted">No changes.</span>';
  $('#diff-modal').classList.remove('hidden');
}

export function setupDiffModal() {
  $('#diff-close').addEventListener('click', () => $('#diff-modal').classList.add('hidden'));
}
