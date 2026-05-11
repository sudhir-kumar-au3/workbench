const path = require('node:path');
const { ipcMain, dialog, shell, Notification } = require('electron');
const git = require('./git');
const workspaces = require('./workspaces');
const { openInEditor } = require('./editor');
const { openInTerminal } = require('./terminal');
const { detectDefaultCommands } = require('./testRunner');
const { Schemas, assertNonEmptyString, assertOneOf } = require('./validate');
const log = require('electron-log/main');

function registerHandlers({ settingsStore, runsStore, commandRunner, watcherRegistry, getWindow }) {
  // Settings
  ipcMain.handle('settings:get', () => {
    const data = settingsStore.read();
    return {
      workspacesRoot: data.workspacesRoot,
      theme: data.theme || 'system',
      sidebarWidth: typeof data.sidebarWidth === 'number' ? data.sidebarWidth : 260,
      compactMode: !!data.compactMode,
      sidebarCollapsed: !!data.sidebarCollapsed,
      accentColor: data.accentColor || 'indigo',
      reducedMotion: !!data.reducedMotion,
      showArchived: !!data.showArchived,
      showResourceStats: data.showResourceStats !== false,
      editorCommand: typeof data.editorCommand === 'string' ? data.editorCommand : '',
      runConcurrency: typeof data.runConcurrency === 'number' && Number.isFinite(data.runConcurrency) ? data.runConcurrency : 4,
    };
  });
  ipcMain.handle('settings:setPref', (_e, key, value) => {
    const allowed = ['compactMode', 'sidebarCollapsed', 'accentColor', 'reducedMotion', 'showArchived', 'showResourceStats', 'editorCommand', 'runConcurrency'];
    if (!allowed.includes(key)) throw new TypeError(`Unknown pref: ${key}`);
    if (key === 'editorCommand' && typeof value !== 'string') throw new TypeError('editorCommand must be a string');
    let v = value;
    if (key === 'runConcurrency') {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new TypeError('runConcurrency must be a number');
      v = Math.max(1, Math.min(32, Math.round(n)));
    }
    const data = settingsStore.read();
    data[key] = v;
    settingsStore.write(data);
    return v;
  });
  ipcMain.handle('settings:setWorkspacesRoot', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled || !result.filePaths[0]) return null;
    const data = settingsStore.read();
    data.workspacesRoot = result.filePaths[0];
    settingsStore.write(data);
    return data.workspacesRoot;
  });
  ipcMain.handle('settings:setSidebarWidth', (_e, width) => {
    if (typeof width !== 'number' || !Number.isFinite(width) || width < 100 || width > 1000) {
      throw new TypeError('width must be a number between 100 and 1000');
    }
    const data = settingsStore.read();
    data.sidebarWidth = Math.round(width);
    settingsStore.write(data);
    return data.sidebarWidth;
  });

  ipcMain.handle('settings:setTheme', (_e, theme) => {
    assertOneOf(theme, ['system', 'light', 'dark'], 'theme');
    const data = settingsStore.read();
    data.theme = theme;
    settingsStore.write(data);
    return data.theme;
  });

  // Repos
  ipcMain.handle('repos:list', () => settingsStore.read().repos);
  ipcMain.handle('repos:add', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) return null;
    const repoPath = result.filePaths[0];
    if (!await git.isGitRepo(repoPath)) {
      throw new Error('Selected directory is not a git repository.');
    }
    const data = settingsStore.read();
    if (!data.repos.some(r => r.path === repoPath)) {
      data.repos.push({
        path: repoPath,
        name: path.basename(repoPath),
        commands: detectDefaultCommands(repoPath),
      });
      settingsStore.write(data);
    }
    return data.repos;
  });
  ipcMain.handle('repos:remove', (_e, repoPath) => {
    assertNonEmptyString(repoPath, 'repoPath');
    const data = settingsStore.read();
    const inUse = data.workspaces.some(w => w.members.some(m => m.repoPath === repoPath));
    if (inUse) throw new Error('Repo is used by one or more workspaces. Delete those workspaces first.');
    data.repos = data.repos.filter(r => r.path !== repoPath);
    settingsStore.write(data);
    return data.repos;
  });
  ipcMain.handle('repos:setCommands', (_e, repoPath, commands) => {
    assertNonEmptyString(repoPath, 'repoPath');
    Schemas.commandsList(commands);
    const data = settingsStore.read();
    const repo = data.repos.find(r => r.path === repoPath);
    if (repo) {
      repo.commands = commands;
      settingsStore.write(data);
    }
    return data.repos;
  });
  ipcMain.handle('repos:branches', (_e, repoPath) => {
    assertNonEmptyString(repoPath, 'repoPath');
    return git.listBranches(repoPath);
  });

  // Workspaces
  ipcMain.handle('workspaces:list', () => settingsStore.read().workspaces);
  ipcMain.handle('workspaces:create', (_e, spec) => {
    Schemas.workspaceCreate(spec);
    return workspaces.createWorkspace(spec, settingsStore);
  });
  ipcMain.handle('workspaces:import', (_e, spec) => {
    Schemas.workspaceImport(spec);
    return workspaces.importWorkspace(spec, settingsStore);
  });
  ipcMain.handle('workspaces:scanForWorktrees', (_e, dir) => {
    assertNonEmptyString(dir, 'dir');
    return git.scanForWorktrees(dir);
  });
  ipcMain.handle('workspaces:delete', (_e, name, force) => {
    assertNonEmptyString(name, 'name');
    return workspaces.deleteWorkspace(name, !!force, settingsStore, runsStore);
  });
  ipcMain.handle('workspaces:updateMetadata', (_e, name, metadata) => {
    assertNonEmptyString(name, 'name');
    Schemas.metadata(metadata);
    return workspaces.updateMetadata(name, metadata, settingsStore);
  });
  ipcMain.handle('workspaces:reorder', (_e, orderedNames) => {
    Schemas.pathArray(orderedNames, 'orderedNames');
    return workspaces.reorder(orderedNames, settingsStore);
  });
  ipcMain.handle('workspaces:setArchived', (_e, name, archived) => {
    assertNonEmptyString(name, 'name');
    return workspaces.setArchived(name, archived, settingsStore);
  });
  ipcMain.handle('workspaces:setNotes', (_e, name, notes) => {
    assertNonEmptyString(name, 'name');
    return workspaces.setNotes(name, notes || '', settingsStore);
  });

  ipcMain.handle('worktrees:setBranch', async (_e, workspaceName, worktreePath, branch, createNew) => {
    assertNonEmptyString(workspaceName, 'workspaceName');
    assertNonEmptyString(worktreePath, 'worktreePath');
    assertNonEmptyString(branch, 'branch');
    const data = settingsStore.read();
    const ws = data.workspaces.find(w => w.name === workspaceName);
    if (!ws) throw new Error(`Workspace not found: ${workspaceName}`);
    const member = ws.members.find(m => m.worktreePath === worktreePath);
    if (!member) throw new Error('Worktree not found in workspace.');
    await git.switchBranch(worktreePath, branch, createNew);
    member.branch = branch;
    settingsStore.write(data);
    return data.workspaces;
  });

  ipcMain.handle('worktrees:statusFiles', (_e, worktreePath) => {
    assertNonEmptyString(worktreePath, 'worktreePath');
    return git.statusFiles(worktreePath);
  });

  // Worktrees
  ipcMain.handle('worktrees:status', (_e, worktreePath) => {
    assertNonEmptyString(worktreePath, 'worktreePath');
    return git.statusFull(worktreePath);
  });

  // Bulk git ops — return per-member result for the caller to render.
  ipcMain.handle('git:bulkOp', async (_e, op, worktreePaths) => {
    Schemas.bulkOp(op);
    Schemas.pathArray(worktreePaths, 'worktreePaths');
    const fn = ({
      fetch: git.fetchAll,
      pull: git.pull,
      push: git.push,
      rebase: git.rebaseOnUpstream,
    })[op];
    log.info(`bulkOp ${op} on ${worktreePaths.length} worktrees`);
    const results = await Promise.all(worktreePaths.map(async (p) => {
      try {
        const out = await fn(p);
        return { worktreePath: p, ok: true, output: out };
      } catch (e) {
        return { worktreePath: p, ok: false, error: e.message };
      }
    }));
    return results;
  });

  ipcMain.handle('git:isMerged', async (_e, worktreePath, target) =>
    git.isMergedInto(worktreePath, target));

  ipcMain.handle('git:diff', (_e, worktreePath, opts) => {
    assertNonEmptyString(worktreePath, 'worktreePath');
    return git.diff(worktreePath, opts || {});
  });
  ipcMain.handle('git:diffFile', (_e, worktreePath, file) => {
    assertNonEmptyString(worktreePath, 'worktreePath');
    assertNonEmptyString(file, 'file');
    return git.diffFile(worktreePath, file);
  });
  ipcMain.handle('git:commitAll', (_e, worktreePath, message) => {
    assertNonEmptyString(worktreePath, 'worktreePath');
    assertNonEmptyString(message, 'message');
    return git.commitAll(worktreePath, message);
  });
  ipcMain.handle('git:commitFiles', (_e, worktreePath, message, paths) => {
    assertNonEmptyString(worktreePath, 'worktreePath');
    assertNonEmptyString(message, 'message');
    if (!Array.isArray(paths)) throw new TypeError('paths must be an array');
    for (const p of paths) assertNonEmptyString(p, 'path');
    return git.commitFiles(worktreePath, message, paths);
  });
  ipcMain.handle('git:discardFile', (_e, worktreePath, file, isUntracked) => {
    assertNonEmptyString(worktreePath, 'worktreePath');
    assertNonEmptyString(file, 'file');
    return git.discardFile(worktreePath, file, !!isUntracked);
  });
  ipcMain.handle('git:log', (_e, worktreePath, limit) => {
    assertNonEmptyString(worktreePath, 'worktreePath');
    return git.log(worktreePath, typeof limit === 'number' ? limit : 50);
  });
  ipcMain.handle('git:diffOfCommit', (_e, worktreePath, hash) => {
    assertNonEmptyString(worktreePath, 'worktreePath');
    assertNonEmptyString(hash, 'hash');
    return git.diffOfCommit(worktreePath, hash);
  });
  ipcMain.handle('git:conflictState', (_e, worktreePath) => {
    assertNonEmptyString(worktreePath, 'worktreePath');
    return git.conflictState(worktreePath);
  });
  ipcMain.handle('git:markResolved', (_e, worktreePath, file) => {
    assertNonEmptyString(worktreePath, 'worktreePath');
    assertNonEmptyString(file, 'file');
    return git.markResolved(worktreePath, file);
  });
  ipcMain.handle('git:continueRebase', (_e, worktreePath) => {
    assertNonEmptyString(worktreePath, 'worktreePath');
    return git.continueRebase(worktreePath);
  });
  ipcMain.handle('git:abortRebase', (_e, worktreePath) => {
    assertNonEmptyString(worktreePath, 'worktreePath');
    return git.abortRebase(worktreePath);
  });
  ipcMain.handle('git:continueMerge', (_e, worktreePath) => {
    assertNonEmptyString(worktreePath, 'worktreePath');
    return git.continueMerge(worktreePath);
  });
  ipcMain.handle('git:abortMerge', (_e, worktreePath) => {
    assertNonEmptyString(worktreePath, 'worktreePath');
    return git.abortMerge(worktreePath);
  });
  ipcMain.handle('git:prForBranch', (_e, worktreePath) => {
    assertNonEmptyString(worktreePath, 'worktreePath');
    return git.prForBranch(worktreePath);
  });
  ipcMain.handle('git:clearPrCache', (_e, worktreePath) => {
    git.clearPrCache(worktreePath || null);
    return true;
  });
  ipcMain.handle('git:stash', (_e, worktreePath, message) => {
    assertNonEmptyString(worktreePath, 'worktreePath');
    return git.stash(worktreePath, message || '');
  });
  ipcMain.handle('git:stashPop', (_e, worktreePath) => {
    assertNonEmptyString(worktreePath, 'worktreePath');
    return git.stashPop(worktreePath);
  });
  ipcMain.handle('git:stashList', (_e, worktreePath) => {
    assertNonEmptyString(worktreePath, 'worktreePath');
    return git.stashList(worktreePath);
  });
  ipcMain.handle('git:fastForward', (_e, worktreePath) => {
    assertNonEmptyString(worktreePath, 'worktreePath');
    return git.fastForward(worktreePath);
  });

  // Filesystem helpers
  ipcMain.handle('fs:openPath', (_e, target) => shell.openPath(target));
  ipcMain.handle('fs:pickDir', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  // Editor / Terminal
  ipcMain.handle('editor:open', (_e, target) => {
    const editorCommand = settingsStore.read().editorCommand || '';
    return openInEditor(target, editorCommand);
  });
  ipcMain.handle('terminal:open', (_e, target) => openInTerminal(target));

  // Runs
  ipcMain.handle('runs:start', (event, runId, worktreePath, commandName, command) =>
    commandRunner.start(runId, worktreePath, commandName, command, event.sender));
  ipcMain.handle('runs:stop', (_e, runId) => { commandRunner.stop(runId); return true; });
  ipcMain.handle('runs:all', () => runsStore.read());
  ipcMain.handle('runs:forWorktree', (_e, worktreePath) => {
    if (typeof worktreePath !== 'string' || !worktreePath) return {};
    return runsStore.forWorktree(worktreePath);
  });
  ipcMain.handle('runs:setDismissed', (_e, worktreePath, commandName, dismissed) => {
    runsStore.setDismissed(worktreePath, commandName, dismissed);
    return true;
  });

  // Watch mode
  ipcMain.handle('watch:start', (event, key, worktreePath) => {
    watcherRegistry.start(key, worktreePath, 500, () => {
      event.sender.send('watch:trigger', key);
    });
    return true;
  });
  ipcMain.handle('watch:stop', (_e, key) => { watcherRegistry.stop(key); return true; });
  ipcMain.handle('watch:stopForWorktrees', (_e, worktreePaths) => {
    watcherRegistry.stopForWorktreePaths(worktreePaths || []);
    return true;
  });

  // Native notifications
  ipcMain.handle('notify', (_e, title, body) => {
    if (Notification.isSupported()) {
      const n = new Notification({ title, body });
      n.on('click', () => getWindow()?.show());
      n.show();
    }
    return true;
  });
}

module.exports = { registerHandlers };
