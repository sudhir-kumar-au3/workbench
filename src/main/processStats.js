const { execFile } = require('node:child_process');
const pidusage = require('pidusage');
const log = require('electron-log/main');

// Lean cross-platform process-tree walker. We need this because most run commands spawn
// shells that fork children (npm → node → workers), and pidusage on the root PID alone
// reports near-zero CPU during the actual work.
function listProcesses() {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'wmic' : 'ps';
    const args = isWin
      ? ['process', 'get', 'ProcessId,ParentProcessId', '/format:csv']
      : ['-A', '-o', 'pid=,ppid='];
    execFile(cmd, args, { timeout: 1500, windowsHide: true }, (err, stdout) => {
      if (err) { resolve([]); return; }
      const rows = [];
      for (const line of String(stdout).split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (isWin) {
          // CSV: Node,ParentProcessId,ProcessId — skip header, ignore non-numeric
          const parts = trimmed.split(',');
          const ppid = Number.parseInt(parts[1], 10);
          const pid = Number.parseInt(parts[2], 10);
          if (Number.isFinite(pid) && Number.isFinite(ppid)) rows.push({ pid, ppid });
        } else {
          const m = trimmed.match(/^(\d+)\s+(\d+)$/);
          if (m) rows.push({ pid: Number.parseInt(m[1], 10), ppid: Number.parseInt(m[2], 10) });
        }
      }
      resolve(rows);
    });
  });
}

async function descendantPids(rootPid) {
  const all = await listProcesses();
  if (!all.length) return [rootPid];
  const childrenOf = new Map();
  for (const { pid, ppid } of all) {
    if (!childrenOf.has(ppid)) childrenOf.set(ppid, []);
    childrenOf.get(ppid).push(pid);
  }
  const out = [rootPid];
  const stack = [rootPid];
  while (stack.length) {
    const next = stack.pop();
    const kids = childrenOf.get(next) || [];
    for (const k of kids) { out.push(k); stack.push(k); }
  }
  return out;
}

class ProcessStatsPoller {
  constructor() {
    this.timers = new Map(); // runId -> { interval, rootPid, sender, runId, lastReport }
  }

  start(runId, rootPid, sender, intervalMs = 2000) {
    if (!rootPid || this.timers.has(runId)) return;
    const cpuCount = require('node:os').cpus().length;
    const handle = { rootPid, sender, runId, intervalMs, cpuCount, warming: true };

    const tick = async () => {
      try {
        const pids = await descendantPids(rootPid);
        const stats = await pidusage(pids).catch(() => ({}));
        let totalCpu = 0;
        let totalRss = 0;
        for (const id of pids) {
          const s = stats[id];
          if (s) {
            totalCpu += s.cpu || 0;
            totalRss += s.memory || 0;
          }
        }
        // pidusage returns CPU% potentially > 100 on multi-core; convert to "cores engaged".
        const cores = totalCpu / 100;
        if (sender.isDestroyed?.()) {
          this.stop(runId);
          return;
        }
        sender.send('runs:stats', runId, {
          cores,
          coresMax: cpuCount,
          rss: totalRss,
          warming: handle.warming,
        });
        handle.warming = false;
      } catch (e) {
        log.debug?.('processStats poll error', { runId, error: e?.message });
      }
    };

    handle.interval = setInterval(tick, intervalMs);
    this.timers.set(runId, handle);
    // Fire once immediately so the chip shows up fast (still flagged warming).
    tick();
  }

  stop(runId) {
    const h = this.timers.get(runId);
    if (!h) return;
    clearInterval(h.interval);
    this.timers.delete(runId);
    pidusage.clear?.(); // free pidusage's internal CPU history for these pids
  }

  stopAll() {
    for (const id of this.timers.keys()) this.stop(id);
  }
}

module.exports = { ProcessStatsPoller };
