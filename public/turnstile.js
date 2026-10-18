let configuration, scriptPromise, checking=false;
export function configureTurnstile(value){configuration=value}

function loadScript(){
 if(window.turnstile)return Promise.resolve();
 if(scriptPromise)return scriptPromise;
 scriptPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  const timer=setTimeout(()=>failed(),15000);
  function failed(){clearTimeout(timer);script.remove();scriptPromise=undefined;reject(Error('Unable to load the security check. Check your connection and try again.'))}
  script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async=true;script.onload=()=>{clearTimeout(timer);resolve()};script.onerror=failed;
  document.head.append(script);
 });
 return scriptPromise;
}

export function submissionAction(url,method){
 if(method!=='POST')return null;
 if(url==='lead-form')return 'enquiry';
 const match=url.match(/^shared\/[^/]+\/(accept|decline|messages|reviews)$/);
 return match?{accept:'quote_accept',decline:'quote_decline',messages:'quote_question',reviews:'quote_review'}[match[1]]:null;
}

export async function verificationToken(action){
 if(!configuration)throw Error('Reload this page before submitting.');
 if(!configuration.enabled)return null;
 if(checking)throw Error('A security check is already in progress.');
 checking=true;
 const dialog=document.createElement('dialog');dialog.className='security-check';
 dialog.setAttribute('aria-labelledby','security-check-title');
 dialog.innerHTML='<h2 id="security-check-title">Security check</h2><p role="status">Please complete the browser check to continue.</p><div class="security-widget"></div><button type="button" class="button primary" data-retry hidden>Retry verification</button> <button type="button" class="button secondary" data-cancel>Cancel</button>';
 document.body.append(dialog);dialog.showModal();
 let widget,timer,closed=false;
 try{
  return await new Promise((resolve,reject)=>{
   const fail=message=>reject(Error(message));
   const status=dialog.querySelector('[role="status"]'),retry=dialog.querySelector('[data-retry]');
   const waiting='Please complete the browser check to continue. Your submission has not been sent yet.';
   function recover(message){if(closed)return;clearTimeout(timer);status.textContent=message+' Your submission has not been sent. Click Retry verification to try again.';retry.hidden=false}
   function startTimer(){clearTimeout(timer);timer=setTimeout(()=>recover('Verification is taking longer than expected.'),120000)}
   dialog.querySelector('[data-cancel]').onclick=()=>fail('Submission cancelled.');
   dialog.addEventListener('cancel',event=>{event.preventDefault();fail('Submission cancelled.')});
   retry.onclick=()=>{if(widget===undefined||closed)return;retry.hidden=true;status.textContent=waiting;startTimer();try{window.turnstile.reset(widget)}catch{recover('Unable to restart the security check. Reload this page if it continues.')}};
   startTimer();
   loadScript().then(()=>{
    if(closed)return;
    widget=window.turnstile.render(dialog.querySelector('.security-widget'),{
     sitekey:configuration.siteKey,action,language:'auto',theme:'light',
     callback:token=>{if(!closed)resolve(token)},'error-callback':code=>{const safe=/^[0-9]{3,8}$/.test(String(code))?` (Cloudflare ${code})`:'';recover('Security check failed'+safe+'.');return true},
     'expired-callback':()=>recover('Security check expired.'),
     'timeout-callback':()=>recover('Security check timed out.')
    });
   }).catch(reject);
  });
 }finally{
  closed=true;clearTimeout(timer);
  if(widget!==undefined)window.turnstile.remove(widget);
  dialog.close();dialog.remove();checking=false;
 }
}
