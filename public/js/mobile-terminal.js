// Native text input is required to summon software keyboards on touch devices.
export function connectMobileTerminal({ form, input, state, terminal, draw }) {
  if (!form || !input) return;
  input.addEventListener('input', () => {
    state.commandText = input.value.slice(0, 64);
    draw();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    state.commandText = input.value.slice(0, 64);
    const command = state.commandText.trim();
    const index = /^[1-4]$/.test(command) ? Number(command) - 1
      : !command ? state.selectedIndex : -1;
    if (state.suggestions[index]) {
      const item = state.suggestions[index];
      state.commandText = '';
      terminal.moveTo(item.point, item.category + ' ' + item.name);
      draw();
    } else terminal.execute();
    input.value = state.commandText;
  });
}
