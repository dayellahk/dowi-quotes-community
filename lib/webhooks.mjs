import crypto from 'node:crypto';
import {normalizePortalURL} from './urls.mjs';
import {id,now,events,webhookPayload} from './domain.mjs';
import {webhookURL,postWebhook} from './webhook-network.mjs';

export function webhookConfig(b,existing){
 const url=String(b.url||'').trim();
 if(url)webhookURL(url);
 const baseURL=normalizePortalURL(b.baseURL||'http://127.0.0.1:3000');
 if(!Array.isArray(b.events)||b.events.some(e=>!events.includes(e)))throw Error('Invalid webhook events');
 if(b.enabled&&!url)throw Error('Set a webhook URL before enabling delivery');
 return {url,baseURL,baseURLConfigured:true,enabled:b.enabled===true,secret:typeof b.secret==='string'&&b.secret?b.secret:existing.secret||crypto.randomBytes(32).toString('hex'),events:[...new Set(b.events)],paused:false};
}

export function enqueue(db,event,q,extra={},force=false){
 const w=db.webhooks;
 if(!w.url||!force&&(!w.enabled||w.paused||!w.events.includes(event)))return null;
 const delivery={id:id(),event,quoteId:q.id,url:w.url,payload:webhookPayload(event,q,db,extra),created:now(),status:'Pending',attempts:0,nextAttempt:now(),responseCode:null,error:''};
 db.deliveries.unshift(delivery);return delivery;
}

export function startWebhookWorker(store){
 let busy=false;
 const prunedAt=new Map();
 const retryMs=process.env.WEBHOOK_RETRY_MS?Number(process.env.WEBHOOK_RETRY_MS):300000;
 const companyIds=()=>store.allCompanies?.().map(c=>c.id)||[store.defaultCompanyId];
 async function run(){
  if(busy)return;busy=true;
  try{
   for(const companyId of companyIds()){
    let db;
    try{db=store.read(companyId)}catch(error){console.error('Webhook workspace:',error.message);continue}
    if(Date.now()-(prunedAt.get(companyId)||0)>3600000){
     const before=db.deliveries.length;
     db.deliveries=db.deliveries.filter(d=>Date.parse(d.created)>Date.now()-7*86400000);
     if(before!==db.deliveries.length)store.save(db,undefined,companyId);
     prunedAt.set(companyId,Date.now());
    }
    if(db.webhooks.paused)continue;
    const d=db.deliveries.find(d=>['Pending','Retrying'].includes(d.status)&&Date.parse(d.nextAttempt)<=Date.now());
    if(!d)continue;
    const secret=db.webhooks.secret;d.status='Delivering';d.attempts++;store.save(db,undefined,companyId);
    let result,error='';
    try{
     const raw=JSON.stringify(d.payload);
     const response=await postWebhook(d.url,raw,{'Content-Type':'application/json','X-Dowi-Quotes-Event':d.event,'X-Dowi-Quotes-Delivery':d.id,'X-Dowi-Quotes-Signature':'sha256='+crypto.createHmac('sha256',secret).update(raw).digest('hex')});
     result=response.status;if(!response.ok)error=`HTTP ${response.status}`;await response.body?.cancel();
    }catch(e){error=e.message}
    const current=store.read(companyId),record=current.deliveries.find(x=>x.id===d.id);if(!record)continue;
    record.responseCode=result||null;record.error=error;record.lastAttempt=now();
    if(!error){record.status='Delivered';record.deliveredAt=now()}
    else if(record.attempts<4){record.status='Retrying';record.nextAttempt=new Date(Date.now()+retryMs*record.attempts).toISOString()}
    else{record.status='Failed';current.webhooks.paused=true}
    store.save(current,undefined,companyId);
    return;
   }
  }finally{busy=false}
 }
 for(const companyId of companyIds()){
  const initial=store.read(companyId);
  for(const d of initial.deliveries)if(d.status==='Delivering'){d.status='Retrying';d.nextAttempt=now()}
  initial.deliveries=initial.deliveries.filter(d=>Date.parse(d.created)>Date.now()-7*86400000);
  store.save(initial,undefined,companyId);
 }
 const interval=setInterval(()=>run().catch(e=>console.error('Webhook worker:',e.message)),process.env.WEBHOOK_POLL_MS?Number(process.env.WEBHOOK_POLL_MS):1000);
 interval.unref();return ()=>clearInterval(interval);
}
