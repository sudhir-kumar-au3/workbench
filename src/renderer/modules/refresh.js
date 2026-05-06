import { state } from './state.js';
import { renderSidebar } from './sidebar.js';
import { renderMain } from './workspaceView.js';
import { applyTheme } from './theme.js';
import { applySidebarWidth } from './resizer.js';
import { applyDisplayPrefs } from './displayMode.js';
import { refreshArchivedToggleLabel } from './archivedToggle.js';

export async function refresh() {
  const [settings, repos, workspaces] = await Promise.all([
    globalThis.api.settings.get(),
    globalThis.api.repos.list(),
    globalThis.api.workspaces.list(),
  ]);
  state.settings = settings;
  state.repos = repos;
  state.workspaces = workspaces;
  // Saved runs are loaded lazily per-card via runs.forWorktree(p) on render.
  // We keep the cache; entries get refreshed/replaced by the cards themselves.
  if (state.activeWorkspace) {
    state.activeWorkspace = state.workspaces.find(w => w.name === state.activeWorkspace.name) || null;
  }
  applyTheme();
  applySidebarWidth();
  applyDisplayPrefs();
  refreshArchivedToggleLabel();
  renderSidebar();
  renderMain();
}
