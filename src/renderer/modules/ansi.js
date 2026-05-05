// Minimal ANSI escape parser — turns colored output into <span> elements.
// Handles SGR codes (\x1b[...m) for foreground colors, bold, italic, underline, dim, reset.

// eslint-disable-next-line no-control-regex -- ANSI escape parser intentionally matches \x1B
const SGR = /\x1B\[([\d;]*)m/g;

function classesFromCodes(codes) {
  const set = new Set();
  for (const c of codes) {
    if (c === 0 || c === '') return null; // reset
    const n = Number(c);
    if (n === 1) set.add('ansi-bold');
    else if (n === 2) set.add('ansi-dim');
    else if (n === 3) set.add('ansi-italic');
    else if (n === 4) set.add('ansi-underline');
    else if ((n >= 30 && n <= 37) || (n >= 90 && n <= 97)) {
      // Remove any prior color before adding new one.
      for (const cls of set) {
        if (/^ansi-\d+$/.test(cls)) set.delete(cls);
      }
      set.add(`ansi-${n}`);
    }
  }
  return set;
}

export function renderAnsiInto(parent, text) {
  let last = 0;
  let active = new Set();
  const flush = (slice) => {
    if (!slice) return;
    if (active.size === 0) {
      parent.appendChild(document.createTextNode(slice));
    } else {
      const span = document.createElement('span');
      span.className = [...active].join(' ');
      span.textContent = slice;
      parent.appendChild(span);
    }
  };
  let m;
  SGR.lastIndex = 0;
  while ((m = SGR.exec(text)) !== null) {
    flush(text.slice(last, m.index));
    const codes = m[1] === '' ? [0] : m[1].split(';');
    const next = classesFromCodes(codes);
    active = next === null ? new Set() : next;
    last = SGR.lastIndex;
  }
  flush(text.slice(last));
}
