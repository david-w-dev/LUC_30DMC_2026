import test from 'node:test';
import assert from 'node:assert/strict';
import { connectMobileTerminal } from '../public/js/mobile-terminal.js';

test('software keyboard input and form submission execute without keydown events', async () => {
  const input = new EventTarget(); input.value = '';
  const form = new EventTarget();
  const state = { commandText: '', suggestions: [], selectedIndex: -1 };
  const commands = [], moves = [];
  connectMobileTerminal({ form, input, state, draw() {}, terminal: {
    execute() { commands.push(state.commandText); state.commandText = ''; },
    moveTo(...args) { moves.push(args); }
  }});
  input.value = 'move Barry'; input.dispatchEvent(new Event('input'));
  assert.equal(state.commandText, 'move Barry');
  form.dispatchEvent(new Event('submit', {cancelable: true}));
  await Promise.resolve();
  assert.deepEqual(commands, ['move Barry']);
  assert.equal(input.value, '');
  state.suggestions = [{point: [1, 2], category: 'place', name: 'Barry'}];
  input.value = '1'; input.dispatchEvent(new Event('input'));
  form.dispatchEvent(new Event('submit', {cancelable: true}));
  await Promise.resolve();
  assert.deepEqual(moves, [[[1, 2], 'place Barry']]);
  assert.equal(input.value, '');
});

test('mobile commands wait for keyboard resize and ignore duplicate submissions', async () => {
  const input = new EventTarget(); input.value = 'radar cafes';
  let blurred = false, release, calls = 0;
  input.blur = () => { blurred = true; };
  const form = new EventTarget();
  const state = {commandText: '', suggestions: [], selectedIndex: -1};
  connectMobileTerminal({form, input, state, draw() {},
    settleViewport: () => new Promise(resolve => { release = resolve; }),
    terminal: {execute() { calls++; assert.equal(state.commandText, 'radar cafes'); state.commandText = ''; }}});
  form.dispatchEvent(new Event('submit', {cancelable: true}));
  form.dispatchEvent(new Event('submit', {cancelable: true}));
  assert.equal(blurred, true);
  assert.equal(calls, 0);
  release(); await Promise.resolve();
  assert.equal(calls, 1);
});
