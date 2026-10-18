import nodemailer from 'nodemailer';
import {id,now,activity} from './domain.mjs';
const email=value=>typeof value==='string'&&value.length<=254&&/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);
export function mailConfig(env=process.env){
 const host=env.SMTP_HOST||'',from=env.SMTP_FROM||'',port=Number(env.SMTP_PORT||587),secure=env.SMTP_SECURE==='true'||port===465;
 return {enabled:Boolean(host&&email(from)&&Number.isInteger(port)&&port>0&&port<=65535),from,options:{host,port,secure,requireTLS:!secure&&!['127.0.0.1','::1','localhost'].includes(host),auth:env.SMTP_USER?{user:env.SMTP_USER,pass:env.SMTP_PASS||''}:undefined,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,disableFileAccess:true,disableUrlAccess:true}};
}
export function queueQuoteEmail(db,q,baseURL,config,requestId){
 if(requestId&&(!/^[a-zA-Z0-9-]{16,80}$/.test(requestId)))throw Error('Invalid send request ID');
 if(requestId){const existing=db.mailDeliveries.find(d=>d.requestId===requestId&&d.quoteId===q.id&&d.memberId===config.memberId);if(existing)return existing}
 if(!config.enabled)throw Error('Email delivery is not configured on this server');
 if(!['Draft','Sent','Viewed'].includes(q.status)||Date.parse(q.expires)<=Date.now())throw Error('Only current draft or open quotes can be emailed');
 const c=db.contacts.find(c=>c.id===q.contactId);if(!email(c?.email))throw Error('Add a valid customer email address first');
 if(db.mailDeliveries.some(d=>d.quoteId===q.id&&['Queued','Delivering'].includes(d.status)))throw Error('An email for this quote is already queued');
 const base=new URL(baseURL);if(!['http:','https:'].includes(base.protocol)||base.username||base.password)throw Error('Invalid customer portal URL');
 const d={id:id(),quoteId:q.id,requestId,memberId:config.memberId,provider:config.provider,recipient:c.email,created:now(),status:'Queued',subject:`Quote #${q.number}: ${q.title}`,text:`Hello ${c.name},\n\n${db.settings.company} has prepared a quote for you: ${q.title}.\n\nReview your quote, ask questions and respond here:\n${baseURL.replace(/\/$/,'')}/q/${q.token}\n\nThank you,\n${db.settings.company}`,error:''};
 db.mailDeliveries.unshift(d);activity(q,`Email queued for ${c.email}`);return d;
}
export function startMailWorker(store,config=mailConfig()){
 let busy=false;
 const companyIds=()=>store.allCompanies?.().map(c=>c.id)||[store.defaultCompanyId];
 for(const companyId of companyIds()){
  const recovered=store.read(companyId);let changed=false;
  for(const d of recovered.mailDeliveries)if(d.status==='Delivering'){
   d.status='Uncertain';d.error='Delivery interrupted. Check recipient before sending again.';
   const q=recovered.quotes.find(q=>q.id===d.quoteId);if(q)activity(q,d.error);changed=true;
  }
  if(changed)store.save(recovered,undefined,companyId);
 }
 const transport=config.send?{sendMail:config.send}:config.enabled?nodemailer.createTransport(config.options):null;
 async function run(){if(busy||!transport)return;busy=true;try{
  for(const companyId of companyIds()){
   const db=store.read(companyId),d=db.mailDeliveries.find(d=>d.status==='Queued');if(!d)continue;
   const q=db.quotes.find(q=>q.id===d.quoteId);
   if(!q||!['Sent','Viewed'].includes(q.status)||Date.parse(q.expires)<=Date.now()){
    d.status='Cancelled';d.error='Quote is no longer open';if(q)activity(q,'Queued email cancelled because the quote is no longer open');store.save(db,undefined,companyId);return;
   }
   d.status='Delivering';store.save(db,undefined,companyId);let status=config.send?'Submitted':'Delivered',error='';
   try{const r=await transport.sendMail(config.send?{...d,tenantId:store.company(companyId).tenantId}:{from:config.from,to:d.recipient,subject:d.subject,text:d.text,messageId:`<${d.id}@dowi-quotes.local>`});if(!r.accepted?.includes(d.recipient))throw Error('Recipient rejected')}
   catch(e){status=e.responseCode>=400?'Failed':'Uncertain';error=status==='Failed'?`Email delivery rejected (${e.code||'rejected'}). Reconnect the mailbox or check email configuration before sending again.`:'Email delivery could not be confirmed. Check recipient before sending again.'}
   const fresh=store.read(companyId),delivery=fresh.mailDeliveries.find(x=>x.id===d.id),quote=fresh.quotes.find(x=>x.id===d.quoteId);
   if(delivery){delivery.status=status;delivery.error=error;delivery.finished=now();if(quote)activity(quote,status==='Submitted'?`Email submitted through ${d.provider} for ${d.recipient}`:status==='Delivered'?`Email delivered to SMTP server for ${d.recipient}`:error);store.save(fresh,undefined,companyId)}
   return;
  }
 }finally{busy=false}}
 const timer=setInterval(()=>run().catch(()=>{}),500);timer.unref();return ()=>{clearInterval(timer);transport?.close?.()};
}
