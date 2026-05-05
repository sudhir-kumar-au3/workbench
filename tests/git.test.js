import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import * as git from '../src/main/git.js';
import { initRepo, rmrf, tmpDir, git as runGit } from './helpers.js';

describe('git', () => {
  let repo;
  beforeEach(() => { repo = initRepo('repo'); });
  afterEach(() => rmrf(repo));

  it('isGitRepo: true for the initialized repo', async () => {
    expect(await git.isGitRepo(repo)).toBe(true);
  });

  it('isGitRepo: false for an arbitrary tmp dir', async () => {
    const d = tmpDir('plain');
    expect(await git.isGitRepo(d)).toBe(false);
    rmrf(d);
  });

  it('listBranches returns at least the default branch', async () => {
    const branches = await git.listBranches(repo);
    expect(branches).toContain('main');
  });

  it('statusOf reports clean for a fresh repo and includes branch', async () => {
    const result = await git.statusOf(repo);
    expect(result.dirty).toBe(false);
    expect(result.fileCount).toBe(0);
    expect(result.branch).toBe('main');
  });

  it('statusOf reports dirty when files change', async () => {
    fs.writeFileSync(path.join(repo, 'new.txt'), 'change');
    const result = await git.statusOf(repo);
    expect(result.dirty).toBe(true);
    expect(result.fileCount).toBe(1);
  });

  it('branchResolvable: true for existing branch, false for missing', async () => {
    expect(await git.branchResolvable(repo, 'main')).toBe(true);
    expect(await git.branchResolvable(repo, 'does-not-exist')).toBe(false);
  });

  it('worktreeAdd creates a new branch and a working tree', async () => {
    const wt = path.join(path.dirname(repo), 'feat-x');
    await git.worktreeAdd(repo, wt, 'feat-x', true);
    expect(fs.existsSync(wt)).toBe(true);
    const status = await git.statusOf(wt);
    expect(status.branch).toBe('feat-x');
    rmrf(wt);
  });

  it('worktreeAdd checks out an existing branch when createNew=false', async () => {
    runGit(repo, 'branch', 'shared');
    const wt = path.join(path.dirname(repo), 'shared-wt');
    await git.worktreeAdd(repo, wt, 'shared', false);
    const status = await git.statusOf(wt);
    expect(status.branch).toBe('shared');
    rmrf(wt);
  });

  it('worktreeRemove cleans up the worktree', async () => {
    const wt = path.join(path.dirname(repo), 'temp-wt');
    await git.worktreeAdd(repo, wt, 'temp', true);
    await git.worktreeRemove(repo, wt, false);
    expect(fs.existsSync(wt)).toBe(false);
  });

  it('switchBranch -c creates and switches', async () => {
    const wt = path.join(path.dirname(repo), 'switch-wt');
    await git.worktreeAdd(repo, wt, 'first', true);
    await git.switchBranch(wt, 'second', true);
    const status = await git.statusOf(wt);
    expect(status.branch).toBe('second');
    rmrf(wt);
  });

  it('scanForWorktrees finds linked worktrees in a parent directory', async () => {
    const parent = tmpDir('scan-parent');
    const a = path.join(parent, 'wt-a');
    const b = path.join(parent, 'wt-b');
    await git.worktreeAdd(repo, a, 'a', true);
    await git.worktreeAdd(repo, b, 'b', true);
    const found = await git.scanForWorktrees(parent);
    const branches = found.map(f => f.branch).sort((a, b) => a.localeCompare(b));
    expect(branches).toEqual(['a', 'b']);
    const repoReal = fs.realpathSync(repo);
    expect(found.every(f => fs.realpathSync(f.repoPath) === repoReal)).toBe(true);
    rmrf(parent);
  });

  it('aheadBehindOf reports no upstream when none is set', async () => {
    const r = await git.aheadBehindOf(repo);
    expect(r.hasUpstream).toBe(false);
  });

  it('gitExec rejects with cleaned-up message on failure', async () => {
    await expect(git.gitExec(repo, ['rev-parse', 'this-ref-does-not-exist'])).rejects.toThrow();
  });
});
