const { spawn } = require('node:child_process');

function tryMacOpenApp(appName, target) {
  return new Promise((resolve, reject) => {
    const child = spawn('open', ['-a', appName, target], { detached: true, stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(true);
      else reject(new Error(`open -a "${appName}" exited with code ${code}`));
    });
    child.unref();
  });
}

function tryCli(cmd, target) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [target], { detached: true, stdio: 'ignore' });
    child.on('error', reject);
    child.unref();
    // CLI shims return immediately; assume success after a short grace period.
    setTimeout(() => resolve(true), 200);
  });
}

async function openInEditor(target) {
  if (process.platform === 'darwin') {
    // macOS: prefer LaunchServices (`open -a`) — doesn't need `code` in PATH.
    try { return await tryMacOpenApp('Visual Studio Code', target); }
    catch { /* try Cursor next */ }
    try { return await tryMacOpenApp('Cursor', target); }
    catch { /* try `code` CLI */ }
  }
  try { return await tryCli('code', target); }
  catch (err) {
    const hint = err.code === 'ENOENT'
      ? "VS Code/Cursor not found. Install one, or run 'Shell Command: Install code command in PATH' from VS Code's command palette."
      : err.message;
    throw new Error(`Could not launch editor: ${hint}`, { cause: err });
  }
}

module.exports = { openInEditor };
