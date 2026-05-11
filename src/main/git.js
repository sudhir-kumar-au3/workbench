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

// Branch + ahead/behind + dirty/file-count in a SINGLE git invocation.
// `git status --porcelain=v2 --branch` emits `# branch.*` header lines plus one line
// per changed/untracked file, so we avoid the previous 3-process fan-out (symbolic-ref +
// status + rev-list) on every status poll.
async function statusFull(worktreePath) {
  try {
    const out = await gitExec(worktreePath, ['status', '--porcelain=v2', '--branch']);
    let branch = null;
    let upstream = null;
    let hasUpstream = false;
    let ahead = 0;
    let behind = 0;
    let fileCount = 0;
    for (const line of out.split('\n')) {
      if (!line) continue;
      if (line.startsWith('# branch.head ')) {
        const v = line.slice(14).trim();
        branch = v === '(detached)' ? null : v;
      } else if (line.startsWith('# branch.upstream ')) {
        upstream = line.slice(18).trim() || null;
        hasUpstream = !!upstream;
      } else if (line.startsWith('# branch.ab ')) {
        const m = line.match(/\+(\d+)\s+-(\d+)/);
        if (m) { ahead = Number.parseInt(m[1], 10) || 0; behind = Number.parseInt(m[2], 10) || 0; }
      } else if (line[0] === '1' || line[0] === '2' || line[0] === 'u' || line[0] === '?') {
        fileCount++;
      }
    }
    return { branch, dirty: fileCount > 0, fileCount, hasUpstream, upstream, ahead, behind, error: null };
  } catch (e) {
    return { branch: null, dirty: false, fileCount: 0, hasUpstream: false, upstream: null, ahead: 0, behind: 0, error: e.message };
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

// Diff for a single path — all uncommitted changes (staged + unstaged). For an
// untracked file, returns a synthetic all-additions diff so the UI can still preview it.
async function diffFile(worktreePath, file) {
  if (!file) return '';
  try {
    const out = await gitExec(worktreePath, ['diff', 'HEAD', '--', file]);
    if (out.trim()) return out;
  } catch { /* no HEAD yet, or path errors — fall through to untracked handling */ }
  let tracked = true;
  try { await gitExec(worktreePath, ['ls-files', '--error-unmatch', '--', file]); }
  catch { tracked = false; }
  if (!tracked) {
    try {
      const abs = path.join(worktreePath, file);
      const content = fs.readFileSync(abs, 'utf8');
      const lines = content.length ? content.split('\n') : [''];
      const body = lines.map(l => `+${l}`).join('\n');
      return `--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${body}`;
    } catch {
      return `(${file} — binary or unreadable)`;
    }
  }
  // Tracked but `git diff HEAD` was empty: maybe only staged with no HEAD diff, or no changes.
  try {
    const cached = await gitExec(worktreePath, ['diff', '--cached', '--', file]);
    return cached;
  } catch {
    return '';
  }
}

// Commit only the given file paths (plus any already-staged content).
// Files NOT in the list are unstaged first so a partial commit lands cleanly.
async function commitFiles(worktreePath, message, paths) {
  if (!message?.trim()) throw new Error('Commit message is required.');
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error('Select at least one file to commit.');
  }
  // Reset index to working tree so staging starts clean. Safer than tracking each
  // checkbox's prior staged/unstaged state — the user's checked set IS the index.
  await gitExec(worktreePath, ['reset', '--mixed', '--quiet']).catch(() => {});
  // Stage only the chosen paths. `--` separates pathspecs from refs.
  await gitExec(worktreePath, ['add', '--', ...paths]);
  return gitExec(worktreePath, ['commit', '-m', message]);
}

async function discardFile(worktreePath, file, isUntracked) {
  if (!file) throw new Error('No file specified.');
  if (isUntracked) {
    // Untracked → just remove. `clean -f --` accepts a pathspec.
    return gitExec(worktreePath, ['clean', '-fd', '--', file]);
  }
  // Tracked → restore both index and worktree to HEAD.
  return gitExec(worktreePath, ['restore', '--source=HEAD', '--staged', '--worktree', '--', file]);
}

async function log(worktreePath, limit = 50) {
  // Use a unit separator we won't see in git output to split fields.
  const SEP = '';
  const REC = '';
  const fmt = ['%H', '%h', '%an', '%ae', '%ad', '%s'].join(SEP) + REC;
  const out = await gitExec(worktreePath, [
    'log',
    `--pretty=format:${fmt}`,
    '--date=iso-strict',
    `-n${Math.max(1, Math.min(500, limit))}`,
  ]);
  return out.split(REC).map(s => s.trim()).filter(Boolean).map(line => {
    const [hash, shortHash, authorName, authorEmail, date, ...rest] = line.split(SEP);
    return {
      hash,
      shortHash,
      authorName,
      authorEmail,
      date,
      message: rest.join(SEP),
    };
  });
}

async function diffOfCommit(worktreePath, hash) {
  return gitExec(worktreePath, ['show', '--stat', '--patch', hash]);
}

// Detect in-progress merge / rebase state and the conflicted file list.
async function conflictState(worktreePath) {
  const fs = require('node:fs');
  const path = require('node:path');
  const gitDirOut = await gitExec(worktreePath, ['rev-parse', '--git-dir']).catch(() => '');
  const gitDir = gitDirOut.trim();
  if (!gitDir) return { kind: null, files: [] };
  const abs = path.isAbsolute(gitDir) ? gitDir : path.join(worktreePath, gitDir);
  let kind = null;
  if (fs.existsSync(path.join(abs, 'MERGE_HEAD'))) kind = 'merge';
  else if (fs.existsSync(path.join(abs, 'rebase-merge')) || fs.existsSync(path.join(abs, 'rebase-apply'))) kind = 'rebase';
  else if (fs.existsSync(path.join(abs, 'CHERRY_PICK_HEAD'))) kind = 'cherry-pick';
  // List conflicted files via porcelain status (UU, AA, DD, etc. in the unmerged class).
  const out = await gitExec(worktreePath, ['status', '--porcelain']).catch(() => '');
  const files = [];
  for (const line of out.split('\n')) {
    if (!line) continue;
    const code = line.slice(0, 2);
    const file = line.slice(3);
    // Unmerged entries have any combination of U / AA / DD / AU / UA / DU / UD.
    if (code === 'UU' || code === 'AA' || code === 'DD' || code.includes('U')) {
      files.push({ code: code.trim(), path: file });
    }
  }
  if (files.length > 0 && !kind) kind = 'merge'; // best-effort fallback
  return { kind, files };
}

async function markResolved(worktreePath, file) {
  return gitExec(worktreePath, ['add', '--', file]);
}

async function continueRebase(worktreePath) {
  return gitExec(worktreePath, ['rebase', '--continue']);
}
async function abortRebase(worktreePath) {
  return gitExec(worktreePath, ['rebase', '--abort']);
}
async function continueMerge(worktreePath) {
  // `merge --continue` is the modern equivalent; falls back to commit if needed.
  return gitExec(worktreePath, ['merge', '--continue']);
}
async function abortMerge(worktreePath) {
  return gitExec(worktreePath, ['merge', '--abort']);
}

// PR lookup via the GitHub `gh` CLI. Silently returns null if gh isn't installed
// or the worktree isn't a GitHub-hosted repo.
//
// Two caches make this cheap to call repeatedly:
//  - ghAvailablePromise: memoized for the session (gh's presence doesn't change)
//  - prCache: keyed by (worktreePath, branch), 60s TTL — workspace switches and
//    re-renders no longer refetch PRs on every card.
let ghAvailablePromise = null;
function ghAvailable() {
  if (ghAvailablePromise) return ghAvailablePromise;
  ghAvailablePromise = new Promise((resolve) => {
    execFile('gh', ['--version'], { timeout: 1500 }, (err) => resolve(!err));
  });
  return ghAvailablePromise;
}

const PR_CACHE_TTL_MS = 60_000;
const prCache = new Map();

function clearPrCache(worktreePath) {
  if (!worktreePath) { prCache.clear(); return; }
  // Drop all entries that begin with `<worktreePath>::` (any branch).
  const prefix = `${worktreePath}::`;
  for (const key of prCache.keys()) {
    if (key.startsWith(prefix)) prCache.delete(key);
  }
}

// Reduce a GitHub statusCheckRollup array to one of: 'passing' | 'failing' | 'pending'
// | null (no checks). CheckRuns expose status+conclusion; legacy StatusContexts expose state.
function rollupOutcome(rollup) {
  if (!Array.isArray(rollup) || rollup.length === 0) return null;
  let pending = false;
  for (const c of rollup) {
    const raw = (c.conclusion || c.state || c.status || '').toUpperCase();
    if (['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes(raw)) {
      return 'failing';
    }
    if (['PENDING', 'IN_PROGRESS', 'QUEUED', 'EXPECTED', 'WAITING', 'REQUESTED', ''].includes(raw)) {
      pending = true;
    }
  }
  return pending ? 'pending' : 'passing';
}

async function prForBranch(worktreePath) {
  const ok = await ghAvailable();
  if (!ok) return null;
  const branch = (await gitExec(worktreePath, ['symbolic-ref', '--short', 'HEAD']).catch(() => '')).trim();
  if (!branch) return null;

  const key = `${worktreePath}::${branch}`;
  const cached = prCache.get(key);
  if (cached && Date.now() - cached.t < PR_CACHE_TTL_MS) return cached.value;

  const value = await new Promise((resolve) => {
    execFile(
      'gh',
      ['pr', 'list', '--head', branch, '--json', 'number,title,url,state,statusCheckRollup', '--limit', '1'],
      { cwd: worktreePath, env: cleanEnv(), timeout: 5000 },
      (err, stdout) => {
        if (err) { resolve(null); return; }
        try {
          const list = JSON.parse(stdout || '[]');
          const pr = list[0];
          if (!pr) { resolve(null); return; }
          resolve({
            number: pr.number,
            title: pr.title,
            url: pr.url,
            state: pr.state,
            checks: rollupOutcome(pr.statusCheckRollup),
          });
        } catch { resolve(null); }
      },
    );
  });

  prCache.set(key, { t: Date.now(), value });
  return value;
}

// Subject + body of the most recent commit — used to pre-fill the create-PR form.
async function lastCommitMessage(worktreePath) {
  try {
    const subject = (await gitExec(worktreePath, ['log', '-1', '--format=%s'])).trim();
    const body = (await gitExec(worktreePath, ['log', '-1', '--format=%b'])).trim();
    return { subject, body };
  } catch {
    return { subject: '', body: '' };
  }
}

function ghExec(worktreePath, args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    execFile('gh', args, { cwd: worktreePath, env: cleanEnv(), timeout }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || stdout || err.message).trim()));
      resolve((stdout || '').trim());
    });
  });
}

// Create a pull request for the worktree's branch. Pushes the branch first if it has
// no upstream (so `gh pr create` doesn't fail). Returns the new PR's url + number.
async function createPr(worktreePath, { title, body = '', draft = false } = {}) {
  if (!title?.trim()) throw new Error('PR title is required.');
  if (!(await ghAvailable())) throw new Error('GitHub CLI (`gh`) not found — install it to create PRs from the app.');
  const branch = (await gitExec(worktreePath, ['symbolic-ref', '--short', 'HEAD']).catch(() => '')).trim();
  if (!branch) throw new Error('Detached HEAD — check out a branch before creating a PR.');
  // Ensure the branch is on the remote.
  const hasUpstream = await gitExec(worktreePath, ['rev-parse', '--abbrev-ref', '@{upstream}']).then(() => true).catch(() => false);
  if (!hasUpstream) {
    await gitExec(worktreePath, ['push', '--set-upstream', 'origin', 'HEAD']);
  } else {
    await gitExec(worktreePath, ['push']).catch(() => { /* up to date or rejected — gh pr create will report if there's a real problem */ });
  }
  const args = ['pr', 'create', '--title', title.trim(), '--body', body || ''];
  if (draft) args.push('--draft');
  const out = await ghExec(worktreePath, args);
  // gh prints the PR URL on success.
  const url = (out.match(/https?:\/\/\S+/) || [out])[0];
  clearPrCache(worktreePath);
  let number = null;
  const m = url.match(/\/pull\/(\d+)/);
  if (m) number = Number.parseInt(m[1], 10);
  return { url, number };
}

// Resolve a PR number to its head branch (creating a local branch from pull/N/head,
// which works for fork PRs too) so a worktree can be added on it.
async function fetchPrBranch(repoPath, prNumber) {
  if (!(await ghAvailable())) throw new Error('GitHub CLI (`gh`) not found — install it to check out PRs.');
  const n = Number.parseInt(prNumber, 10);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Enter a valid PR number.');
  const title = await ghExec(repoPath, ['pr', 'view', String(n), '--json', 'title', '-q', '.title'], 10000)
    .catch((e) => { throw new Error(`Could not read PR #${n}: ${e.message}`, { cause: e }); });
  const localBranch = `pr-${n}`;
  await gitExec(repoPath, ['fetch', 'origin', `pull/${n}/head:${localBranch}`, '--force']);
  return { branch: localBranch, title, number: n };
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
  statusFull,
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
  diffFile,
  commitAll,
  commitFiles,
  discardFile,
  log,
  diffOfCommit,
  conflictState,
  markResolved,
  continueRebase,
  abortRebase,
  continueMerge,
  abortMerge,
  prForBranch,
  clearPrCache,
  lastCommitMessage,
  createPr,
  fetchPrBranch,
  stash,
  stashPop,
  stashList,
  fastForward,
};
