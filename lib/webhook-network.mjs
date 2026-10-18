import dns from 'node:dns';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';

export function publicAddress(address){
 if(net.isIP(address)===4){
  const [a,b,c]=address.split('.').map(Number);
  return !(a===0||a===10||a===127||a>=224||a===100&&b>=64&&b<=127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===88&&c===99)||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);
 }
 if(net.isIP(address)===6){
  const [first,second]=address.toLowerCase().split(':').map(part=>parseInt(part||'0',16));
  // Global unicast only. Reject mapped IPv4, NAT64, local, multicast,
  // documentation, Teredo, 6to4 and IETF protocol-assignment ranges.
  return first>=0x2000&&first<=0x3fff&&first!==0x2002&&!(first===0x2001&&(second<=0x1ff||second===0xdb8));
 }
 return false;
}
export const allowPrivateWebhooks=(env=process.env)=>env.NODE_ENV!=='production'||env.WEBHOOK_ALLOW_PRIVATE==='true';
export function webhookURL(value,{allowPrivate=allowPrivateWebhooks()}={}){
 const url=new URL(value),host=url.hostname.replace(/^\[|\]$/g,'');
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Use an HTTP(S) webhook URL without embedded credentials');
 if(!allowPrivate&&(url.protocol!=='https:'||net.isIP(host)&&!publicAddress(host)))throw Error('Production webhooks require HTTPS and a public destination');
 return url;
}
export function postWebhook(value,body,headers,{allowPrivate=allowPrivateWebhooks(),lookup=dns.lookup}={}){
 const url=webhookURL(value,{allowPrivate});
 return new Promise((resolve,reject)=>{
  const checkedLookup=(hostname,options,callback)=>lookup(hostname,{all:true,verbatim:true},(error,addresses)=>{
   if(error)return callback(error);
   if(!addresses?.length||addresses.some(entry=>!publicAddress(entry.address)))return callback(Error('Webhook DNS resolved to a non-public address'));
   // Resolve and validate at connection time, including every retry. The socket
   // connects to these addresses; there is no separate unvalidated lookup.
   if(options?.all)return callback(null,addresses);
   const selected=addresses.find(entry=>!options?.family||entry.family===options.family);
   if(!selected)return callback(Error('Webhook address family is unavailable'));
   callback(null,selected.address,selected.family);
  });
  const transport=url.protocol==='https:'?https:http;
  const req=transport.request(url,{method:'POST',headers:{...headers,'Content-Length':Buffer.byteLength(body)},signal:AbortSignal.timeout(10000),...(!allowPrivate?{lookup:checkedLookup}:{})},res=>{
   res.resume();resolve({status:res.statusCode,ok:res.statusCode>=200&&res.statusCode<300});
  });
  // The core HTTP client does not follow redirects or return response bodies.
  req.on('error',reject);req.end(body);
 });
}
