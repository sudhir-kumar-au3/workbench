import { $, escapeHtml } from './utils.js';
import { notify } from './notify.js';

// Lightweight unified-diff colorizer. Exported so the commit modal can reuse it
// for its inline per-file preview.
export function colorizeDiff(diff) {
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

// Split a multi-file unified diff into { path, text } sections keyed on `diff --git` headers.
function splitDiffByFile(diff) {
  const lines = diff.split('\n');
  const sections = [];
  let current = null;
  for (const line of lines) {
    const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (m) {
      if (current) sections.push(current);
      current = { path: m[2] || m[1], lines: [line] };
    } else if (current) {
      current.lines.push(line);
    } else {
      // Preamble before the first `diff --git` (rare) — attach to a pseudo-section.
      current = { path: '(header)', lines: [line] };
    }
  }
  if (current) sections.push(current);
  return sections;
}

function renderFileList(sections) {
  const list = $('#diff-filelist');
  list.innerHTML = '';
  if (sections.length <= 1) { list.classList.add('hidden'); return; }
  list.classList.remove('hidden');
  sections.forEach((sec, i) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'diff-file-item';
    item.textContent = sec.path;
    item.title = sec.path;
    item.addEventListener('click', () => {
      const anchor = document.getElementById(`diff-sec-${i}`);
      if (anchor) anchor.scrollIntoView({ block: 'start', behavior: 'smooth' });
      list.querySelectorAll('.diff-file-item.active').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
    });
    list.appendChild(item);
  });
}

function renderDiffBody(sections, fallbackText) {
  const body = $('#diff-body');
  if (sections.length === 0) {
    body.innerHTML = fallbackText
      ? colorizeDiff(fallbackText)
      : '<span class="muted">Working tree is clean.</span>';
    return;
  }
  // Each section gets an anchor span so the file list can scroll to it.
  body.innerHTML = sections.map((sec, i) =>
    `<span id="diff-sec-${i}" class="diff-anchor"></span>${colorizeDiff(sec.lines.join('\n'))}`
  ).join('\n');
}

function showDiffText(label, diffText, worktreePath = '') {
  $('#diff-title').textContent = label;
  $('#diff-meta').textContent = worktreePath;
  const text = (diffText || '').trim();
  const sections = text ? splitDiffByFile(text) : [];
  renderFileList(sections);
  renderDiffBody(sections, text);
  $('#diff-modal').classList.remove('hidden');
}

export async function openDiff(label, worktreePath) {
  $('#diff-title').textContent = label;
  $('#diff-meta').textContent = worktreePath;
  $('#diff-filelist').innerHTML = '';
  $('#diff-filelist').classList.add('hidden');
  $('#diff-body').innerHTML = '<span class="muted">Loading…</span>';
  $('#diff-modal').classList.remove('hidden');
  try {
    const diff = await globalThis.api.git.diff(worktreePath, { includeUntracked: true });
    showDiffText(label, diff, worktreePath);
  } catch (e) {
    $('#diff-modal').classList.add('hidden');
    notify.error(e.message);
  }
}

// Show a pre-fetched diff (e.g. for a single commit) without re-running git diff.
export function showRawDiff(label, diffText, worktreePath = '') {
  showDiffText(label, diffText, worktreePath);
}

export function setupDiffModal() {
  $('#diff-close').addEventListener('click', () => $('#diff-modal').classList.add('hidden'));
}
