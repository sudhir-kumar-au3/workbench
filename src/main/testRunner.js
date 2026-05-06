const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const MAX_RUN_BYTES = 300 * 1024;

function detectDefaultCommands(repoPath) {
  const out = [];
  const pkgPath = path.join(repoPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      for (const name of ['test', 'lint', 'build', 'dev', 'start']) {
        if (pkg.scripts?.[name]) out.push({ name, command: `npm run ${name}` });
      }
      // npm test is conventional even when not in scripts.test under that exact key.
      if (pkg.scripts?.test && !out.some(c => c.name === 'test')) {
        out.push({ name: 'test', command: 'npm test' });
      }
      if (out.length > 0) return out;
    } catch { /* ignore */ }
  }
  if (fs.existsSync(path.join(repoPath, 'Cargo.toml'))) return [{ name: 'test', command: 'cargo test' }, { name: 'build', command: 'cargo build' }];
  if (fs.existsSync(path.join(repoPath, 'go.mod'))) return [{ name: 'test', command: 'go test ./...' }, { name: 'build', command: 'go build ./...' }];
  if (fs.existsSync(path.join(repoPath, 'pyproject.toml'))) return [{ name: 'test', command: 'pytest' }];
  return [{ name: 'test', command: '' }];
}

class CommandRunner {
  constructor(runsStore, statsPoller = null) {
    this.runs = new Map();
    this.runsStore = runsStore;
    this.statsPoller = statsPoller;
  }

  start(runId, worktreePath, commandName, command, sender) {
    if (!command?.trim()) {
      const failed = {
        command: '',
        lines: [['stderr', `No command configured for "${commandName}". Set one in Manage repos.\n`]],
        exitCode: 1,
        ranAt: new Date().toISOString(),
      };
      this.runsStore.save(worktreePath, commandName, failed);
      sender.send('runs:output', runId, 'stderr', failed.lines[0][1]);
      sender.send('runs:exit', runId, 1);
      return { command: '' };
    }

    const buffer = {
      command,
      lines: [],
      bytes: 0,
      exitCode: null,
      ranAt: new Date().toISOString(),
    };
    const append = (stream, text) => {
      buffer.lines.push([stream, text]);
      buffer.bytes += text.length;
      while (buffer.bytes > MAX_RUN_BYTES && buffer.lines.length > 1) {
        const [, dropped] = buffer.lines.shift();
        buffer.bytes -= dropped.length;
      }
    };
    append('meta', `$ ${command}\n`);

    // Coalesce stdout/stderr across a 16ms window (one frame). Each chunk from the child
    // process is small; sending one IPC per chunk during a verbose build floods the main↔renderer
    // bridge. We accumulate per-stream and flush on a single timer.
    let pendingStdout = '';
    let pendingStderr = '';
    let flushTimer = null;
    const FLUSH_MS = 16;
    const flush = () => {
      flushTimer = null;
      if (pendingStdout) {
        sender.send('runs:output', runId, 'stdout', pendingStdout);
        pendingStdout = '';
      }
      if (pendingStderr) {
        sender.send('runs:output', runId, 'stderr', pendingStderr);
        pendingStderr = '';
      }
    };
    const schedule = () => { if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS); };

    const proc = spawn(command, { cwd: worktreePath, shell: true });
    this.runs.set(runId, { proc, worktreePath, commandName });
    if (this.statsPoller && proc.pid) this.statsPoller.start(runId, proc.pid, sender);
    sender.send('runs:output', runId, 'meta', `$ ${command}\n`);
    proc.stdout.on('data', d => {
      const t = d.toString();
      append('stdout', t);
      pendingStdout += t;
      schedule();
    });
    proc.stderr.on('data', d => {
      const t = d.toString();
      append('stderr', t);
      pendingStderr += t;
      schedule();
    });
    proc.on('close', code => {
      this.runs.delete(runId);
      buffer.exitCode = code;
      this.runsStore.save(worktreePath, commandName, buffer);
      if (flushTimer) { clearTimeout(flushTimer); flush(); }
      else flush();
      this.statsPoller?.stop(runId);
      sender.send('runs:exit', runId, code);
    });
    return { command };
  }

  stop(runId) {
    this.runs.get(runId)?.proc.kill();
  }

  stopAll() {
    for (const { proc } of this.runs.values()) proc.kill();
  }
}

module.exports = { CommandRunner, detectDefaultCommands };
