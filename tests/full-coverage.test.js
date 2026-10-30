import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {readDataset} from './data.js';

const base = new URL('../public/data/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('detail-manifest.json',base)));
const metadata=readDataset('cardiff-map');
const sections=new Map();
function section(entry) {
  if(sections.has(entry.key))return sections.get(entry.key);
  const url=new URL(entry.path,base);
  const m=JSON.parse(readFileSync(url));
  const encoded=m.chunks.map(name=>readFileSync(new URL(name,url),'utf8')).join('');
  const data=JSON.parse(gunzipSync(Buffer.from(encoded,'base64')));
  sections.set(entry.key,data);
  return data;
}

test('full coverage uses both actual councils and replaces the old central-only geometry',()=>{
  assert.deepEqual(manifest.councils.map(c=>c.id).sort((a,b)=>a-b),[103776,1625787]);
  assert.ok(manifest.sourceTimestamp);
  assert.ok(manifest.features.buildings>100000);
  assert.ok(manifest.features.roads>50000);
  assert.equal(metadata.fullCoverage,true);
  assert.deepEqual(metadata.buildings,[]);
  assert.deepEqual(metadata.roads,[]);
});

test('every detailed section and compressed chunk decodes with the recorded feature counts',()=>{
  const keys=new Set();
  for(const entry of manifest.tiles) {
    assert.ok(!keys.has(entry.key)); keys.add(entry.key);
    const data=section(entry);
    for(const key of ['roads','buildings','water','green']) {
      assert.equal(data[key].length,entry.counts[key],entry.key+' '+key);
      for(const feature of data[key]) {
        const points=key==='roads'?feature[1]:feature;
        assert.ok(points.length>=2);
        assert.ok(points.every(point=>point.length===2 && point.every(Number.isFinite)));
      }
    }
  }
});

test('suburbs and Vale towns have detailed buildings and roads, beyond the former city-centre patch',()=>{
  for(const name of ['Fairwater','Llanishen','Leckwith','Barry','Penarth','Cowbridge','Llantwit Major','St Athan','Rhoose']) {
    const target=metadata.targets.find(t=>t[0]==='p' && t[1]===name);
    assert.ok(target,name+' search target');
    const [x,y]=target.slice(3,5);
    const entry=manifest.tiles.find(t=>t.bounds[0]<=x && t.bounds[2]>=x && t.bounds[1]<=y && t.bounds[3]>=y);
    assert.ok(entry,name+' section');
    const data=section(entry);
    assert.ok(data.roads.length>100,name+' roads');
    const localBuildings=data.buildings.filter(points=>{
      const bx=points.reduce((sum,p)=>sum+p[0],0)/points.length;
      const by=points.reduce((sum,p)=>sum+p[1],0)/points.length;
      return Math.hypot(bx-x,by-y)<1500;
    });
    assert.ok(localBuildings.length>100,name+' local building footprints');
  }
});

test('the renderer draws newly loaded geometry and drops the previous viewport sections', async()=>{
  const {createRenderer}=await import('../public/js/renderer.js');
  const moves=[];
  const ctx=new Proxy({moveTo:(x,y)=>moves.push([x,y]),measureText:s=>({width:s.length*6})},
    {get:(object,key)=>key in object?object[key]:()=>{}});
  const tile=x=>({roads:[['residential',[[x,12],[x+1,13]]]],buildings:[[[x,112],[x+1,113],[x+2,112],[x,112]]],water:[],green:[]});
  const mapData={roads:[],buildings:[],water:[],green:[],luc:[],targets:[],fullCoverage:true,
    detailTiles:[tile(111)],detailReady:false,detailRevision:1};
  const state={scale:0.5,baseScale:0.016,offsetX:0,offsetY:0,suggestions:[],commandText:'',responseText:'READY'};
  const renderer=createRenderer({canvas:{getContext:()=>ctx},screen:{clientWidth:980,clientHeight:480},
    mapData,regionalData:{roads:[],water:[],green:[],labels:[]},state});
  renderer.draw();
  assert.ok(moves.some(([x,y])=>x===111 && y===112),'loaded detail remains visible while other sections are pending');
  moves.length=0; mapData.detailReady=true;
  renderer.draw();
  assert.ok(moves.some(([x,y])=>x===111 && y===12));
  assert.ok(moves.some(([x,y])=>x===111 && y===112));
  moves.length=0;
  mapData.detailTiles=[tile(211)]; mapData.detailRevision++;
  renderer.draw();
  assert.ok(moves.some(([x,y])=>x===211 && y===112));
  assert.ok(!moves.some(([x])=>x===111),'sections from the previous view are removed');
  mapData.detailError=true; mapData.detailReady=false;
  for (const level of [5,6,7,8]) {
    state.scale=state.baseScale*100**((level-1)/9);
    moves.length=0;
    renderer.draw();
    assert.ok(moves.some(([x,y])=>x===211 && y===112),`loaded buildings stay visible at zoom ${level} even if a neighbour fails`);
  }
});
