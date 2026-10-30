import test from 'node:test';
import assert from 'node:assert/strict';
import { connectMobileTerminal } from '../public/js/mobile-terminal.js';

test('software keyboard input and form submission execute without keydown events', () => {
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
  assert.deepEqual(commands, ['move Barry']);
  assert.equal(input.value, '');
  state.suggestions = [{point: [1, 2], category: 'place', name: 'Barry'}];
  input.value = '1'; input.dispatchEvent(new Event('input'));
  form.dispatchEvent(new Event('submit', {cancelable: true}));
  assert.deepEqual(moves, [[[1, 2], 'place Barry']]);
  assert.equal(input.value, '');
});
