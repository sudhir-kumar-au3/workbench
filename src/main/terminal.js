const { spawn } = require('node:child_process');

function openInTerminal(target) {
  return new Promise((resolve, reject) => {
    let cmd;
    let args;
    if (process.platform === 'darwin') {
      cmd = 'open';
      args = ['-a', 'Terminal', target];
    } else if (process.platform === 'win32') {
      cmd = 'cmd';
      args = ['/c', 'start', 'cmd', '/K', `cd /d "${target}"`];
    } else {
      // Best-effort on Linux: try x-terminal-emulator, then gnome-terminal.
      cmd = 'x-terminal-emulator';
      args = ['--working-directory=' + target];
    }
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.on('error', err => reject(new Error(`Could not launch terminal: ${err.message}`)));
    child.unref();
    setTimeout(() => resolve(true), 200);
  });
}

module.exports = { openInTerminal };
