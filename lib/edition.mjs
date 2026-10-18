// Local Web capacity is an operator setting, never an official iOS entitlement.
export function companySeatLimit(sql,tenantId,{localLimit=process.env.WEB_USER_LIMIT||process.env.PRIVATE_SERVER_SEATS||10000}={}) {
 const value=Number(localLimit);return Number.isSafeInteger(value)&&value>0?value:10000;
}
export function assertSeatAvailable(sql,tenantId,memberId,options={}) {
 if(sql.prepare('SELECT 1 FROM tenant_memberships WHERE tenant_id=? AND member_id=? AND active=1').get(tenantId,memberId))return;
 const count=sql.prepare('SELECT COUNT(*) n FROM tenant_memberships WHERE tenant_id=? AND active=1').get(tenantId).n;
 if(count>=companySeatLimit(sql,tenantId,options))throw Object.assign(Error('The local Web user limit has been reached. Ask the server operator to increase WEB_USER_LIMIT.'),{status:409});
}
export function editionStatus(sql,tenantId) {
 return {edition:'self-hosted',license:'AGPL-3.0-only',seats:companySeatLimit(sql,tenantId),seatsUsed:sql.prepare('SELECT COUNT(*) n FROM tenant_memberships WHERE tenant_id=? AND active=1').get(tenantId).n};
}
