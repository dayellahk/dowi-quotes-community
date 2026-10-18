import crypto from 'node:crypto';
const fail=(message,status=400)=>Object.assign(Error(message),{status});
export function initializeRoles(sql){
 sql.exec(`CREATE TABLE IF NOT EXISTS tenant_roles(tenant_id TEXT NOT NULL,id TEXT NOT NULL,name TEXT NOT NULL,templates_items INTEGER NOT NULL,stats_values INTEGER NOT NULL,PRIMARY KEY(tenant_id,id));
 CREATE TABLE IF NOT EXISTS member_roles(tenant_id TEXT NOT NULL,member_id TEXT NOT NULL,role_id TEXT NOT NULL,PRIMARY KEY(tenant_id,member_id));
 CREATE TABLE IF NOT EXISTS tenant_creators(tenant_id TEXT PRIMARY KEY,member_id TEXT NOT NULL);`);
 sql.exec(`INSERT OR IGNORE INTO tenant_creators SELECT tenant_id,MIN(member_id) FROM tenant_memberships WHERE role='owner' AND active=1 GROUP BY tenant_id;
 INSERT OR IGNORE INTO tenant_roles SELECT DISTINCT tenant_id,'sales','Sales',1,1 FROM tenant_memberships;`);
}
export function roleClaims(sql,memberId,tenantId,legacyRole){
 if(legacyRole==='owner')return {roleId:'admin',roleName:'Admin',permissions:{templatesItems:true,statsValues:true,accountSettings:true}};
 const role=sql.prepare(`SELECT r.* FROM member_roles a JOIN tenant_roles r ON r.id=a.role_id AND r.tenant_id=a.tenant_id WHERE a.member_id=? AND a.tenant_id=?`).get(memberId,tenantId)||sql.prepare("SELECT * FROM tenant_roles WHERE tenant_id=? AND id='sales'").get(tenantId);
 return {roleId:role?.id||'sales',roleName:role?.name||'Sales',permissions:{templatesItems:role?Boolean(role.templates_items):true,statsValues:role?Boolean(role.stats_values):true,accountSettings:false}};
}
export function listRoles(sql,tenantId){
 return [{id:'admin',name:'Admin',templatesItems:true,statsValues:true,accountSettings:true,immutable:true},...sql.prepare('SELECT * FROM tenant_roles WHERE tenant_id=? ORDER BY id').all(tenantId).map(r=>({id:r.id,name:r.name,templatesItems:Boolean(r.templates_items),statsValues:Boolean(r.stats_values),accountSettings:false,immutable:false}))];
}
export function saveRole(sql,tenantId,input,roleId){
 if(roleId==='admin')throw fail('The Admin role always has full access',403);
 const name=String(input.name||'').trim();if(!name||name.length>80||name.toLowerCase()==='admin')throw fail('Enter a role name of up to 80 characters');
 if(typeof input.templatesItems!=='boolean'||typeof input.statsValues!=='boolean')throw fail('Choose both role permissions');
 if(roleId&&!sql.prepare('SELECT 1 FROM tenant_roles WHERE tenant_id=? AND id=?').get(tenantId,roleId))throw fail('Role not found',404);
 if(!roleId&&sql.prepare('SELECT COUNT(*) n FROM tenant_roles WHERE tenant_id=?').get(tenantId).n>=30)throw fail('A company can have up to 30 roles',409);
 const id=roleId||crypto.randomUUID();
 sql.prepare('INSERT INTO tenant_roles VALUES(?,?,?,?,?) ON CONFLICT(tenant_id,id) DO UPDATE SET name=excluded.name,templates_items=excluded.templates_items,stats_values=excluded.stats_values').run(tenantId,id,name,Number(input.templatesItems),Number(input.statsValues));
 return listRoles(sql,tenantId).find(r=>r.id===id);
}
export function assignRole(sql,tenantId,memberId,roleId){
 const member=sql.prepare('SELECT role FROM tenant_memberships WHERE tenant_id=? AND member_id=? AND active=1').get(tenantId,memberId);
 if(!member)throw fail('Member not found',404);
 if(roleId!=='admin'&&!sql.prepare('SELECT 1 FROM tenant_roles WHERE tenant_id=? AND id=?').get(tenantId,roleId))throw fail('Role is outside this company',403);
 if(roleId!=='admin'&&sql.prepare('SELECT 1 FROM tenant_creators WHERE tenant_id=? AND member_id=?').get(tenantId,memberId))throw fail('The company creator must remain an administrator',409);
 sql.prepare('UPDATE tenant_memberships SET role=? WHERE tenant_id=? AND member_id=?').run(roleId==='admin'?'owner':'member',tenantId,memberId);
 sql.prepare('INSERT INTO member_roles VALUES(?,?,?) ON CONFLICT(tenant_id,member_id) DO UPDATE SET role_id=excluded.role_id').run(tenantId,memberId,roleId);
}
