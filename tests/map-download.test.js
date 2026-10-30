import test from 'node:test';
import assert from 'node:assert/strict';
import {readMapResource} from '../public/js/map-data.js';

test('all map downloads share a bounded request queue', async()=>{
  const original=globalThis.fetch;
  let active=0,maximum=0;
  globalThis.fetch=async()=>{
    active++; maximum=Math.max(maximum,active);
    return {ok:true,async json(){await new Promise(r=>setImmediate(r));active--;return {ok:true};}};
  };
  try {
    const results=await Promise.all(Array.from({length:40},(_,i)=>readMapResource(`https://example.test/${i}`)));
    assert.equal(results.length,40);
    assert.ok(maximum<=6);assert.ok(maximum>1);assert.equal(active,0);
  }finally{globalThis.fetch=original;}
});

test('a temporary 503 retries and recovers instead of forcing coarse fallback',async()=>{
  const original=globalThis.fetch;
  let calls=0;
  globalThis.fetch=async()=>++calls===1
    ? new Response('temporary',{status:503})
    : new Response(JSON.stringify({buildings:[[[1,2],[2,3]]]}));
  try {
    const result=await readMapResource('https://example.test/detail');
    assert.equal(calls,2);
    assert.equal(result.buildings.length,1);
  }finally{globalThis.fetch=original;}
});

test('missing files fail explicitly without endlessly retrying',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;return new Response('missing',{status:404});};
  try {
    await assert.rejects(readMapResource('https://example.test/missing'),/404/);
    assert.equal(calls,1);
  }finally{globalThis.fetch=original;}
});
