export const $ = (sel) => document.querySelector(sel);

export function escapeHtml(s) {
  return String(s).replaceAll(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
