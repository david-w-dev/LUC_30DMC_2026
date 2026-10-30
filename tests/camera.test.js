import test from 'node:test';
import assert from 'node:assert/strict';
import {fitOverview, zoomScale, zoomLevel} from '../public/js/camera.js';

test('overview fits the bounds on wide, tall and small screens', () => {
  const bounds = [-3.38, 51.375, -3.02, 51.62], origin = [-3.18, 51.48];
  for (const [width, height] of [[1363, 932], [1920, 1080], [390, 844], [600, 300]]) {
    const state = fitOverview(bounds, origin, width, height);
    const xs = [bounds[0], bounds[2]].map(lon => width / 2 + state.offsetX + (lon - origin[0]) * 69400 * state.scale);
    const ys = [bounds[1], bounds[3]].map(lat => height / 2 + state.offsetY + (origin[1] - lat) * 111320 * state.scale);
    assert.ok(Math.min(...xs) >= 31 && Math.max(...xs) <= width - 31);
    assert.ok(Math.min(...ys) >= 30 && Math.max(...ys) <= height - 140);
    assert.equal(zoomLevel(state), 1);
    assert.equal(zoomScale(state, 10), state.baseScale * 100);
  }
});

test('zoom round trips end at the exact view and invalidate history only on completion', async () => {
  const {createCamera} = await import('../public/js/camera.js');
  const originalRequest = globalThis.requestAnimationFrame, originalCancel = globalThis.cancelAnimationFrame;
  let tick, cleared=0;
  globalThis.requestAnimationFrame = fn => { tick=fn; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  try {
    const state={scale:0.03,offsetX:23,offsetY:-41,display:{clearHistory(){cleared++;}}};
    const camera=createCamera(state,()=>{});
    camera.animateTo(2300,-4100,3);
    tick(performance.now()+100);
    assert.equal(cleared,0);
    tick(performance.now()+2000);
    assert.deepEqual([state.scale,state.offsetX,state.offsetY],[3,2300,-4100]);
    assert.equal(cleared,1);
    camera.animateTo(23,-41,0.03);
    tick(performance.now()+2000);
    assert.deepEqual([state.scale,state.offsetX,state.offsetY],[0.03,23,-41]);
    assert.equal(cleared,2);
    camera.animateTo(33,-51,0.03);
    tick(performance.now()+2000);
    assert.equal(cleared,2,'ordinary pan retains sustain');
    camera.animateTo(330,-510,0.3);
    camera.cancel();
    assert.equal(cleared,3,'interrupted zoom also clears stale history');
  } finally {globalThis.requestAnimationFrame=originalRequest;globalThis.cancelAnimationFrame=originalCancel;}
});
