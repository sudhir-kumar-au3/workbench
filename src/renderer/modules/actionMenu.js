import { state } from './state.js';
import { notify } from './notify.js';
import { openDiff } from './diffModal.js';
import { openCommitModal } from './commitModal.js';
import { loadStatusFor } from './statuses.js';
import { restoreOutput } from './runs.js';
import { openGitFailure } from './gitFailureModal.js';

let openMenu = null;

function close() {
  if (openMenu) { openMenu.remove(); openMenu = null; }
  document.removeEventListener('click', onDocClick, true);
  document.removeEventListener('keydown', onKey, true);
}

function onDocClick(e) {
  if (openMenu && !openMenu.contains(e.target)) close();
}
function onKey(e) {
  if (e.key === 'Escape') close();
}

async function copy(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    notify.success(`Copied ${label}`);
  } catch (e) {
    notify.error(`Could not copy: ${e.message}`);
  }
}

function buildItems(card) {
  const worktreePath = card.dataset.worktreePath;
  const branchEl = card.querySelector('[data-branch]');
  const branch = branchEl ? branchEl.firstChild.nodeValue.trim() : '';
  const repoLabel = card.querySelector('.member-name')?.firstChild?.textContent?.trim() || 'repo';

  const savedForWorktree = state.savedRuns[worktreePath];
  const lastRun = savedForWorktree
    ? Object.entries(savedForWorktree)
        .filter(([, v]) => v?.lines)
        .sort(([, a], [, b]) => (b.ranAt || '').localeCompare(a.ranAt || ''))[0]
    : null;

  const items = [
    { label: 'Open diff', run: () => openDiff(`${repoLabel} — diff`, worktreePath) },
    { label: 'Commit + push…', run: () => openCommitModal(repoLabel, worktreePath) },
    { sep: true },
  ];

  if (lastRun) {
    const [lastCmd, lastEntry] = lastRun;
    items.push({
      label: `Show last output (${lastCmd})`,
      run: async () => {
        if (lastEntry.dismissed) {
          await globalThis.api.runs.setDismissed(worktreePath, lastCmd, false);
          lastEntry.dismissed = false;
        }
        restoreOutput(card, lastCmd, lastEntry);
        const panel = card.querySelector('.test-output');
        panel?.classList.remove('collapsed');
      },
    });
    items.push({ sep: true });
  }

  items.push(
    {
      label: 'Fast-forward (pull --ff-only)',
      run: async () => {
        const doFf = () => globalThis.api.git.fastForward(worktreePath);
        try {
          await doFf();
          notify.success('Fast-forwarded.');
          loadStatusFor(worktreePath);
        } catch (e) {
          openGitFailure({
            op: 'fast-forward',
            worktreePath,
            label: repoLabel,
            error: e.message,
            retry: doFf,
          });
        }
      },
    },
    {
      label: 'Stash changes',
      run: async () => {
        try { await globalThis.api.git.stash(worktreePath, ''); notify.success('Stashed.'); loadStatusFor(worktreePath); }
        catch (e) { notify.error(e.message); }
      },
    },
    {
      label: 'Pop latest stash',
      run: async () => {
        try { await globalThis.api.git.stashPop(worktreePath); notify.success('Stash popped.'); loadStatusFor(worktreePath); }
        catch (e) { notify.error(e.message); }
      },
    },
    { sep: true },
    { label: 'Copy worktree path', run: () => copy(worktreePath, 'path') },
    { label: 'Copy branch name', run: () => copy(branch, 'branch') },
  );
  return items;
}

export function showActionMenu(triggerBtn, card) {
  if (openMenu) close();
  const items = buildItems(card);
  const menu = document.createElement('div');
  menu.className = 'action-menu';
  for (const item of items) {
    if (item.sep) {
      const sep = document.createElement('div');
      sep.className = 'action-menu-sep';
      menu.appendChild(sep);
      continue;
    }
    const btn = document.createElement('button');
    btn.className = 'action-menu-item';
    btn.textContent = item.label;
    btn.addEventListener('click', () => {
      close();
      item.run();
    });
    menu.appendChild(btn);
  }
  document.body.appendChild(menu);

  const rect = triggerBtn.getBoundingClientRect();
  const w = menu.offsetWidth || 220;
  let left = rect.right - w;
  if (left < 8) left = 8;
  let top = rect.bottom + 6;
  if (top + menu.offsetHeight > window.innerHeight - 8) {
    top = rect.top - menu.offsetHeight - 6;
  }
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  openMenu = menu;
  // Defer the click listener so the click that opened the menu doesn't immediately close it.
  setTimeout(() => {
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKey, true);
  }, 0);
}
