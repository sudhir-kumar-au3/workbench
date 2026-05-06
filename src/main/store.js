const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const DEFAULT_COMMANDS = [{ name: 'test', command: '' }];

// Versioned migrations. Each function mutates `data` to the schema of the version after it ran.
const MIGRATIONS = [
  // v1: testCommand -> commands array; theme + workspace metadata fields exist.
  function v1(data) {
    if (data.theme === undefined) data.theme = 'system';
    for (const repo of data.repos || []) {
      if (!Array.isArray(repo.commands)) {
        const legacy = (repo.testCommand || '').trim();
        repo.commands = legacy
          ? [{ name: 'test', command: legacy }]
          : DEFAULT_COMMANDS.map(c => ({ ...c }));
        delete repo.testCommand;
      }
    }
    for (const ws of data.workspaces || []) {
      if (ws.description === undefined) ws.description = '';
      if (!Array.isArray(ws.links)) ws.links = [];
    }
  },
  // v2: sidebarWidth setting.
  function v2(data) {
    if (typeof data.sidebarWidth !== 'number') data.sidebarWidth = 260;
  },
  // v3: display preferences + workspace archive/notes fields.
  function v3(data) {
    if (typeof data.compactMode !== 'boolean') data.compactMode = false;
    if (typeof data.sidebarCollapsed !== 'boolean') data.sidebarCollapsed = false;
    if (typeof data.accentColor !== 'string') data.accentColor = 'indigo';
    if (typeof data.reducedMotion !== 'boolean') data.reducedMotion = false;
    if (typeof data.showArchived !== 'boolean') data.showArchived = false;
    for (const ws of data.workspaces || []) {
      if (typeof ws.archived !== 'boolean') ws.archived = false;
      if (typeof ws.notes !== 'string') ws.notes = '';
    }
  },
  // v4: showResourceStats — display CPU/memory chip on running output panel.
  function v4(data) {
    if (typeof data.showResourceStats !== 'boolean') data.showResourceStats = true;
  },
];

function applyMigrations(data) {
  data._version = data._version ?? 0;
  let changed = false;
  for (let i = data._version; i < MIGRATIONS.length; i++) {
    MIGRATIONS[i](data);
    data._version = i + 1;
    changed = true;
  }
  return changed;
}

function atomicWrite(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, file);
}

function makeStore(file, defaults, runMigrations) {
  return {
    file,
    read() {
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (runMigrations && applyMigrations(data)) {
          atomicWrite(file, JSON.stringify(data, null, 2));
        }
        return data;
      } catch {
        const fresh = typeof defaults === 'function' ? defaults() : { ...defaults };
        if (runMigrations) applyMigrations(fresh);
        return fresh;
      }
    },
    write(data) {
      atomicWrite(file, JSON.stringify(data, null, 2));
    },
  };
}

function createStores(userDataDir) {
  const settingsStore = makeStore(
    path.join(userDataDir, 'workbench.json'),
    () => ({
      _version: MIGRATIONS.length,
      theme: 'system',
      sidebarWidth: 260,
      compactMode: false,
      sidebarCollapsed: false,
      accentColor: 'indigo',
      reducedMotion: false,
      showArchived: false,
      showResourceStats: true,
      workspacesRoot: path.join(os.homedir(), 'worktrees'),
      repos: [],
      workspaces: [],
    }),
    true,
  );

  const runsBase = makeStore(path.join(userDataDir, 'runs.json'), {}, false);
  const RUNS_MAX_ENTRIES = 200; // total (worktree, command) pairs to keep
  function capEntries(data) {
    const flat = [];
    for (const [wp, byCmd] of Object.entries(data)) {
      if (!byCmd || typeof byCmd !== 'object' || Array.isArray(byCmd?.lines)) continue;
      for (const [cmd, run] of Object.entries(byCmd)) {
        flat.push({ wp, cmd, ranAt: run?.ranAt || '' });
      }
    }
    if (flat.length <= RUNS_MAX_ENTRIES) return false;
    flat.sort((a, b) => a.ranAt.localeCompare(b.ranAt));
    const drop = flat.length - RUNS_MAX_ENTRIES;
    for (let i = 0; i < drop; i++) {
      const { wp, cmd } = flat[i];
      if (data[wp]) {
        delete data[wp][cmd];
        if (Object.keys(data[wp]).length === 0) delete data[wp];
      }
    }
    return true;
  }
  const runsStore = {
    read: runsBase.read,
    forWorktree(worktreePath) {
      const data = runsBase.read();
      const entry = data[worktreePath];
      if (!entry || Array.isArray(entry?.lines)) return entry?.lines ? { test: entry } : {};
      return entry;
    },
    save(worktreePath, commandName, run) {
      const data = runsBase.read();
      if (!data[worktreePath] || Array.isArray(data[worktreePath].lines)) {
        const old = data[worktreePath];
        data[worktreePath] = old?.lines ? { test: old } : {};
      }
      data[worktreePath][commandName] = run;
      capEntries(data);
      runsBase.write(data);
    },
    remove(worktreePaths) {
      const data = runsBase.read();
      let changed = false;
      for (const p of worktreePaths) {
        if (p in data) { delete data[p]; changed = true; }
      }
      if (changed) runsBase.write(data);
    },
    setDismissed(worktreePath, commandName, dismissed) {
      const data = runsBase.read();
      const entry = data[worktreePath]?.[commandName];
      if (!entry || Array.isArray(entry)) return;
      entry.dismissed = !!dismissed;
      runsBase.write(data);
    },
    pruneStale() {
      const data = runsBase.read();
      let changed = false;
      for (const wp of Object.keys(data)) {
        if (!fs.existsSync(wp)) {
          delete data[wp];
          changed = true;
        }
      }
      if (capEntries(data)) changed = true;
      if (changed) runsBase.write(data);
      return changed;
    },
  };

  return { settingsStore, runsStore };
}

module.exports = { createStores, applyMigrations, MIGRATIONS };
