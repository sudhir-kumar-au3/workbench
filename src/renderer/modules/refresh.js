import { state } from './state.js';
import { renderSidebar } from './sidebar.js';
import { renderMain } from './workspaceView.js';
import { applyTheme } from './theme.js';
import { applySidebarWidth } from './resizer.js';
import { applyDisplayPrefs } from './displayMode.js';
import { refreshArchivedToggleLabel } from './archivedToggle.js';

export async function refresh() {
  state.settings = await globalThis.api.settings.get();
  state.repos = await globalThis.api.repos.list();
  state.workspaces = await globalThis.api.workspaces.list();
  state.savedRuns = await globalThis.api.runs.all();
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
