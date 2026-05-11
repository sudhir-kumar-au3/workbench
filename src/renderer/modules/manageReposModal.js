import { state } from './state.js';
import { $, escapeHtml } from './utils.js';
import { refresh } from './refresh.js';
import { notify } from './notify.js';

function renderCommandRows(repo, container) {
  container.innerHTML = '';
  for (let i = 0; i < repo.commands.length; i++) {
    const c = repo.commands[i];
    const row = document.createElement('div');
    row.className = 'repo-command-row';
    row.innerHTML = `
      <input type="text" class="cmd-name" placeholder="name" value="${escapeHtml(c.name)}" />
      <input type="text" class="cmd-string" placeholder="shell command" value="${escapeHtml(c.command || '')}" />
      <button class="btn btn-danger" data-remove>×</button>
    `;
    row.querySelector('[data-remove]').addEventListener('click', () => {
      repo.commands.splice(i, 1);
      renderCommandRows(repo, container);
    });
    container.appendChild(row);
  }
}

function renderRepoRows() {
  const container = $('#repo-rows');
  container.innerHTML = '';
  if (state.repos.length === 0) {
    container.innerHTML = '<p class="hint">No repos registered yet.</p>';
    return;
  }
  for (const repo of state.repos) {
    // Work on a copy so cancel-by-closing-the-modal doesn't mutate state until "Save".
    const draft = { ...repo, commands: repo.commands.map(c => ({ ...c })) };
    const row = document.createElement('div');
    row.className = 'repo-row';
    row.innerHTML = `
      <div class="repo-row-head">
        <div class="repo-row-info">
          <div class="repo-row-name">${escapeHtml(repo.name)}</div>
          <div class="repo-row-path">${escapeHtml(repo.path)}</div>
        </div>
        <button class="btn" data-action="add-cmd">+ Command</button>
        <button class="btn" data-action="save">Save</button>
        <button class="btn btn-danger" data-action="remove">Remove</button>
      </div>
      <label class="repo-setup-label">Setup command (runs in each new worktree after creation)
        <input type="text" class="repo-setup-cmd" placeholder="e.g. npm install" value="${escapeHtml(repo.setupCommand || '')}" />
      </label>
      <div class="repo-commands"></div>
    `;
    const cmdsContainer = row.querySelector('.repo-commands');
    renderCommandRows(draft, cmdsContainer);

    row.querySelector('[data-action="add-cmd"]').addEventListener('click', () => {
      draft.commands.push({ name: '', command: '' });
      renderCommandRows(draft, cmdsContainer);
    });
    row.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const rows = cmdsContainer.querySelectorAll('.repo-command-row');
      const commands = Array.from(rows)
        .map(r => ({
          name: r.querySelector('.cmd-name').value.trim(),
          command: r.querySelector('.cmd-string').value,
        }))
        .filter(c => c.name);
      state.repos = await globalThis.api.repos.setCommands(repo.path, commands);
      state.repos = await globalThis.api.repos.setSetupCommand(repo.path, row.querySelector('.repo-setup-cmd').value);
      notify.success(`Saved ${repo.name}`);
    });
    row.querySelector('[data-action="remove"]').addEventListener('click', async () => {
      try {
        state.repos = await globalThis.api.repos.remove(repo.path);
        renderRepoRows();
      } catch (e) {
        notify.error(e.message);
      }
    });
    container.appendChild(row);
  }
}

function open() {
  renderRepoRows();
  $('#manage-repos-modal').classList.remove('hidden');
}

export function setupManageReposModal() {
  $('#manage-repos').addEventListener('click', open);
  $('#empty-manage-repos').addEventListener('click', open);
  $('#repo-close').addEventListener('click', async () => {
    $('#manage-repos-modal').classList.add('hidden');
    await refresh();
  });
  $('#repo-add').addEventListener('click', async () => {
    try {
      const repos = await globalThis.api.repos.add();
      if (repos) {
        state.repos = repos;
        renderRepoRows();
      }
    } catch (e) {
      notify.error(e.message);
    }
  });
}
