const code=value=>typeof value==='string'&&/^[A-Z]{3}$/.test(value);
export function createExchange(sql,fetcher=globalThis.fetch){
 return {async rate(from,to){
  if(!code(from)||!code(to))throw Object.assign(Error('Currency codes must use three uppercase letters'),{status:400});
  if(from===to)return {from,to,rate:1,date:new Date().toISOString().slice(0,10),source:'same currency'};
  const pair=`${from}/${to}`,cached=sql.prepare('SELECT rate,rate_date AS date,updated FROM fx_cache WHERE pair=?').get(pair);
  if(cached&&Date.now()-cached.updated<6*60*60*1000)return {from,to,rate:cached.rate,date:cached.date,source:'Frankfurter daily reference rate',cached:true};
  const response=await fetcher(`https://api.frankfurter.dev/v2/rate/${from.toLowerCase()}/${to.toLowerCase()}`,{signal:AbortSignal.timeout(6000),headers:{Accept:'application/json'}});
  if(!response.ok){await response.body?.cancel();throw Object.assign(Error(response.status===404?'No reference rate is available for this currency pair':'Exchange-rate service is temporarily unavailable'),{status:response.status===404?422:503})}
  const data=await response.json();if(data.base!==from||data.quote!==to||!Number.isFinite(data.rate)||data.rate<=0||typeof data.date!=='string')throw Object.assign(Error('Exchange-rate service returned invalid data'),{status:502});
  sql.prepare('INSERT INTO fx_cache(pair,rate,rate_date,updated) VALUES(?,?,?,?) ON CONFLICT(pair) DO UPDATE SET rate=excluded.rate,rate_date=excluded.rate_date,updated=excluded.updated').run(pair,data.rate,data.date,Date.now());
  return {from,to,rate:data.rate,date:data.date,source:'Frankfurter daily reference rate',cached:false};
 }};
}
