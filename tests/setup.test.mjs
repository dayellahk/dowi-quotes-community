import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('local setup generates private credentials, binds to loopback and never overwrites them',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dowi-community-setup-'));
 const script=fileURLToPath(new URL('../scripts/setup.mjs',import.meta.url));
 try{
  const run=()=>spawnSync(process.execPath,[script,'--local'],{cwd:dir,encoding:'utf8'});
  const first=run();assert.equal(first.status,0,first.stderr);
  const file=path.join(dir,'.env'),content=fs.readFileSync(file,'utf8');
  const env=Object.fromEntries(content.split('\n').filter(line=>line&&!line.startsWith('#')).map(line=>[line.slice(0,line.indexOf('=')),line.slice(line.indexOf('=')+1)]));
  assert.equal(env.HOST,'127.0.0.1');assert.equal(env.AUTH_MODE,'local');assert.equal(env.PUBLIC_URL,'http://localhost:3000');assert.equal(env.NODE_ENV,'development');assert.equal(env.DATA_DIR,'./data');
  assert.equal(Buffer.from(env.TOKEN_ENCRYPTION_KEY,'base64').length,32);assert.equal(env.INTERNAL_PASSWORD.length,48);
  assert.ok(!first.stdout.includes(env.INTERNAL_PASSWORD));assert.ok(!first.stdout.includes(env.TOKEN_ENCRYPTION_KEY));
  if(process.platform!=='win32')assert.equal(fs.statSync(file).mode&0o777,0o600);
  const second=run();assert.notEqual(second.status,0);assert.equal(fs.readFileSync(file,'utf8'),content);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
