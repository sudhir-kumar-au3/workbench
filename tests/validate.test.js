import { describe, it, expect } from 'vitest';
import { Schemas } from '../src/main/validate.js';

describe('Schemas.workspaceCreate', () => {
  it('accepts a valid spec', () => {
    expect(() => Schemas.workspaceCreate({
      name: 'feat-x',
      parentDir: '/p',
      branchMode: 'auto',
      members: [{ repoPath: '/r', branch: 'feat-x' }],
    })).not.toThrow();
  });

  it('rejects missing name', () => {
    expect(() => Schemas.workspaceCreate({ members: [] })).toThrow(/name/);
  });

  it('accepts empty members at schema level (business logic checks emptiness)', () => {
    expect(() => Schemas.workspaceCreate({ name: 'x', members: [] })).not.toThrow();
  });

  it('rejects bad branchMode value', () => {
    expect(() => Schemas.workspaceCreate({
      name: 'x',
      branchMode: 'random',
      members: [{ repoPath: '/r', branch: 'b' }],
    })).toThrow(/branchMode/);
  });

  it('rejects member without branch', () => {
    expect(() => Schemas.workspaceCreate({
      name: 'x',
      members: [{ repoPath: '/r' }],
    })).toThrow(/branch/);
  });
});

describe('Schemas.bulkOp', () => {
  it('accepts known ops', () => {
    for (const op of ['fetch', 'pull', 'push', 'rebase']) {
      expect(() => Schemas.bulkOp(op)).not.toThrow();
    }
  });
  it('rejects unknown ops', () => {
    expect(() => Schemas.bulkOp('rm-rf')).toThrow();
  });
});

describe('Schemas.commandsList', () => {
  it('accepts a list of named commands', () => {
    expect(() => Schemas.commandsList([{ name: 'test', command: 'npm test' }])).not.toThrow();
  });
  it('rejects entries missing a name', () => {
    expect(() => Schemas.commandsList([{ command: 'npm test' }])).toThrow();
  });
  it('rejects non-arrays', () => {
    expect(() => Schemas.commandsList('not-an-array')).toThrow();
  });
});
