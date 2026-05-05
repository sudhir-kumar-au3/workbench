const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    setWorkspacesRoot: () => ipcRenderer.invoke('settings:setWorkspacesRoot'),
    setTheme: (t) => ipcRenderer.invoke('settings:setTheme', t),
    setSidebarWidth: (w) => ipcRenderer.invoke('settings:setSidebarWidth', w),
    setPref: (key, value) => ipcRenderer.invoke('settings:setPref', key, value),
  },
  repos: {
    list: () => ipcRenderer.invoke('repos:list'),
    add: () => ipcRenderer.invoke('repos:add'),
    remove: (path) => ipcRenderer.invoke('repos:remove', path),
    setCommands: (path, commands) => ipcRenderer.invoke('repos:setCommands', path, commands),
    branches: (path) => ipcRenderer.invoke('repos:branches', path),
  },
  workspaces: {
    list: () => ipcRenderer.invoke('workspaces:list'),
    create: (spec) => ipcRenderer.invoke('workspaces:create', spec),
    import: (spec) => ipcRenderer.invoke('workspaces:import', spec),
    scanForWorktrees: (dir) => ipcRenderer.invoke('workspaces:scanForWorktrees', dir),
    delete: (name, force) => ipcRenderer.invoke('workspaces:delete', name, force),
    updateMetadata: (name, metadata) => ipcRenderer.invoke('workspaces:updateMetadata', name, metadata),
    reorder: (orderedNames) => ipcRenderer.invoke('workspaces:reorder', orderedNames),
    setArchived: (name, archived) => ipcRenderer.invoke('workspaces:setArchived', name, archived),
    setNotes: (name, notes) => ipcRenderer.invoke('workspaces:setNotes', name, notes),
  },
  worktrees: {
    status: (path) => ipcRenderer.invoke('worktrees:status', path),
    setBranch: (workspaceName, worktreePath, branch, createNew) =>
      ipcRenderer.invoke('worktrees:setBranch', workspaceName, worktreePath, branch, createNew),
  },
  git: {
    bulkOp: (op, worktreePaths) => ipcRenderer.invoke('git:bulkOp', op, worktreePaths),
    isMerged: (path, target) => ipcRenderer.invoke('git:isMerged', path, target),
    diff: (path, opts) => ipcRenderer.invoke('git:diff', path, opts),
    commitAll: (path, message) => ipcRenderer.invoke('git:commitAll', path, message),
    stash: (path, message) => ipcRenderer.invoke('git:stash', path, message),
    stashPop: (path) => ipcRenderer.invoke('git:stashPop', path),
    stashList: (path) => ipcRenderer.invoke('git:stashList', path),
    fastForward: (path) => ipcRenderer.invoke('git:fastForward', path),
  },
  fs: {
    openPath: (p) => ipcRenderer.invoke('fs:openPath', p),
    pickDir: () => ipcRenderer.invoke('fs:pickDir'),
  },
  editor: {
    open: (p) => ipcRenderer.invoke('editor:open', p),
  },
  terminal: {
    open: (p) => ipcRenderer.invoke('terminal:open', p),
  },
  runs: {
    start: (runId, worktreePath, commandName, command) =>
      ipcRenderer.invoke('runs:start', runId, worktreePath, commandName, command),
    stop: (runId) => ipcRenderer.invoke('runs:stop', runId),
    all: () => ipcRenderer.invoke('runs:all'),
    onOutput: (cb) => ipcRenderer.on('runs:output', (_e, runId, stream, data) => cb(runId, stream, data)),
    onExit: (cb) => ipcRenderer.on('runs:exit', (_e, runId, code) => cb(runId, code)),
  },
  watch: {
    start: (key, worktreePath) => ipcRenderer.invoke('watch:start', key, worktreePath),
    stop: (key) => ipcRenderer.invoke('watch:stop', key),
    stopForWorktrees: (paths) => ipcRenderer.invoke('watch:stopForWorktrees', paths),
    onTrigger: (cb) => ipcRenderer.on('watch:trigger', (_e, key) => cb(key)),
  },
  notify: (title, body) => ipcRenderer.invoke('notify', title, body),
  onAppFocus: (cb) => ipcRenderer.on('app:focus', () => cb()),
});
