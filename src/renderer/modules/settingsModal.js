import { state } from './state.js';
import { $ } from './utils.js';
import { applyDisplayPrefs } from './displayMode.js';

function paintSwatches() {
  document.querySelectorAll('#accent-swatches .accent-swatch').forEach(el => {
    el.classList.toggle('active', el.dataset.accent === state.settings.accentColor);
  });
}

export function setupSettingsModal() {
  $('#settings-btn').addEventListener('click', () => {
    $('#settings-root').value = state.settings.workspacesRoot;
    $('#settings-reduced-motion').checked = !!state.settings.reducedMotion;
    paintSwatches();
    $('#settings-modal').classList.remove('hidden');
  });
  $('#settings-close').addEventListener('click', () => $('#settings-modal').classList.add('hidden'));
  $('#settings-pick-root').addEventListener('click', async () => {
    const newRoot = await globalThis.api.settings.setWorkspacesRoot();
    if (newRoot) {
      state.settings.workspacesRoot = newRoot;
      $('#settings-root').value = newRoot;
    }
  });
  $('#settings-reduced-motion').addEventListener('change', async (e) => {
    state.settings.reducedMotion = e.target.checked;
    applyDisplayPrefs();
    await globalThis.api.settings.setPref('reducedMotion', e.target.checked);
  });
  document.querySelectorAll('#accent-swatches .accent-swatch').forEach(el => {
    el.addEventListener('click', async () => {
      state.settings.accentColor = el.dataset.accent;
      applyDisplayPrefs();
      paintSwatches();
      await globalThis.api.settings.setPref('accentColor', el.dataset.accent);
    });
  });
}
