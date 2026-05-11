const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Known editor .app bundle names — scanned in /Applications and ~/Applications.
// Launching by full path is far more reliable than `open -a <bare name>`, which
// depends on LaunchServices/Spotlight resolving the name.
const KNOWN_MAC_APPS = [
  'Visual Studio Code.app',
  'Visual Studio Code - Insiders.app',
  'VSCodium.app',
  'Cursor.app',
  'Windsurf.app',
  'Zed.app',
  'Sublime Text.app',
  'WebStorm.app',
  'IntelliJ IDEA.app',
  'IntelliJ IDEA CE.app',
  'PyCharm.app',
  'PyCharm CE.app',
  'PhpStorm.app',
  'GoLand.app',
  'RubyMine.app',
  'Nova.app',
  'BBEdit.app',
  'Fleet.app',
];

// Bare app names (fallback: relies on LaunchServices resolving them).
const MAC_APP_NAMES = [
  'Visual Studio Code', 'Visual Studio Code - Insiders', 'VSCodium', 'Cursor',
  'Windsurf', 'Zed', 'Sublime Text', 'WebStorm', 'IntelliJ IDEA', 'PyCharm',
  'PhpStorm', 'GoLand', 'RubyMine',
];

// CLI commands to try (cross-platform fallback).
const CLI_CANDIDATES = ['code', 'cursor', 'windsurf', 'codium', 'zed', 'subl', 'webstorm', 'idea'];

function findInstalledMacApps() {
  const dirs = ['/Applications', path.join(os.homedir(), 'Applications')];
  const found = [];
  for (const dir of dirs) {
    for (const name of KNOWN_MAC_APPS) {
      const full = path.join(dir, name);
      try { if (fs.existsSync(full)) found.push(full); } catch { /* ignore */ }
    }
  }
  return found;
}

function tryMacOpenApp(appNameOrPath, target) {
  return new Promise((resolve, reject) => {
    const child = spawn('open', ['-a', appNameOrPath, target], { detached: true, stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(true);
      else reject(new Error(`open -a "${appNameOrPath}" exited with code ${code}`));
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

async function tryFirst(fns) {
  let lastErr = null;
  for (const fn of fns) {
    try { return await fn(); }
    catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('No editor candidates to try.');
}

// `editorCommand` (optional): user-configured editor. On macOS this is treated as both
// an app-bundle name and a CLI command. On other platforms it's a CLI command.
async function openInEditor(target, editorCommand = '') {
  const configured = (editorCommand || '').trim();
  const macApp = (nameOrPath) => () => tryMacOpenApp(nameOrPath, target);
  const cli = (cmd) => () => tryCli(cmd, target);

  let attempts;
  if (process.platform === 'darwin') {
    attempts = [
      ...(configured ? [macApp(configured), cli(configured)] : []),
      ...findInstalledMacApps().map(macApp), // full-path launches — most reliable
      ...MAC_APP_NAMES.map(macApp),          // bare-name fallback
      ...CLI_CANDIDATES.map(cli),
    ];
  } else {
    attempts = [
      ...(configured ? [cli(configured)] : []),
      ...CLI_CANDIDATES.map(cli),
    ];
  }

  try {
    return await tryFirst(attempts);
  } catch (err) {
    const tried = configured ? `"${configured}" and the common editors` : 'the common editors';
    throw new Error(
      `Could not launch an editor (tried ${tried}). ` +
      'Set "Preferred editor" in Settings to your editor\'s app name (macOS) or CLI command.',
      { cause: err },
    );
  }
}

module.exports = { openInEditor };
