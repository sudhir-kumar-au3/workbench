const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');

function cleanEnv() {
  // Strip inherited GIT_* env vars so git operates against the target repo's
  // own `.git` rather than whatever ambient git context launched us
  // (e.g. when the app is invoked from a pre-commit hook or a git alias).
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_')) delete env[key];
  }
  return env;
}

function gitExec(cwd, args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, env: cleanEnv(), maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).trim()));
      resolve(stdout);
    });
  });
}

async function isGitRepo(dir) {
  try { await gitExec(dir, ['rev-parse', '--git-dir']); return true; }
  catch { return false; }
}

async function listBranches(repoPath) {
  const out = await gitExec(repoPath, ['branch', '--list', '--all', '--format=%(refname:short)']);
  return out.split('\n').map(s => s.trim()).filter(Boolean);
}

async function statusOf(worktreePath) {
  try {
    const [branchOut, statusOut] = await Promise.all([
      gitExec(worktreePath, ['symbolic-ref', '--short', 'HEAD']).catch(() => ''),
      gitExec(worktreePath, ['status', '--porcelain']),
    ]);
    const lines = statusOut.split('\n').filter(Boolean);
    return {
      branch: branchOut.trim() || null,
      dirty: lines.length > 0,
      fileCount: lines.length,
      error: null,
    };
  } catch (e) {
    return { branch: null, dirty: false, fileCount: 0, error: e.message };
  }
}

async function statusFiles(worktreePath) {
  // Returns the parsed `git status --porcelain` lines as structured entries.
  try {
    const out = await gitExec(worktreePath, ['status', '--porcelain']);
    return out
      .split('\n')
      .filter(Boolean)
      .map(line => {
        // Two-character status code, then space, then path. Renames look like
        // "R  old -> new"; we keep the destination path as the user-facing one.
        const code = line.slice(0, 2);
        let rest = line.slice(3);
        let oldPath = null;
        const arrow = rest.indexOf(' -> ');
        if (arrow !== -1) {
          oldPath = rest.slice(0, arrow);
          rest = rest.slice(arrow + 4);
        }
        const trimmed = code.trim();
        const kind =
          code === '??' ? 'untracked'
          : trimmed.includes('D') ? 'D'
          : trimmed.includes('A') ? 'A'
          : trimmed.includes('R') ? 'R'
          : trimmed.includes('C') ? 'C'
          : trimmed.includes('U') ? 'U'
          : 'M';
        const staged = code[0] !== ' ' && code[0] !== '?';
        return { code, kind, path: rest, oldPath, staged };
      });
  } catch (e) {
    return { error: e.message };
  }
}

async function aheadBehindOf(worktreePath) {
  try {
    const upstream = (await gitExec(worktreePath, ['rev-parse', '--abbrev-ref', '@{upstream}'])).trim();
    if (!upstream) return { hasUpstream: false, ahead: 0, behind: 0, upstream: null, error: null };
    const counts = (await gitExec(worktreePath, ['rev-list', '--left-right', '--count', `${upstream}...HEAD`])).trim();
    const [behindStr, aheadStr] = counts.split(/\s+/);
    return {
      hasUpstream: true,
      upstream,
      ahead: Number.parseInt(aheadStr, 10) || 0,
      behind: Number.parseInt(behindStr, 10) || 0,
      error: null,
    };
  } catch (e) {
    return { hasUpstream: false, ahead: 0, behind: 0, upstream: null, error: e.message };
  }
}

async function branchResolvable(repoPath, branch) {
  // True if `git worktree add <path> <branch>` would succeed in checking it out.
  try {
    await gitExec(repoPath, ['show-ref', '--verify', `refs/heads/${branch}`]);
    return true;
  } catch { /* not local */ }
  try {
    const out = await gitExec(repoPath, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/']);
    return out.split('\n').map(s => s.trim()).filter(Boolean).some(r => r.endsWith(`/${branch}`));
  } catch {
    return false;
  }
}

async function scanForWorktrees(scanDir) {
  let entries;
  try {
    entries = await fs.promises.readdir(scanDir, { withFileTypes: true });
  } catch (e) {
    throw new Error(`Cannot read directory: ${e.message}`, { cause: e });
  }
  const found = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const wtPath = path.join(scanDir, entry.name);
    try {
      const branch = (await gitExec(wtPath, ['symbolic-ref', '--short', 'HEAD'])).trim();
      const commonDir = (await gitExec(wtPath, ['rev-parse', '--git-common-dir'])).trim();
      const absCommon = path.isAbsolute(commonDir) ? commonDir : path.resolve(wtPath, commonDir);
      const repoPath = path.dirname(absCommon);
      found.push({
        worktreePath: wtPath,
        branch,
        repoPath,
        repoName: path.basename(repoPath),
        isMainWorktree: repoPath === wtPath,
      });
    } catch { /* not a git worktree, skip */ }
  }
  return found;
}

async function isMergedInto(worktreePath, targetBranch) {
  try {
    const out = await gitExec(worktreePath, ['branch', '--merged', targetBranch]);
    const head = (await gitExec(worktreePath, ['symbolic-ref', '--short', 'HEAD'])).trim();
    return out.split('\n').map(s => s.replace(/^[*+ ]+/, '').trim()).includes(head);
  } catch {
    return false;
  }
}

async function worktreeAdd(repoPath, targetPath, branch, createNew) {
  const args = ['worktree', 'add'];
  if (createNew) args.push('-b', branch, targetPath);
  else args.push(targetPath, branch);
  await gitExec(repoPath, args);
}

async function worktreeRemove(repoPath, worktreePath, force) {
  const args = ['worktree', 'remove'];
  if (force) args.push('--force');
  args.push(worktreePath);
  await gitExec(repoPath, args);
}

async function fetchAll(worktreePath) {
  return gitExec(worktreePath, ['fetch', '--all', '--prune']);
}

async function pull(worktreePath) {
  return gitExec(worktreePath, ['pull', '--ff-only']);
}

async function push(worktreePath) {
  return gitExec(worktreePath, ['push']);
}

async function diff(worktreePath, options = {}) {
  const args = ['diff'];
  if (options.staged) args.push('--cached');
  if (options.includeUntracked) {
    // Show untracked files via a separate ls-files call appended.
    const tracked = await gitExec(worktreePath, args);
    let untracked = '';
    try {
      const files = (await gitExec(worktreePath, ['ls-files', '--others', '--exclude-standard']))
        .split('\n')
        .filter(Boolean);
      for (const f of files) {
        untracked += `\n--- /dev/null\n+++ b/${f}\n(new file, untracked)\n`;
      }
    } catch { /* ignore */ }
    return tracked + untracked;
  }
  return gitExec(worktreePath, args);
}

async function commitAll(worktreePath, message) {
  if (!message?.trim()) throw new Error('Commit message is required.');
  await gitExec(worktreePath, ['add', '-A']);
  return gitExec(worktreePath, ['commit', '-m', message]);
}

async function stash(worktreePath, message) {
  const args = ['stash', 'push', '--include-untracked'];
  if (message?.trim()) args.push('-m', message.trim());
  return gitExec(worktreePath, args);
}

async function stashPop(worktreePath) {
  return gitExec(worktreePath, ['stash', 'pop']);
}

async function stashList(worktreePath) {
  try {
    const out = await gitExec(worktreePath, ['stash', 'list']);
    return out.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

async function fastForward(worktreePath) {
  return gitExec(worktreePath, ['merge', '--ff-only', '@{upstream}']);
}

async function switchBranch(worktreePath, branch, createNew) {
  const args = ['switch'];
  if (createNew) args.push('-c');
  args.push(branch);
  await gitExec(worktreePath, args);
}

async function rebaseOnUpstream(worktreePath) {
  const upstream = (await gitExec(worktreePath, ['rev-parse', '--abbrev-ref', '@{upstream}'])).trim();
  if (!upstream) throw new Error('No upstream configured for this branch.');
  return gitExec(worktreePath, ['rebase', upstream]);
}

module.exports = {
  gitExec,
  isGitRepo,
  listBranches,
  statusOf,
  statusFiles,
  aheadBehindOf,
  isMergedInto,
  branchResolvable,
  scanForWorktrees,
  worktreeAdd,
  worktreeRemove,
  fetchAll,
  pull,
  push,
  switchBranch,
  rebaseOnUpstream,
  diff,
  commitAll,
  stash,
  stashPop,
  stashList,
  fastForward,
};
