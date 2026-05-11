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
    $('#settings-editor').value = state.settings.editorCommand || '';
    $('#settings-run-concurrency').value = Number(state.settings.runConcurrency) || 4;
    $('#settings-reduced-motion').checked = !!state.settings.reducedMotion;
    $('#settings-resource-stats').checked = state.settings.showResourceStats !== false;
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
  const saveEditor = async () => {
    const value = $('#settings-editor').value.trim();
    state.settings.editorCommand = value;
    await globalThis.api.settings.setPref('editorCommand', value);
  };
  $('#settings-editor').addEventListener('change', saveEditor);
  $('#settings-editor').addEventListener('blur', saveEditor);

  const saveConcurrency = async () => {
    const raw = Number($('#settings-run-concurrency').value);
    const clamped = Math.max(1, Math.min(32, Number.isFinite(raw) ? Math.round(raw) : 4));
    $('#settings-run-concurrency').value = clamped;
    state.settings.runConcurrency = clamped;
    await globalThis.api.settings.setPref('runConcurrency', clamped);
  };
  $('#settings-run-concurrency').addEventListener('change', saveConcurrency);
  $('#settings-run-concurrency').addEventListener('blur', saveConcurrency);
  $('#settings-resource-stats').addEventListener('change', async (e) => {
    state.settings.showResourceStats = e.target.checked;
    document.body.classList.toggle('hide-resource-stats', !e.target.checked);
    await globalThis.api.settings.setPref('showResourceStats', e.target.checked);
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
