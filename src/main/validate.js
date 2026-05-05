// Lightweight runtime validators for IPC inputs. Throw TypeError on mismatch
// so handlers can surface clear errors back to the renderer.

function isString(v) { return typeof v === 'string'; }
function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

function assertString(v, name) {
  if (!isString(v)) throw new TypeError(`${name} must be a string`);
  return v;
}
function assertNonEmptyString(v, name) {
  if (!isString(v) || v.trim() === '') throw new TypeError(`${name} must be a non-empty string`);
  return v;
}
function assertArray(v, name) {
  if (!Array.isArray(v)) throw new TypeError(`${name} must be an array`);
  return v;
}
function assertObject(v, name) {
  if (!isObject(v)) throw new TypeError(`${name} must be an object`);
  return v;
}
function assertOneOf(v, allowed, name) {
  if (!allowed.includes(v)) throw new TypeError(`${name} must be one of ${allowed.join(', ')}`);
  return v;
}
function assertOptionalString(v, name) {
  if (v === undefined || v === null) return '';
  return assertString(v, name);
}

const Schemas = {
  workspaceCreate(spec) {
    assertObject(spec, 'spec');
    assertNonEmptyString(spec.name, 'spec.name');
    assertOptionalString(spec.parentDir, 'spec.parentDir');
    if (spec.branchMode !== undefined) {
      assertOneOf(spec.branchMode, ['auto', 'create', 'existing'], 'spec.branchMode');
    }
    assertArray(spec.members, 'spec.members');
    for (const [i, m] of spec.members.entries()) {
      assertObject(m, `spec.members[${i}]`);
      assertNonEmptyString(m.repoPath, `spec.members[${i}].repoPath`);
      assertNonEmptyString(m.branch, `spec.members[${i}].branch`);
    }
    return spec;
  },
  workspaceImport(spec) {
    assertObject(spec, 'spec');
    assertNonEmptyString(spec.name, 'spec.name');
    assertNonEmptyString(spec.parentDir, 'spec.parentDir');
    assertArray(spec.members, 'spec.members');
    for (const [i, m] of spec.members.entries()) {
      assertObject(m, `spec.members[${i}]`);
      assertNonEmptyString(m.repoPath, `spec.members[${i}].repoPath`);
      assertNonEmptyString(m.worktreePath, `spec.members[${i}].worktreePath`);
      assertNonEmptyString(m.branch, `spec.members[${i}].branch`);
    }
    return spec;
  },
  commandsList(commands) {
    assertArray(commands, 'commands');
    for (const [i, c] of commands.entries()) {
      assertObject(c, `commands[${i}]`);
      assertNonEmptyString(c.name, `commands[${i}].name`);
      if (c.command !== undefined) assertString(c.command, `commands[${i}].command`);
    }
    return commands;
  },
  metadata(metadata) {
    assertObject(metadata, 'metadata');
    if (metadata.description !== undefined) assertString(metadata.description, 'metadata.description');
    if (metadata.links !== undefined) {
      assertArray(metadata.links, 'metadata.links');
      for (const [i, l] of metadata.links.entries()) {
        assertObject(l, `metadata.links[${i}]`);
        if (l.name !== undefined) assertString(l.name, `metadata.links[${i}].name`);
        if (l.url !== undefined) assertString(l.url, `metadata.links[${i}].url`);
      }
    }
    return metadata;
  },
  bulkOp(op) {
    return assertOneOf(op, ['fetch', 'pull', 'push', 'rebase'], 'op');
  },
  pathArray(arr, name) {
    assertArray(arr, name);
    for (const [i, p] of arr.entries()) assertNonEmptyString(p, `${name}[${i}]`);
    return arr;
  },
};

module.exports = {
  assertString,
  assertNonEmptyString,
  assertArray,
  assertObject,
  assertOneOf,
  assertOptionalString,
  Schemas,
};
