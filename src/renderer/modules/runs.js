import { state } from './state.js';
import { loadAllStatuses } from './statuses.js';
import { renderAnsiInto } from './ansi.js';

export function appendOutput(bodyEl, stream, text) {
  const span = document.createElement('span');
  span.className = `chunk ${stream}`;
  if (stream === 'meta') span.textContent = text;
  else renderAnsiInto(span, text);
  bodyEl.appendChild(span);
  bodyEl.scrollTop = bodyEl.scrollHeight;
  // If a search filter is active on the parent panel, re-apply it to highlight new content.
  const panel = bodyEl.closest('.test-output');
  const searchInput = panel?.querySelector('[data-search]');
  if (searchInput?.value) applyHighlight(bodyEl, searchInput.value);
}

export function applyHighlight(bodyEl, query) {
  bodyEl.querySelectorAll('mark[data-hl]').forEach(mark => {
    const text = document.createTextNode(mark.textContent);
    mark.replaceWith(text);
  });
  bodyEl.normalize();
  if (!query) return;
  const re = new RegExp(query.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`), 'gi');
  const walker = document.createTreeWalker(bodyEl, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const value = node.nodeValue;
    if (!re.test(value)) continue;
    re.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    let m;
    while ((m = re.exec(value)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(value.slice(last, m.index)));
      const mark = document.createElement('mark');
      mark.dataset.hl = '1';
      mark.textContent = m[0];
      frag.appendChild(mark);
      last = re.lastIndex;
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    if (last < value.length) frag.appendChild(document.createTextNode(value.slice(last)));
    node.replaceWith(frag);
  }
}

export function ensureOutputPanel(card) {
  let panel = card.querySelector('.test-output');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'test-output hidden';
    panel.innerHTML = `
      <div class="test-output-toolbar">
        <button class="btn btn-ghost output-collapse" data-collapse title="Collapse / expand output" aria-label="Collapse output">▾</button>
        <span class="muted" data-cmd-label></span>
        <span class="run-timer muted" data-timer></span>
        <input type="text" placeholder="Filter output…" data-search />
        <button class="btn btn-ghost" data-rerun title="Re-run">↻</button>
        <button class="btn btn-ghost" data-clear title="Clear output">×</button>
      </div>
      <div class="test-output-body" data-output-body></div>
    `;
    card.appendChild(panel);
    panel.querySelector('[data-search]').addEventListener('input', e => {
      applyHighlight(panel.querySelector('[data-output-body]'), e.target.value);
    });
    panel.querySelector('[data-clear]').addEventListener('click', () => {
      panel.querySelector('[data-output-body]').innerHTML = '';
      panel.querySelector('[data-search]').value = '';
    });
    panel.querySelector('[data-rerun]').addEventListener('click', () => {
      const cmdName = panel.dataset.lastCommand;
      if (!cmdName) return;
      const runBtn = card.querySelector(`[data-action="run"][data-command="${CSS.escape(cmdName)}"]`);
      if (runBtn) runBtn.click();
    });
    panel.querySelector('[data-collapse]').addEventListener('click', () => {
      panel.classList.toggle('collapsed');
    });
    // Clicking the command label is a second affordance for collapse/expand.
    panel.querySelector('[data-cmd-label]').addEventListener('click', () => {
      panel.classList.toggle('collapsed');
    });
  }
  return panel;
}

function formatElapsed(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}s`;
}

export function restoreOutput(card, commandName, saved) {
  const panel = ensureOutputPanel(card);
  panel.classList.remove('hidden');
  panel.querySelector('[data-cmd-label]').textContent = `${commandName} • last run`;
  const body = panel.querySelector('[data-output-body]');
  body.innerHTML = '';
  for (const [stream, text] of saved.lines) appendOutput(body, stream, text);
  if (saved.exitCode !== null && saved.exitCode !== undefined) {
    const div = document.createElement('div');
    div.className = saved.exitCode === 0 ? 'exit-success' : 'exit-fail';
    const time = saved.ranAt ? ` (${new Date(saved.ranAt).toLocaleString()})` : '';
    div.textContent = (saved.exitCode === 0 ? '✓ Passed' : `✗ Exited with code ${saved.exitCode}`) + time;
    body.appendChild(div);
  }
}

function findRepoCommand(repoPath, commandName) {
  const repo = state.repos.find(r => r.path === repoPath);
  return repo?.commands?.find(c => c.name === commandName) || null;
}

export function runCommand(card, commandName, cmdBtn) {
  return new Promise(resolve => {
    const worktreePath = card.dataset.worktreePath;
    const repoPath = card.dataset.repoPath;
    const repoCmd = findRepoCommand(repoPath, commandName);
    const command = repoCmd?.command || '';

    const existingRunId = cmdBtn.dataset.runId;
    if (existingRunId && state.runs.has(existingRunId)) {
      globalThis.api.runs.stop(existingRunId);
      state.runs.get(existingRunId).onComplete = resolve;
      return;
    }

    const panel = ensureOutputPanel(card);
    panel.classList.remove('hidden');
    panel.dataset.lastCommand = commandName;
    panel.querySelector('[data-cmd-label]').textContent = `${commandName} • running`;
    const body = panel.querySelector('[data-output-body]');
    body.innerHTML = '';

    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    cmdBtn.dataset.runId = runId;
    cmdBtn.classList.add('running');
    cmdBtn.textContent = `Stop ${commandName}`;

    // Live timer.
    const startedAt = Date.now();
    const timerEl = panel.querySelector('[data-timer]');
    timerEl.textContent = '0s';
    const timerInterval = setInterval(() => {
      timerEl.textContent = formatElapsed(Date.now() - startedAt);
    }, 1000);

    state.runs.set(runId, { outputBody: body, panel, cmdBtn, card, commandName, onComplete: resolve, startedAt, timerInterval, timerEl });

    globalThis.api.runs.start(runId, worktreePath, commandName, command).catch(e => {
      appendOutput(body, 'stderr', `Failed to start: ${e.message}\n`);
      finishRun(runId, 1);
    });
  });
}

export function finishRun(runId, code) {
  const run = state.runs.get(runId);
  if (!run) return;
  const { outputBody, panel, cmdBtn, commandName, startedAt, timerInterval, timerEl } = run;
  if (timerInterval) clearInterval(timerInterval);
  const elapsed = startedAt ? formatElapsed(Date.now() - startedAt) : '';
  if (timerEl && elapsed) timerEl.textContent = elapsed;
  const div = document.createElement('div');
  div.className = code === 0 ? 'exit-success' : 'exit-fail';
  const tail = elapsed ? ` in ${elapsed}` : '';
  div.textContent = code === 0 ? `✓ ${commandName} passed${tail}` : `✗ ${commandName} exited with code ${code}${tail}`;
  outputBody.appendChild(div);
  if (code === 0) cmdBtn.classList.add('flash-pass');
  else cmdBtn.classList.add('flash-fail');
  setTimeout(() => cmdBtn.classList.remove('flash-fail', 'flash-pass'), 800);
  panel.querySelector('[data-cmd-label]').textContent = `${commandName} • last run`;

  cmdBtn.classList.remove('running');
  cmdBtn.textContent = commandName;
  delete cmdBtn.dataset.runId;
  state.runs.delete(runId);
  run.onComplete?.();

  // Notify if window not focused.
  if (!document.hasFocus()) {
    const ws = state.activeWorkspace?.name || '';
    const status = code === 0 ? 'passed' : `failed (${code})`;
    globalThis.api.notify(`${commandName} ${status}`, `${ws} — ${run.card.dataset.worktreePath}`);
  }

  globalThis.api.runs.all().then(r => { state.savedRuns = r; });
  loadAllStatuses();
}

export function attachRunListeners() {
  globalThis.api.runs.onOutput((runId, stream, data) => {
    const run = state.runs.get(runId);
    if (run) appendOutput(run.outputBody, stream, data);
  });
  globalThis.api.runs.onExit((runId, code) => finishRun(runId, code));
}
