export const state = {
  settings: {
    workspacesRoot: '',
    theme: 'system',
    sidebarWidth: 260,
    compactMode: false,
    sidebarCollapsed: false,
    accentColor: 'indigo',
    reducedMotion: false,
    showArchived: false,
    showResourceStats: true,
    editorCommand: '',
    runConcurrency: 4,
  },
  repos: [],
  workspaces: [],
  activeWorkspace: null,
  runs: new Map(),
  savedRuns: {},
  watching: new Set(),
  runPoolActive: false,
};

export function watchKey(worktreePath, commandName) {
  return `${worktreePath}::${commandName}`;
}
