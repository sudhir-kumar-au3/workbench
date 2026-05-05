import { $ } from './utils.js';

export function openKeyboardHelp() {
  $('#help-modal').classList.remove('hidden');
}

export function setupKeyboardHelp() {
  $('#kbd-help').addEventListener('click', openKeyboardHelp);
  $('#help-close').addEventListener('click', () => $('#help-modal').classList.add('hidden'));
}
