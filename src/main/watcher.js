const chokidar = require('chokidar');

const IGNORED = [
  /(^|[/\\])\.git([/\\]|$)/,
  /(^|[/\\])node_modules([/\\]|$)/,
  /(^|[/\\])dist([/\\]|$)/,
  /(^|[/\\])build([/\\]|$)/,
  /(^|[/\\])\.next([/\\]|$)/,
  /(^|[/\\])target([/\\]|$)/,
  /(^|[/\\])__pycache__([/\\]|$)/,
];

class WatcherRegistry {
  constructor() {
    this.watchers = new Map();
  }

  // key uniquely identifies a watch (e.g. worktreePath::commandName).
  start(key, worktreePath, debounceMs, onChange) {
    this.stop(key);
    const watcher = chokidar.watch(worktreePath, {
      ignored: IGNORED,
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    });
    let timer = null;
    const trigger = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onChange(), debounceMs);
    };
    watcher.on('all', trigger);
    this.watchers.set(key, { watcher, timer: () => timer && clearTimeout(timer) });
  }

  stop(key) {
    const entry = this.watchers.get(key);
    if (!entry) return;
    entry.timer();
    entry.watcher.close();
    this.watchers.delete(key);
  }

  stopAll() {
    for (const key of this.watchers.keys()) this.stop(key);
  }

  isWatching(key) {
    return this.watchers.has(key);
  }

  stopForWorktreePaths(worktreePaths) {
    const set = new Set(worktreePaths);
    const toStop = [];
    for (const key of this.watchers.keys()) {
      if (set.has(key.split('::')[0])) toStop.push(key);
    }
    for (const key of toStop) this.stop(key);
  }
}

module.exports = { WatcherRegistry };
