import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

export function tmpDir(label = 'wbtest') {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`));
}

function cleanEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_')) delete env[key];
  }
  return env;
}

export function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: cleanEnv() });
}

export function initRepo(label = 'repo') {
  const dir = tmpDir(label);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, 'README.md'), '# test\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'initial');
  // Sanity-check that the repo is fully on disk before any caller proceeds.
  // Guards against APFS metadata races when tests run in parallel.
  git(dir, 'rev-parse', '--git-dir');
  return dir;
}

export function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}
