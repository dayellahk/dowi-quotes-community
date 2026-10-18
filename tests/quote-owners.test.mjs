import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {tenantTeam,quoteOwner,quoteMatchesStatus} from '../lib/quote-owners.mjs';
test('quote assignment is tenant scoped, rejects inactive members and preserves historical roster',()=>{
 const sql=new DatabaseSync(':memory:');
 try{
 sql.exec(`CREATE TABLE members(id TEXT,email TEXT,active INTEGER);CREATE TABLE tenant_memberships(member_id TEXT,tenant_id TEXT,active INTEGER);INSERT INTO members VALUES('a','a@example.com',1),('b','b@example.com',1),('past','past@example.com',1);INSERT INTO tenant_memberships VALUES('a','A',1),('b','B',1),('past','A',0)`);
 assert.deepEqual(quoteOwner(sql,'A','a'),{assigneeId:'a',assigneeName:'a@example.com'});
 for(const value of ['b','past','missing',{}])assert.throws(()=>quoteOwner(sql,'A',value),{status:400});
 assert.deepEqual(quoteOwner(sql,'A',''),{assigneeId:null,assigneeName:''});
 assert.deepEqual(tenantTeam(sql,'A').map(m=>[m.id,m.active]),[['a',true],['past',false]]);
 }finally{sql.close()}
});
test('quote status filters distinguish expiry, editing, unanswered questions and recent opens',()=>{
 const now=Date.parse('2026-10-16T10:00:00Z'),base={status:'Sent',expires:'2026-11-16T00:00:00Z',views:0,messages:[],followups:[]};
 assert.equal(quoteMatchesStatus(base,'Unopened',now),true);
 assert.equal(quoteMatchesStatus({...base,expires:'2026-10-15'},'Open',now),false);
 assert.equal(quoteMatchesStatus({...base,expires:'2026-10-15'},'Expired',now),true);
 assert.equal(quoteMatchesStatus({...base,status:'Accepted',expires:'2026-10-15'},'Expired',now),false);
 assert.equal(quoteMatchesStatus({...base,followups:[{done:false}]},'To follow up',now),true);
 assert.equal(quoteMatchesStatus({...base,followups:[{done:true}]},'To follow up',now),false);
 assert.equal(quoteMatchesStatus({...base,messages:[{staff:false},{staff:true}]},'Unanswered Questions',now),false);
 assert.equal(quoteMatchesStatus({...base,messages:[{staff:true},{staff:false}]},'Unanswered Questions',now),true);
 for(const [last,expected] of [['2026-10-16T09:59:00Z',true],['2026-10-15T10:00:00Z',true],['2026-10-15T09:59:59Z',false],['2026-10-16T10:00:01Z',false]])assert.equal(quoteMatchesStatus({...base,lastViewed:last},'Live, past 24 hours',now),expected);
 assert.equal(quoteMatchesStatus({...base,status:'Draft',firstSent:'2026-10-15'},'Editing',now),true);
 assert.equal(quoteMatchesStatus({...base,status:'Draft',firstSent:'2026-10-15'},'Draft',now),false);
 assert.equal(quoteMatchesStatus({...base,status:'Accepted',progress:'Complete'},'Completed',now),true);
});
