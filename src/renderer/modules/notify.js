// Lightweight in-app notifications. Replaces alert() with non-blocking toasts.
// confirm() stays as the browser builtin since it's blocking and rarely fired.

let container = null;

function ensureContainer() {
  if (container) return container;
  container = document.createElement('div');
  container.className = 'notify-stack';
  document.body.appendChild(container);
  return container;
}

function show(level, message, opts = {}) {
  const root = ensureContainer();
  const el = document.createElement('div');
  el.className = `notify notify-${level}`;
  el.textContent = message;
  const close = document.createElement('button');
  close.className = 'notify-close';
  close.textContent = '×';
  close.addEventListener('click', () => el.remove());
  el.appendChild(close);
  root.appendChild(el);
  const timeout = opts.timeout ?? (level === 'error' ? 8000 : 3500);
  if (timeout > 0) setTimeout(() => el.remove(), timeout);
}

export const notify = {
  info: (msg, opts) => show('info', msg, opts),
  success: (msg, opts) => show('success', msg, opts),
  error: (msg, opts) => show('error', msg, opts),
};
