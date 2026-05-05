import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { createStores, applyMigrations, MIGRATIONS } from '../src/main/store.js';
import { tmpDir, rmrf } from './helpers.js';

describe('store', () => {
  let dir;
  beforeEach(() => { dir = tmpDir('store'); });
  afterEach(() => rmrf(dir));

  it('creates fresh stores with default content', () => {
    const { settingsStore } = createStores(dir);
    const data = settingsStore.read();
    expect(data.workspaces).toEqual([]);
    expect(data.repos).toEqual([]);
    expect(data.theme).toBe('system');
    expect(data._version).toBe(MIGRATIONS.length);
  });

  it('persists writes atomically and re-reads them', () => {
    const { settingsStore } = createStores(dir);
    const data = settingsStore.read();
    data.repos.push({ path: '/x', name: 'x', commands: [{ name: 'test', command: 'npm test' }] });
    settingsStore.write(data);
    const fresh = createStores(dir).settingsStore.read();
    expect(fresh.repos).toHaveLength(1);
    expect(fresh.repos[0].name).toBe('x');
  });

  it('migrates legacy testCommand into commands array', () => {
    const file = path.join(dir, 'workbench.json');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({
      repos: [{ path: '/a', name: 'a', testCommand: 'npm test' }],
      workspaces: [{ name: 'feat-x', parentDir: '/p', members: [] }],
    }));
    const { settingsStore } = createStores(dir);
    const data = settingsStore.read();
    expect(data.repos[0].commands).toEqual([{ name: 'test', command: 'npm test' }]);
    expect(data.repos[0].testCommand).toBeUndefined();
    expect(data.workspaces[0].description).toBe('');
    expect(data.workspaces[0].links).toEqual([]);
    expect(data._version).toBe(MIGRATIONS.length);
  });

  it('does not leave a temp file after a successful write', () => {
    const { settingsStore } = createStores(dir);
    settingsStore.write({ _version: 1, repos: [], workspaces: [], theme: 'system', workspacesRoot: '/r' });
    const remaining = fs.readdirSync(dir);
    expect(remaining.some(f => f.includes('.tmp.'))).toBe(false);
  });

  it('returns defaults on corrupted file rather than crashing', () => {
    const file = path.join(dir, 'workbench.json');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, '{ this is not json');
    const { settingsStore } = createStores(dir);
    expect(() => settingsStore.read()).not.toThrow();
    expect(settingsStore.read().repos).toEqual([]);
  });
});

describe('applyMigrations', () => {
  it('is idempotent — running twice changes nothing the second time', () => {
    const data = { repos: [{ path: '/x', name: 'x', testCommand: 'npm test' }], workspaces: [] };
    expect(applyMigrations(data)).toBe(true);
    expect(applyMigrations(data)).toBe(false);
  });
});
