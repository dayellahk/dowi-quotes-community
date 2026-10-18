import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {companySeatLimit,assertSeatAvailable,editionStatus} from '../lib/edition.mjs';
import {renderEdition} from '../public/edition.js';
test('community distribution contains no native source or hosted license issuer',()=>{
 for(const file of ['apple','ios','lib/billing.mjs','lib/billing-portfolios.mjs','lib/plans.mjs','lib/apple-roots','public/billing-portfolio.js'])assert.equal(fs.existsSync(file),false,file);
 const pkg=JSON.parse(fs.readFileSync('package.json'));assert.equal(pkg.license,'AGPL-3.0-only');assert.equal(pkg.dependencies['@apple/app-store-server-library'],undefined);
 assert.match(fs.readFileSync('LICENSE','utf8'),/GNU AFFERO GENERAL PUBLIC LICENSE/);
 assert.doesNotMatch(fs.readFileSync('server.mjs','utf8'),/createBilling|billing\.check/);
});
test('operator web capacity does not create purchase or mobile access tables',()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE tenant_memberships(tenant_id TEXT,member_id TEXT,active INTEGER)');
 try{sql.prepare('INSERT INTO tenant_memberships VALUES(?,?,1)').run('a','one');assert.equal(companySeatLimit(sql,'a',{localLimit:25}),25);assert.equal(editionStatus(sql,'a').edition,'self-hosted');assert.throws(()=>assertSeatAvailable(sql,'a','two',{localLimit:1}),{status:409});assert.doesNotThrow(()=>assertSeatAvailable(sql,'b','two',{localLimit:1}));assert.deepEqual(sql.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name),['tenant_memberships']);}finally{sql.close()}
});
test('all edition translations distinguish free source from the official paid client',()=>{
 for(const lang of ['en','zh-Hant','zh-Hans']){const html=renderEdition(lang);assert.match(html,/AGPL-3\.0/);assert.match(html,/iOS/);assert.match(html,/href="\/source"/);assert.doesNotMatch(html,/StoreKit|apple\/verify/)}
});
