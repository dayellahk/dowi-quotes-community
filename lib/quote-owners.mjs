export function tenantTeam(sql,tenantId){
 if(!sql.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='tenant_memberships'").get())return [];
 return sql.prepare('SELECT m.id,m.email,CASE WHEN tm.active=1 AND m.active=1 THEN 1 ELSE 0 END AS active FROM tenant_memberships tm JOIN members m ON m.id=tm.member_id WHERE tm.tenant_id=? ORDER BY m.email').all(tenantId).map(m=>({...m,active:Boolean(m.active)}));
}
export function quoteOwner(sql,tenantId,value){
 if(value===''||value==null)return {assigneeId:null,assigneeName:''};
 if(typeof value!=='string')throw Object.assign(Error('Choose a company team member'),{status:400});
 const member=tenantTeam(sql,tenantId).find(m=>m.id===value&&m.active);
 if(!member)throw Object.assign(Error('Responsible colleague must be an active member of this company'),{status:400});
 return {assigneeId:member.id,assigneeName:member.email};
}
export {quoteMatchesStatus} from '../public/quote-filters.js';
