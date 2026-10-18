import crypto from 'node:crypto';
import {activity,now} from './domain.mjs';
import {enqueue} from './webhooks.mjs';
export function createTracking(sql){
 sql.exec(`CREATE TABLE IF NOT EXISTS quote_visitors(quote_id TEXT NOT NULL,visitor TEXT NOT NULL,counted INTEGER NOT NULL,seen INTEGER NOT NULL,PRIMARY KEY(quote_id,visitor));`);
 const challenges=new Map();
 return {
  challenge(token){const nonce=crypto.randomBytes(24).toString('hex');const time=Date.now();challenges.set(nonce,{token,time});if(challenges.size>10000)challenges.delete(challenges.keys().next().value);for(const [k,v] of challenges)if(time-v.time>3600000)challenges.delete(k);return nonce},
  record(db,q,{challenge,visitor,heartbeat=false},staff=false){
   if(staff)return {counted:false,preview:true};
   const proof=challenges.get(challenge),time=Date.now();
   if(!proof||proof.token!==q.token||time-proof.time<3000||time-proof.time>3600000)throw Error('View confirmation expired or too early');
   if(typeof visitor!=='string'||!/^[a-zA-Z0-9_-]{20,80}$/.test(visitor))throw Error('Invalid viewer session');
   const key=crypto.createHash('sha256').update(visitor).digest('hex');const previous=sql.prepare('SELECT * FROM quote_visitors WHERE quote_id=? AND visitor=?').get(q.id,key);
   const counted=!heartbeat&&(!previous||time-previous.counted>=1800000);
   if(heartbeat&&!previous)throw Error('Confirm a view before sending presence');
   if(counted){q.views++;q.lastViewEvent=now();activity(q,'Customer opened the quote');enqueue(db,'customer_viewed',q,{viewed:{when:now(),total_views:q.views}})}
   q.lastViewed=now();if(q.status==='Sent')q.status='Viewed';
   return {counted,apply:()=>{sql.prepare('INSERT INTO quote_visitors VALUES(?,?,?,?) ON CONFLICT(quote_id,visitor) DO UPDATE SET counted=excluded.counted,seen=excluded.seen').run(q.id,key,counted?time:previous?.counted||time,time);sql.prepare('DELETE FROM quote_visitors WHERE seen<?').run(time-86400000)}};
  },
  live(quoteId){return Boolean(sql.prepare('SELECT 1 FROM quote_visitors WHERE quote_id=? AND seen>? LIMIT 1').get(quoteId,Date.now()-60000))}
 };
}
