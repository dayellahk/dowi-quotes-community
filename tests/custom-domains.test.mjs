import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createStore} from '../lib/store.mjs';
import {createCustomDomains} from '../lib/custom-domains.mjs';
test('custom domain handles Cloudflare ownership object and protects operator-managed domains',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'dowi-domain-'));const store=createStore(path.join(folder,'workspace.json'));
 try{
  let calls=0;const service=createCustomDomains(store,{CLOUDFLARE_API_TOKEN:'test',CLOUDFLARE_ZONE_ID:'zone',CLOUDFLARE_SAAS_TARGET:'customers.example.com'},async()=>{calls++;return {ok:true,json:async()=>({success:true,result:{id:'cf-id',status:'pending',ssl:{status:'pending_validation'},ownership_verification:{type:'txt',name:'_cf-custom-hostname.customer.example.com',value:'verification'}}})}});
  const d=await service.add(store.defaultCompanyId,'customer.example.com');assert.equal(d.txtName,'_cf-custom-hostname.customer.example.com');assert.equal(d.txtValue,'verification');assert.equal(calls,1);assert.equal(d.status,'pending');
  store.deleteDomain(store.defaultCompanyId);store.setDomain(store.defaultCompanyId,{hostname:'managed.example.com',status:'active',cnameTarget:'origin.example.com'});
  await assert.rejects(service.remove(store.defaultCompanyId),{status:409});assert.equal(store.getDomain(store.defaultCompanyId).hostname,'managed.example.com');assert.equal(calls,1);
 }finally{store.close();fs.rmSync(folder,{recursive:true,force:true})}
});
