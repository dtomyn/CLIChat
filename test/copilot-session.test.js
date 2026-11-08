const test = require('node:test');
const assert = require('node:assert');
const { sessionArgs } = require('../providers/copilot-cli');

const ID = '0cb916db-26aa-40f2-86b5-1ba81b225fd2';

test('newer Copilot CLIs get --session-id', () => {
  const help = '  --session-id <id>                     Resume an existing session or task by\n  --resume[=value] ...';
  assert.deepStrictEqual(sessionArgs(help, ID), ['--session-id', ID]);
});

test('older Copilot CLIs (no --session-id) get --resume=<id>, which also starts a new session', () => {
  const help = '  --continue   Resume the most recent session\n  --resume[=sessionId]   Resume from a previous session';
  assert.deepStrictEqual(sessionArgs(help, ID), [`--resume=${ID}`]);
});

test('unknown help text falls back to --resume=<id>', () => {
  assert.deepStrictEqual(sessionArgs('', ID), [`--resume=${ID}`]);
  assert.deepStrictEqual(sessionArgs(undefined, ID), [`--resume=${ID}`]);
});
