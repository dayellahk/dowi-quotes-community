import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createAuth,hash} from '../lib/auth.mjs';
const env={TURNSTILE_REQUIRED:'true',TURNSTILE_SITE_KEY:'site-key',TURNSTILE_SECRET:'secret-key',TURNSTILE_HOSTNAMES:'app.example.com,api.example.com'};
const good=()=>({success:true,hostname:'app.example.com',action:'login'});
test('browser SSO requires a fresh Turnstile before creating OAuth state; native cannot create browser sessions',async()=>{
 const sql=new DatabaseSync(':memory:');const original=globalThis.fetch;let used=false;
 globalThis.fetch=async()=>{const result=used?{success:false}:good();used=true;return Response.json(result)};
 const auth=createAuth(sql,{...env,AUTH_MODE:'oidc',PUBLIC_URL:'https://api.example.com',WEB_URL:'https://app.example.com',TOKEN_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64'),OWNER_EMAIL:'owner@example.com',GOOGLE_CLIENT_ID:'client',GOOGLE_CLIENT_SECRET:'secret'});
 async function start(body,headers={host:'app.example.com',origin:'https://app.example.com'}){const res={writeHead(s){this.status=s},end(b){this.body=JSON.parse(b)},setHeader(){}};await auth.route({method:'POST',headers},res,new URL('https://app.example.com/api/auth/start'),body);return res}
 try{
  await assert.rejects(start({provider:'google'}),{status:403});assert.equal(sql.prepare('SELECT count(*) n FROM oauth_flows').get().n,0);
  const body={provider:'google','cf-turnstile-response':'fresh'};
  const result=await start(body);assert.equal(result.status,200);assert.equal(new URL(result.body.url).searchParams.get('redirect_uri'),'https://app.example.com/auth/google/callback');
  await assert.rejects(start(body),{status:403});assert.equal(sql.prepare('SELECT count(*) n FROM oauth_flows').get().n,1);
  const native={provider:'google',native:true,challenge:hash('native-verifier')};
  await assert.rejects(start(native),{status:403});
  const nr=await start(native,{host:'api.example.com'});assert.equal(new URL(nr.body.url).searchParams.get('redirect_uri'),'https://api.example.com/auth/google/callback');
 }finally{globalThis.fetch=original;sql.close()}
});
