// Native text input is required to summon software keyboards on touch devices.
export function connectMobileTerminal({ form, input, state, terminal, draw,
  settleViewport = waitForKeyboard }) {
  if (!form || !input) return;
  input.addEventListener('input', () => {
    state.commandText = input.value.slice(0, 64);
    draw();
  });
  let submitting = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting) return;
    submitting = true;
    const submitted = input.value.slice(0, 64);
    input.blur?.();
    await settleViewport();
    state.commandText = submitted;
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
    submitting = false;
  });
}

// Wait for software-keyboard viewport transitions before creating a radar/camera view.
function waitForKeyboard() {
  if (typeof window === 'undefined' || !window.visualViewport) return Promise.resolve();
  return new Promise(resolve => {
    const viewport = window.visualViewport;
    let quiet;
    const finish = () => {
      clearTimeout(quiet); clearTimeout(deadline);
      viewport.removeEventListener('resize', changed);
      resolve();
    };
    const changed = () => { clearTimeout(quiet); quiet = setTimeout(finish, 350); };
    const deadline = setTimeout(finish, 1500);
    viewport.addEventListener('resize', changed);
    changed();
  });
}
