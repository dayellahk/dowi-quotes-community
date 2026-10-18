let loading;
function load(language){
 if(window.turnstile?.render)return Promise.resolve();
 if(loading)return loading;
 loading=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  const timer=setTimeout(fail,15000);
  function fail(){clearTimeout(timer);script.remove();loading=undefined;reject(Error('Unable to load Cloudflare verification. Please reload and try again.'))}
  window.dowiTurnstileReady=()=>{clearTimeout(timer);resolve()};
  script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?onload=dowiTurnstileReady&render=explicit';
  script.async=true;script.defer=true;script.onerror=fail;document.head.append(script);
 });
 return loading;
}
export async function mountLoginVerification(container,config,language,report){
 const words={en:{required:'Please complete the Cloudflare verification before signing in.',expired:'Verification expired. Please tick the checkbox again.',error:'Cloudflare verification failed. Please reload and try again.'},'zh-Hant':{required:'請先完成 Cloudflare 人機驗證，再登入。',expired:'驗證已過期，請重新勾選。',error:'Cloudflare 驗證失敗，請重新載入再試。'},'zh-Hans':{required:'请先完成 Cloudflare 人机验证，再登录。',expired:'验证已过期，请重新勾选。',error:'Cloudflare 验证失败，请重新加载再试。'}};
 const text=words[language]||words.en;
 await load(language);
 if(!container.isConnected)return null;
 let token='';
 const widget=window.turnstile.render(container,{sitekey:config.siteKey,action:'login',appearance:'always',theme:'light',size:'flexible',language:{'zh-Hant':'zh-TW','zh-Hans':'zh-CN'}[language]||'en',callback:value=>{token=value;report('')},'expired-callback':()=>{token='';report(text.expired)},'error-callback':()=>{token='';report(text.error)}});
 return {response(){if(!token)throw Error(text.required);return token},reset(){token='';window.turnstile.reset(widget)},destroy(){token='';window.turnstile.remove(widget);container.remove()}};
}
