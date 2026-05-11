import { state } from './state.js';
import { loadAllStatuses } from './statuses.js';
import { renderAnsiInto } from './ansi.js';
import { icons } from './icons.js';

const NEAR_BOTTOM_PX = 32; // tolerance for "is the user scrolled to the bottom?"

function isNearBottom(el) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
}

function setFollowTail(panel, follow) {
  panel.classList.toggle('detached', !follow);
}

export function appendOutput(bodyEl, stream, text) {
  const wasAtBottom = isNearBottom(bodyEl);
  const span = document.createElement('span');
  span.className = `chunk ${stream}`;
  if (stream === 'meta') span.textContent = text;
  else renderAnsiInto(span, text);
  bodyEl.appendChild(span);
  // Only stick to the tail if the user was already there — don't yank them down
  // mid-read. The "detached" class drives the jump-to-bottom pill.
  if (wasAtBottom) {
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }
  const panel = bodyEl.closest('.test-output');
  if (panel) setFollowTail(panel, wasAtBottom || isNearBottom(bodyEl));
  // If a search filter is active on the parent panel, re-apply it to highlight new content.
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

function findActiveRunIdForPanel(panel) {
  for (const [id, r] of state.runs) if (r.panel === panel) return id;
  return null;
}

function dismissPanel(card, panel) {
  const cmdName = panel.dataset.lastCommand;
  const worktreePath = card.dataset.worktreePath;
  if (cmdName && worktreePath) {
    globalThis.api.runs.setDismissed(worktreePath, cmdName, true).catch(() => {});
    if (state.savedRuns[worktreePath]?.[cmdName]) {
      state.savedRuns[worktreePath][cmdName].dismissed = true;
    }
  }
  panel.remove();
}

const STOP_ICON_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>';
const CLOSE_ICON_HTML = '×';

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
        <span class="run-stats muted hidden" data-stats title="CPU cores in use · resident memory"></span>
        <input type="text" placeholder="Filter output…" data-search />
        <button class="btn btn-icon" data-rerun title="Re-run">${icons.refresh(13)}</button>
        <button class="btn btn-ghost" data-close title="Close output panel" aria-label="Close output panel">${CLOSE_ICON_HTML}</button>
      </div>
      <div class="test-output-body" data-output-body></div>
      <button class="test-output-jump" data-jump-bottom title="Jump to latest output">↓ latest</button>
    `;
    card.appendChild(panel);
    const body = panel.querySelector('[data-output-body]');
    // Track follow-tail state from the user's own scrolling.
    body.addEventListener('scroll', () => {
      setFollowTail(panel, isNearBottom(body));
    });
    panel.querySelector('[data-jump-bottom]').addEventListener('click', () => {
      body.scrollTop = body.scrollHeight;
      setFollowTail(panel, true);
    });
    panel.querySelector('[data-search]').addEventListener('input', e => {
      applyHighlight(panel.querySelector('[data-output-body]'), e.target.value);
    });
    panel.querySelector('[data-close]').addEventListener('click', () => {
      const activeRunId = findActiveRunIdForPanel(panel);
      if (activeRunId) {
        const run = state.runs.get(activeRunId);
        if (run) run.dismissOnExit = true;
        globalThis.api.runs.stop(activeRunId);
      }
      dismissPanel(card, panel);
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
    panel.querySelector('[data-cmd-label]').addEventListener('click', () => {
      panel.classList.toggle('collapsed');
    });
  }
  return panel;
}

function formatRss(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

export function renderRunStats(panel, stats) {
  const el = panel.querySelector('[data-stats]');
  if (!el) return;
  if (state.settings?.showResourceStats === false) {
    el.classList.add('hidden');
    return;
  }
  if (!stats) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }
  if (stats.warming) {
    el.classList.remove('hidden');
    el.textContent = '… measuring';
    return;
  }
  const cores = Number.isFinite(stats.cores) ? stats.cores : 0;
  const coresStr = cores >= 10 ? cores.toFixed(0) : cores.toFixed(1);
  const rss = formatRss(stats.rss);
  el.classList.remove('hidden');
  el.textContent = rss ? `${coresStr} cores · ${rss}` : `${coresStr} cores`;
}

function setCloseButtonRunning(panel, running) {
  const btn = panel.querySelector('[data-close]');
  if (!btn) return;
  if (running) {
    btn.innerHTML = STOP_ICON_SVG;
    btn.classList.add('is-stop');
    btn.title = 'Stop run and close';
    btn.setAttribute('aria-label', 'Stop run and close');
  } else {
    btn.innerHTML = CLOSE_ICON_HTML;
    btn.classList.remove('is-stop');
    btn.title = 'Close output panel';
    btn.setAttribute('aria-label', 'Close output panel');
  }
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
  panel.dataset.lastCommand = commandName;
  const passed = saved.exitCode === 0;
  const summary = passed
    ? `✓ ${commandName} • last run`
    : (saved.exitCode == null
        ? `${commandName} • last run`
        : `✗ ${commandName} • code ${saved.exitCode}`);
  panel.querySelector('[data-cmd-label]').textContent = summary;
  setCloseButtonRunning(panel, false);
  const body = panel.querySelector('[data-output-body]');
  body.innerHTML = '';
  for (const [stream, text] of saved.lines) appendOutput(body, stream, text);
  if (saved.exitCode !== null && saved.exitCode !== undefined) {
    const div = document.createElement('div');
    div.className = passed ? 'exit-success' : 'exit-fail';
    const time = saved.ranAt ? ` (${new Date(saved.ranAt).toLocaleString()})` : '';
    div.textContent = (passed ? '✓ Passed' : `✗ Exited with code ${saved.exitCode}`) + time;
    body.appendChild(div);
  }
  // Restored passing runs come back collapsed (just the chip-style toolbar).
  if (passed) panel.classList.add('collapsed');
  else panel.classList.remove('collapsed');
}

function findRepoCommand(repoPath, commandName) {
  const repo = state.repos.find(r => r.path === repoPath);
  return repo?.commands?.find(c => c.name === commandName) || null;
}

// Core run launcher. `cmdBtn` is optional — pass it for command-button runs (so the
// button toggles run/stop and flashes pass/fail); omit it for button-less runs such as
// the post-create setup command, which still get a full output panel.
export function startRun(card, { commandName, command, cmdBtn = null }) {
  return new Promise(resolve => {
    const worktreePath = card.dataset.worktreePath;

    if (cmdBtn) {
      const existingRunId = cmdBtn.dataset.runId;
      if (existingRunId && state.runs.has(existingRunId)) {
        globalThis.api.runs.stop(existingRunId);
        state.runs.get(existingRunId).onComplete = resolve;
        return;
      }
    }

    const panel = ensureOutputPanel(card);
    panel.classList.remove('hidden', 'collapsed', 'detached');
    panel.dataset.lastCommand = commandName;
    panel.querySelector('[data-cmd-label]').textContent = `${commandName} • running`;
    setCloseButtonRunning(panel, true);
    renderRunStats(panel, { warming: true });
    const body = panel.querySelector('[data-output-body]');
    body.innerHTML = '';

    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (cmdBtn) {
      cmdBtn.dataset.runId = runId;
      cmdBtn.classList.add('running');
      cmdBtn.textContent = `Stop ${commandName}`;
    }

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

export function runCommand(card, commandName, cmdBtn) {
  const repoCmd = findRepoCommand(card.dataset.repoPath, commandName);
  return startRun(card, { commandName, command: repoCmd?.command || '', cmdBtn });
}

export function finishRun(runId, code) {
  const run = state.runs.get(runId);
  if (!run) return;
  const { outputBody, panel, cmdBtn, commandName, startedAt, timerInterval, timerEl, dismissOnExit, card } = run;
  if (timerInterval) clearInterval(timerInterval);
  const elapsed = startedAt ? formatElapsed(Date.now() - startedAt) : '';
  if (timerEl && elapsed) timerEl.textContent = elapsed;
  const div = document.createElement('div');
  div.className = code === 0 ? 'exit-success' : 'exit-fail';
  const tail = elapsed ? ` in ${elapsed}` : '';
  div.textContent = code === 0 ? `✓ ${commandName} passed${tail}` : `✗ ${commandName} exited with code ${code}${tail}`;
  outputBody.appendChild(div);
  if (cmdBtn) {
    cmdBtn.classList.add(code === 0 ? 'flash-pass' : 'flash-fail');
    setTimeout(() => cmdBtn.classList.remove('flash-fail', 'flash-pass'), 800);
  }
  const elapsedSuffix = elapsed ? ` • ${elapsed}` : '';
  const summary = code === 0
    ? `✓ ${commandName} • ${elapsed || 'done'}`
    : `✗ ${commandName} • code ${code}${elapsedSuffix}`;
  panel.querySelector('[data-cmd-label]').textContent = summary;
  setCloseButtonRunning(panel, false);
  renderRunStats(panel, null);

  if (cmdBtn) {
    cmdBtn.classList.remove('running');
    cmdBtn.textContent = commandName;
    delete cmdBtn.dataset.runId;
  }
  state.runs.delete(runId);
  run.onComplete?.();

  // Notify if window not focused.
  if (!document.hasFocus()) {
    const ws = state.activeWorkspace?.name || '';
    const status = code === 0 ? 'passed' : `failed (${code})`;
    globalThis.api.notify(`${commandName} ${status}`, `${ws} — ${run.card.dataset.worktreePath}`);
  }

  if (dismissOnExit) {
    dismissPanel(card, panel);
  } else if (code === 0) {
    const delay = state.settings?.reducedMotion ? 0 : 1500;
    setTimeout(() => {
      if (!card.contains(panel)) return;
      if (findActiveRunIdForPanel(panel)) return;
      panel.classList.add('collapsed');
    }, delay);
  }

  // Refresh only this worktree's saved runs, not the entire store.
  const wp = run.card?.dataset.worktreePath;
  if (wp) {
    globalThis.api.runs.forWorktree(wp).then(r => { state.savedRuns[wp] = r || {}; });
  }
  loadAllStatuses();
}

export function attachRunListeners() {
  globalThis.api.runs.onOutput((runId, stream, data) => {
    const run = state.runs.get(runId);
    if (run) appendOutput(run.outputBody, stream, data);
  });
  globalThis.api.runs.onExit((runId, code) => finishRun(runId, code));
  globalThis.api.runs.onStats?.((runId, stats) => {
    const run = state.runs.get(runId);
    if (run?.panel) renderRunStats(run.panel, stats);
  });
}
