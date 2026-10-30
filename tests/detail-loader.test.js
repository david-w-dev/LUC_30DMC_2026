import test from 'node:test';
import assert from 'node:assert/strict';
import {createDetailLoader, visibleSections} from '../public/js/detail-loader.js';

const sections = [
  {key:'west',bounds:[0,0,4000,4000],path:'detail/west.json'},
  {key:'east',bounds:[4000,0,8000,4000],path:'detail/east.json'},
];
const state = x => ({scale:1,baseScale:0.01,offsetX:-x,offsetY:-2000});
const settle = () => new Promise(resolve=>setImmediate(resolve));

test('visible detail sections follow the current viewport', () => {
  assert.deepEqual(visibleSections(sections,state(2000),1000,700).map(t=>t.key),['west']);
  assert.deepEqual(visibleSections(sections,state(6000),1000,700).map(t=>t.key),['east']);
});

test('late section loads cannot replace the current view and loaded sections are reused', async () => {
  const data={}, requests=new Map();
  const loader=createDetailLoader({mapData:data,manifest:{tiles:sections},redraw(){},concurrency:1,
    load:path=>new Promise(resolve=>requests.set(path,resolve))});
  loader.update(state(2000),1000,700);
  await settle();
  assert.equal(data.detailLoading,true);
  loader.update(state(6000),1000,700);
  const west={roads:[],buildings:[[[1,2],[3,4]]],water:[],green:[]};
  requests.get('../data/detail/west.json')(west);
  await settle();
  assert.deepEqual(data.detailTiles,[]);
  const east={roads:[],buildings:[],water:[],green:[]};
  requests.get('../data/detail/east.json')(east);
  await settle();
  assert.deepEqual(data.detailTiles,[east]);
  assert.equal(data.detailReady,true);
  assert.equal(data.detailLoading,false);
  loader.update(state(2000),1000,700);
  assert.deepEqual(data.detailTiles,[west]);
  assert.equal(requests.size,2);
  loader.update({...state(2000),scale:0.01},1000,700);
  assert.deepEqual(data.detailTiles,[]);
  assert.equal(data.detailReady,false);
});

test('failed detail loads have an explicit error and do not claim complete detail', async () => {
  const data={};
  const oldError=console.error; console.error=()=>{};
  try {
    const loader=createDetailLoader({mapData:data,manifest:{tiles:sections},redraw(){},load:()=>Promise.reject(new Error('offline'))});
    loader.update(state(2000),1000,700);
    await settle();
    assert.equal(data.detailReady,false);
    assert.equal(data.detailError,true);
    assert.equal(data.detailLoading,false);
  } finally {console.error=oldError;}
});
