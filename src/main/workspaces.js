const path = require('node:path');
const fs = require('node:fs');
const git = require('./git');
const { detectDefaultCommands } = require('./testRunner');

async function resolveCreateNew(repoPath, branch, mode) {
  if (mode === 'create') return true;
  if (mode === 'existing') return false;
  // auto: create if branch isn't resolvable; reuse if it is.
  return !(await git.branchResolvable(repoPath, branch));
}

async function createWorkspace(spec, settingsStore) {
  const data = settingsStore.read();
  if (data.workspaces.some(w => w.name === spec.name)) {
    throw new Error(`A workspace named "${spec.name}" already exists.`);
  }
  if (!spec.members?.length) throw new Error('Select at least one repo.');

  const parentDir = spec.parentDir || data.workspacesRoot;
  const workspaceDir = path.join(parentDir, spec.name);
  fs.mkdirSync(workspaceDir, { recursive: true });

  const branchMode = spec.branchMode || 'auto';
  const members = [];
  const created = [];
  try {
    for (const m of spec.members) {
      const repo = data.repos.find(r => r.path === m.repoPath);
      if (!repo) throw new Error(`Repo not found: ${m.repoPath}`);
      const branch = (m.branch || '').trim();
      if (!branch) throw new Error(`Branch is required for ${repo.name}`);
      const wtPath = path.join(workspaceDir, repo.name);
      const createNew = await resolveCreateNew(m.repoPath, branch, branchMode);
      await git.worktreeAdd(m.repoPath, wtPath, branch, createNew);
      created.push({ repoPath: m.repoPath, wtPath });
      members.push({ repoPath: m.repoPath, worktreePath: wtPath, branch });
    }
  } catch (e) {
    for (const c of created) {
      try { await git.worktreeRemove(c.repoPath, c.wtPath, true); }
      catch { /* best effort */ }
    }
    try { fs.rmdirSync(workspaceDir); } catch { /* may not be empty */ }
    throw e;
  }

  data.workspaces.push({
    name: spec.name,
    parentDir,
    members,
    description: spec.description || '',
    links: spec.links || [],
  });
  settingsStore.write(data);
  return data.workspaces;
}

// Spin up a single-member workspace for reviewing a PR: fetch the PR's head into a
// local branch, add a worktree on it, register a workspace named after the PR.
async function createWorkspaceFromPr(spec, settingsStore) {
  // spec: { repoPath, prNumber, name?, parentDir? }
  const data = settingsStore.read();
  const repo = data.repos.find(r => r.path === spec.repoPath);
  if (!repo) throw new Error(`Repo not registered: ${spec.repoPath}`);
  const { branch, title, number } = await git.fetchPrBranch(spec.repoPath, spec.prNumber);
  const name = (spec.name || '').trim() || `pr-${number}`;
  if (data.workspaces.some(w => w.name === name)) {
    throw new Error(`A workspace named "${name}" already exists.`);
  }
  const parentDir = spec.parentDir || data.workspacesRoot;
  const workspaceDir = path.join(parentDir, name);
  fs.mkdirSync(workspaceDir, { recursive: true });
  const wtPath = path.join(workspaceDir, repo.name);
  try {
    // Branch already exists locally (created by fetchPrBranch) → not a new branch.
    await git.worktreeAdd(spec.repoPath, wtPath, branch, false);
  } catch (e) {
    try { fs.rmdirSync(workspaceDir); } catch { /* may not be empty */ }
    throw e;
  }
  data.workspaces.push({
    name,
    parentDir,
    members: [{ repoPath: spec.repoPath, worktreePath: wtPath, branch }],
    description: title ? `Reviewing PR #${number}: ${title}` : `Reviewing PR #${number}`,
    links: [],
  });
  settingsStore.write(data);
  return { workspaces: data.workspaces, name };
}

async function importWorkspace(spec, settingsStore) {
  // spec: { name, parentDir, members: [{ repoPath, worktreePath, branch }] }
  const data = settingsStore.read();
  if (data.workspaces.some(w => w.name === spec.name)) {
    throw new Error(`A workspace named "${spec.name}" already exists.`);
  }
  if (!spec.members?.length) throw new Error('No worktrees selected.');

  // Auto-register any new repos so they show up in Manage Repos.
  for (const m of spec.members) {
    if (!data.repos.some(r => r.path === m.repoPath)) {
      data.repos.push({
        path: m.repoPath,
        name: path.basename(m.repoPath),
        commands: detectDefaultCommands(m.repoPath),
      });
    }
  }

  data.workspaces.push({
    name: spec.name,
    parentDir: spec.parentDir,
    members: spec.members.map(m => ({
      repoPath: m.repoPath,
      worktreePath: m.worktreePath,
      branch: m.branch,
    })),
    description: spec.description || '',
    links: spec.links || [],
  });
  settingsStore.write(data);
  return { workspaces: data.workspaces, repos: data.repos };
}

async function deleteWorkspace(name, force, settingsStore, runsStore) {
  const data = settingsStore.read();
  const ws = data.workspaces.find(w => w.name === name);
  if (!ws) throw new Error(`Workspace not found: ${name}`);

  const errors = [];
  const removedPaths = [];
  for (const m of ws.members) {
    try {
      await git.worktreeRemove(m.repoPath, m.worktreePath, force);
      removedPaths.push(m.worktreePath);
    } catch (e) {
      errors.push(`${path.basename(m.repoPath)}: ${e.message}`);
    }
  }
  if (errors.length > 0) {
    throw new Error(`Failed to remove some worktrees:\n${errors.join('\n')}\n\nUse force-remove to discard local changes.`);
  }

  try { fs.rmdirSync(path.join(ws.parentDir, ws.name)); } catch { /* not empty */ }

  runsStore.remove(removedPaths);
  data.workspaces = data.workspaces.filter(w => w.name !== name);
  settingsStore.write(data);
  return data.workspaces;
}

function updateMetadata(name, metadata, settingsStore) {
  const data = settingsStore.read();
  const ws = data.workspaces.find(w => w.name === name);
  if (!ws) throw new Error(`Workspace not found: ${name}`);
  if (metadata.description !== undefined) ws.description = metadata.description;
  if (Array.isArray(metadata.links)) ws.links = metadata.links;
  settingsStore.write(data);
  return data.workspaces;
}

function setArchived(name, archived, settingsStore) {
  const data = settingsStore.read();
  const ws = data.workspaces.find(w => w.name === name);
  if (!ws) throw new Error(`Workspace not found: ${name}`);
  ws.archived = !!archived;
  settingsStore.write(data);
  return data.workspaces;
}

function setNotes(name, notes, settingsStore) {
  const data = settingsStore.read();
  const ws = data.workspaces.find(w => w.name === name);
  if (!ws) throw new Error(`Workspace not found: ${name}`);
  ws.notes = String(notes || '');
  settingsStore.write(data);
  return data.workspaces;
}

function reorder(orderedNames, settingsStore) {
  const data = settingsStore.read();
  const byName = new Map(data.workspaces.map(w => [w.name, w]));
  const next = [];
  for (const n of orderedNames) {
    if (byName.has(n)) { next.push(byName.get(n)); byName.delete(n); }
  }
  for (const w of byName.values()) next.push(w);
  data.workspaces = next;
  settingsStore.write(data);
  return data.workspaces;
}

module.exports = {
  createWorkspace,
  createWorkspaceFromPr,
  importWorkspace,
  deleteWorkspace,
  updateMetadata,
  setArchived,
  setNotes,
  reorder,
};
