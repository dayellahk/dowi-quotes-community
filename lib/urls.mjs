export function normalizePortalURL(value){
 let url;try{url=new URL(value)}catch{throw Error('Enter a valid HTTP(S) customer portal URL')}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('Use an HTTP(S) customer portal URL without credentials, query or fragment');
 return url.href.replace(/\/+$/,'');
}
