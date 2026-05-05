import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import * as workspaces from '../src/main/workspaces.js';
import * as git from '../src/main/git.js';
import { createStores } from '../src/main/store.js';
import { initRepo, rmrf, tmpDir } from './helpers.js';

describe('workspaces', () => {
  let userData;
  let repoA;
  let repoB;
  let parentDir;

  beforeEach(() => {
    userData = tmpDir('userdata');
    repoA = initRepo('repoA');
    repoB = initRepo('repoB');
    parentDir = tmpDir('parent');
  });
  afterEach(() => {
    rmrf(userData);
    rmrf(repoA);
    rmrf(repoB);
    rmrf(parentDir);
  });

  function registerRepos(settingsStore) {
    const data = settingsStore.read();
    data.repos.push(
      { path: repoA, name: path.basename(repoA), commands: [] },
      { path: repoB, name: path.basename(repoB), commands: [] },
    );
    settingsStore.write(data);
  }

  it('createWorkspace produces worktrees for each member with auto branch mode', async () => {
    const { settingsStore } = createStores(userData);
    registerRepos(settingsStore);
    const list = await workspaces.createWorkspace({
      name: 'feat-x',
      parentDir,
      branchMode: 'auto',
      members: [
        { repoPath: repoA, branch: 'feat-x' },
        { repoPath: repoB, branch: 'feat-x' },
      ],
    }, settingsStore);
    expect(list).toHaveLength(1);
    const ws = list[0];
    expect(ws.members).toHaveLength(2);
    for (const m of ws.members) {
      expect(fs.existsSync(m.worktreePath)).toBe(true);
      expect(fs.existsSync(path.join(m.worktreePath, '.git'))).toBe(true);
    }
  });

  it('createWorkspace rolls back already-created worktrees if a later one fails', async () => {
    const { settingsStore } = createStores(userData);
    registerRepos(settingsStore);
    const before = settingsStore.read();
    await expect(workspaces.createWorkspace({
      name: 'feat-y',
      parentDir,
      branchMode: 'auto',
      members: [
        { repoPath: repoA, branch: 'feat-y' },
        { repoPath: '/does/not/exist', branch: 'feat-y' },
      ],
    }, settingsStore)).rejects.toThrow();
    expect(settingsStore.read().workspaces).toHaveLength(0);
    expect(fs.existsSync(path.join(parentDir, 'feat-y', path.basename(repoA)))).toBe(false);
    expect(settingsStore.read().repos).toEqual(before.repos);
  });

  it('deleteWorkspace removes the worktrees and clears persistence', async () => {
    const { settingsStore, runsStore } = createStores(userData);
    registerRepos(settingsStore);
    await workspaces.createWorkspace({
      name: 'feat-z',
      parentDir,
      branchMode: 'auto',
      members: [{ repoPath: repoA, branch: 'feat-z' }],
    }, settingsStore);
    const list = await workspaces.deleteWorkspace('feat-z', false, settingsStore, runsStore);
    expect(list).toHaveLength(0);
    expect(fs.existsSync(path.join(parentDir, 'feat-z', path.basename(repoA)))).toBe(false);
  });

  it('createWorkspace rejects duplicate names', async () => {
    const { settingsStore } = createStores(userData);
    registerRepos(settingsStore);
    const spec = {
      name: 'feat-dup',
      parentDir,
      branchMode: 'auto',
      members: [{ repoPath: repoA, branch: 'feat-dup' }],
    };
    await workspaces.createWorkspace(spec, settingsStore);
    await expect(workspaces.createWorkspace(spec, settingsStore)).rejects.toThrow(/already exists/);
  });

  it('updateMetadata updates description and links', async () => {
    const { settingsStore } = createStores(userData);
    registerRepos(settingsStore);
    await workspaces.createWorkspace({
      name: 'feat-m',
      parentDir,
      branchMode: 'auto',
      members: [{ repoPath: repoA, branch: 'feat-m' }],
    }, settingsStore);
    const list = workspaces.updateMetadata('feat-m', {
      description: 'a feature',
      links: [{ name: 'PR', url: 'https://example.com' }],
    }, settingsStore);
    expect(list[0].description).toBe('a feature');
    expect(list[0].links[0].url).toBe('https://example.com');
  });

  it('reorder rearranges workspaces by name', async () => {
    const { settingsStore } = createStores(userData);
    registerRepos(settingsStore);
    for (const n of ['a', 'b', 'c']) {
      await workspaces.createWorkspace({
        name: n,
        parentDir,
        branchMode: 'auto',
        members: [{ repoPath: repoA, branch: n }],
      }, settingsStore);
    }
    const list = workspaces.reorder(['c', 'a', 'b'], settingsStore);
    expect(list.map(w => w.name)).toEqual(['c', 'a', 'b']);
  });

  it('importWorkspace adopts existing worktrees and auto-registers unknown repos', async () => {
    const { settingsStore } = createStores(userData);
    const importParent = path.join(parentDir, 'workspaces');
    fs.mkdirSync(importParent, { recursive: true });
    const wsName = 'imported-feat';
    const wsDir = path.join(importParent, wsName);
    fs.mkdirSync(wsDir, { recursive: true });

    const wtA = path.join(wsDir, path.basename(repoA));
    await git.worktreeAdd(repoA, wtA, 'imported-feat', true);

    const result = await workspaces.importWorkspace({
      name: wsName,
      parentDir: importParent,
      members: [{ repoPath: repoA, worktreePath: wtA, branch: 'imported-feat' }],
    }, settingsStore);

    expect(result.workspaces).toHaveLength(1);
    expect(result.workspaces[0].members[0].worktreePath).toBe(wtA);
    expect(result.repos.find(r => r.path === repoA)).toBeTruthy();
  });
});
