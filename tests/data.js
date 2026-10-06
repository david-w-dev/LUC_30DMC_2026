import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';

export function readDataset(name) {
  const base = new URL('../public/data/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL(`${name}.json`, base)));
  const text = manifest.chunks.map(path => readFileSync(new URL(path, base), 'utf8')).join('');
  return JSON.parse(gunzipSync(Buffer.from(text, 'base64')));
}
