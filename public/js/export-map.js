export async function mapSnapshot(canvas, display) {
  if (display?.capture) return display.capture();
  const snapshot = document.createElement('canvas');
  snapshot.width = canvas.width; snapshot.height = canvas.height;
  snapshot.getContext('2d').drawImage(canvas, 0, 0);
  return snapshot;
}

export function createMapExport({canvas, state, draw}) {
  let busy = false;
  return async function exportMap() {
    if (busy) return;
    busy = true;
    try {
      draw();
      const snapshot = await mapSnapshot(canvas, state.display);
      const blob = await new Promise((resolve, reject) => snapshot.toBlob(
        value => value ? resolve(value) : reject(new Error('PNG encoding failed')), 'image/png'));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'cardiff-vale-map-' + new Date().toISOString().replace(/[:.]/g, '-') + '.png';
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      state.responseText = 'PNG EXPORTED' + (state.display ? ' WITH CRT EFFECTS' : ' - CRT UNAVAILABLE IN THIS BROWSER');
    } catch (error) {
      console.error(error);
      state.responseText = 'EXPORT FAILED - TRY PRINT AGAIN';
    } finally { busy = false; draw(); }
  };
}
