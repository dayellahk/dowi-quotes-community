import {mountTwoFactor} from './two-factor-settings.js';
import {macAppShell,bindMacWorkspace} from './settings-design.js';
import {renderEdition} from './edition.js';
const tenantPath=location.pathname.match(/^\/(\d+)(?:\/|$)/);
import {mountLoginVerification} from './login-verification.js';
const words={en:{title:'Your quotes, connected.',intro:'Sign in to your company workspace.',google:'Continue with Google',microsoft:'Continue with Microsoft',unavailable:'Setup in progress',account:'Account & mailboxes',connect:'Connect mailbox',disconnect:'Disconnect',logout:'Sign out',workspace:'Open workspace',members:'Team members',add:'Add member',remove:'Remove',email:'Email address',backup:'Backup',notReady:'Your workspace sign-in is being configured. Please check back shortly.',cancelled:'Sign-in was cancelled.',connected:'Connected',reconnect:'Reconnect required'},'zh-Hant':{title:'報價，隨時掌握。',intro:'登入你嘅公司工作區。',google:'使用 Google 登入',microsoft:'使用 Microsoft 登入',unavailable:'設定中',account:'帳戶與郵箱',connect:'連接郵箱',disconnect:'解除連接',logout:'登出',workspace:'開啟工作區',members:'團隊成員',add:'新增成員',remove:'移除',email:'電郵地址',backup:'備份',notReady:'工作區登入正在設定，請稍後再試。',cancelled:'已取消登入。',connected:'已連接',reconnect:'需要重新連接'},'zh-Hans':{title:'报价，随时掌握。',intro:'登录你的公司工作区。',google:'使用 Google 登录',microsoft:'使用 Microsoft 登录',unavailable:'设置中',account:'账户与邮箱',connect:'连接邮箱',disconnect:'解除连接',logout:'退出登录',workspace:'打开工作区',members:'团队成员',add:'添加成员',remove:'移除',email:'电子邮箱地址',backup:'备份',notReady:'工作区登录正在设置，请稍后再试。',cancelled:'已取消登录。',connected:'已连接',reconnect:'需要重新连接'}};
let language=localStorage.getItem('dowi-language')||'en';let t=words[language]||words.en;
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function request(path,method='GET',body){const r=await fetch((tenantPath?'/'+tenantPath[1]:'')+'/api/'+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Object.assign(Error(d.error||'Request failed'),{status:r.status});return d}
let captcha,busy=false;
function report(e){$('#status').textContent=e.message}
async function start(provider,intent='login'){
 if(busy)return;busy=true;$('#status').textContent='';
 const buttons=[...document.querySelectorAll('[data-provider],[data-connect]')];const states=buttons.map(b=>b.disabled);buttons.forEach(b=>b.disabled=true);
 try{const token=captcha?.response();const returnTo=new URLSearchParams(location.search).get('returnTo')||'';const result=await request('auth/start','POST',{provider,intent,returnTo,tenant:new URLSearchParams(location.search).get('tenant')||tenantPath?.[1]||'',...(token?{'cf-turnstile-response':token}:{})});location.assign(result.url)}catch(e){report(e)}finally{captcha?.reset();busy=false;buttons.forEach((b,i)=>b.disabled=states[i])}
}
async function addCaptcha(config){
 if(!config?.enabled){captcha=null;return}
 const container=document.createElement('div');container.style.margin='16px 0';$('#content').prepend(container);
 captcha=await mountLoginVerification(container,config,language,message=>report(Error(message)));
}

async function mountAccountWorkspace() {
 const db=await request('workspace'), account=document.querySelector('main.account');
 document.body.classList.add('mac-app','mac-account-page');
 document.querySelector('#app').innerHTML=macAppShell(db,db.activeCompanyId,'account');
 const slot=document.querySelector('#content');slot.id='account-page';slot.append(account);
 document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>location.assign('/'+db.tenantId+'/'+button.dataset.view));
 document.querySelector('#company-switcher').onchange=e=>{const company=db.companies.find(c=>c.id===e.target.value);if(company)location.assign('/'+company.tenantCode+'/account')};
 bindMacWorkspace(()=>{language=localStorage.getItem('dowi-language')||'en';render().catch(report)});
}

async function render(){captcha?.destroy();captcha=null;t=words[language]||words.en;document.documentElement.lang=language;$('#language').value=language;$('#title').textContent=t.title;$('#intro').textContent=t.intro;$('#status').textContent='';const config=await request('auth/config');
 if(location.pathname==='/login'&&config.localAccounts){
  const c=localWords[language]||localWords.en;$('#intro').textContent=c.login;
  $('#content').innerHTML=`<form id="local-login"><input name="email" type="email" autocomplete="username" required placeholder="${c.email}" aria-label="${c.email}"><input name="password" type="password" autocomplete="current-password" required placeholder="${c.password}" aria-label="${c.password}"><button class="button primary">${c.login}</button></form>`;
  await addCaptcha(config.turnstile);$('#local-login').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{const result=await request('auth/local-login','POST',{...Object.fromEntries(new FormData(e.target)),'cf-turnstile-response':captcha?.response()});location.assign(result.url||'/')}catch(error){report(error);captcha?.reset();button.disabled=false}};return;
 }
 if(location.pathname==='/login'){$('#content').innerHTML=config.providers.map(p=>`<button class="button ${p.enabled?'primary':'secondary'}" data-provider="${p.id}" ${p.enabled?'':'disabled'}>${t[p.id]}${p.enabled?'':' · '+t.unavailable}</button>`).join('');if(!config.providers.some(p=>p.enabled))$('#status').textContent=t.notReady;if(location.search.includes('cancelled'))$('#status').textContent=t.cancelled;document.querySelectorAll('[data-provider]').forEach(b=>b.onclick=()=>start(b.dataset.provider));await addCaptcha(config.turnstile);const link=document.createElement('a');link.href='/self-hosted.html';link.textContent=language==='zh-Hant'?'免費自行部署網頁版 →':language==='zh-Hans'?'免费自行部署网页版 →':'Free self-hosted web →';$('#content').append(link);return}
 const {user,mailboxes}=await request('auth/me');await mountAccountWorkspace();$('#title').textContent=t.account;$('#intro').textContent=user.email+(tenantPath?' · Tenant '+tenantPath[1]:'');
 $('#content').innerHTML=`<a href="${tenantPath?'/'+tenantPath[1]+'/dashboard':'/'}">${t.workspace} →</a>`+config.providers.map(p=>{const box=mailboxes.find(b=>b.provider===p.id);return `<div class="row"><strong>${esc(p.id)}</strong><p>${box?esc(box.email)+' · '+(box.status==='Connected'?t.connected:t.reconnect):''}</p><button class="button secondary" data-connect="${p.id}" ${p.enabled?'':'disabled'}>${t.connect}</button>${box?`<button class="text-button" data-disconnect="${p.id}">${t.disconnect}</button>`:''}</div>`}).join('')+`<section id="backup" class="account-backup"></section>${user.role==='owner'?`<h2>${t.members}</h2><div id="members"></div><form id="add"><input name="email" type="email" required placeholder="${t.email}"><button class="button secondary">${t.add}</button></form>`:''}<button id="logout" class="button secondary">${t.logout}</button>`;
 await addCaptcha(config.turnstile);
 document.querySelectorAll('[data-connect]').forEach(b=>b.onclick=()=>start(b.dataset.connect,'mail'));document.querySelectorAll('[data-disconnect]').forEach(b=>b.onclick=async()=>{try{await request('mailboxes/'+b.dataset.disconnect,'DELETE');await render()}catch(e){report(e)}});
 $('#logout').onclick=async()=>{await request('auth/logout','POST',{});location.assign('/login')};
 if(user.role==='owner')await renderCompanyAdmin();
 addLocalAccountControls(config,user);
 const security=document.createElement('section');security.className='row';$('#content').insertBefore(security,$('#logout'));await mountTwoFactor(security,request,language);
 try{const b=await request('backup/status');$('#backup').textContent=t.backup+': '+(b.lastSuccess||b.status)}catch{}
}

const localWords={en:{password:'Password (16–256 characters)',login:'Sign in to your private server',save:'Set password',current:'Current password',change:'Change my password',saved:'Password saved. Sign in again.',email:'Server account email'},'zh-Hant':{password:'密碼（16–256 個字元）',login:'登入私有伺服器',save:'設定密碼',current:'目前密碼',change:'更改我的密碼',saved:'密碼已儲存，請重新登入。',email:'伺服器帳戶電郵'},'zh-Hans':{password:'密码（16–256 个字符）',login:'登录私有服务器',save:'设置密码',current:'当前密码',change:'更改我的密码',saved:'密码已保存，请重新登录。',email:'服务器账户邮箱'}};
function addLocalAccountControls(config,user){
 const c=localWords[language]||localWords.en;
 if(!config.localAccounts)return;
 const form=document.createElement('form');form.className='row';
 form.innerHTML=`<h3>${c.change}</h3><input name="currentPassword" type="password" autocomplete="current-password" required placeholder="${c.current}" aria-label="${c.current}"><input name="password" type="password" minlength="16" maxlength="256" autocomplete="new-password" required placeholder="${c.password}" aria-label="${c.password}"><button class="button secondary">${c.change}</button>`;
 form.onsubmit=async e=>{e.preventDefault();try{await request('auth/local-password','POST',Object.fromEntries(new FormData(form)));location.assign('/login')}catch(error){report(error)}};$('#content').append(form);
 const add=$('#add');if(add){const input=document.createElement('input');input.name='password';input.type='password';input.minLength=16;input.maxLength=256;input.autocomplete='new-password';const hint=language==='zh-Hant'?'新帳戶初始密碼；已有帳戶請留空':language==='zh-Hans'?'新账户初始密码；已有账户请留空':'Initial password for new accounts; leave blank for existing accounts';input.placeholder=hint;input.setAttribute('aria-label',hint);add.insertBefore(input,add.querySelector('button'));
 document.querySelectorAll('#members .row').forEach(row=>{const selector=row.querySelector('[data-member-role]');if(!selector||selector.dataset.memberRole===user.id)return;const button=document.createElement('button');button.type='button';button.textContent=c.save;row.append(button);button.onclick=()=>{button.disabled=true;const form=document.createElement('form');form.innerHTML=`<input name="password" type="password" minlength="16" maxlength="256" autocomplete="new-password" required aria-label="${c.password}" placeholder="${c.password}"><button class="button secondary">${c.save}</button>`;row.append(form);form.onsubmit=async e=>{e.preventDefault();try{await request('members/'+selector.dataset.memberRole+'/password','POST',Object.fromEntries(new FormData(form)));await render()}catch(error){report(error)}}};});}
}
const adminWords={en:{roles:'Roles & permissions',name:'Role name',templates:'Templates & Items',stats:'Show monetary values in stats',save:'Save role',create:'Create role',subscription:'Company subscription',monthly:'per month / tenant',users:'users including administrators',cname:'Custom quotation domain (CNAME)',current:'Current plan',inactive:'No active subscription',setup:'In-app purchases are being configured',manage:'Manage your subscription in the iOS app',role:'Role'},'zh-Hant':{roles:'角色與權限',name:'角色名稱',templates:'範本與常用項目',stats:'顯示統計金額',save:'儲存角色',create:'新增角色',subscription:'公司訂閱',monthly:'每月／Tenant',users:'位用戶（包括管理員）',cname:'自訂報價網域（CNAME）',current:'目前方案',inactive:'未有有效訂閱',setup:'App 內購買正在設定',manage:'請在 iOS App 管理訂閱',role:'角色'},'zh-Hans':{roles:'角色与权限',name:'角色名称',templates:'模板与常用项目',stats:'显示统计金额',save:'保存角色',create:'添加角色',subscription:'公司订阅',monthly:'每月／Tenant',users:'位用户（包括管理员）',cname:'自定义报价域名（CNAME）',current:'当前方案',inactive:'没有有效订阅',setup:'App 内购买正在设置',manage:'请在 iOS App 管理订阅',role:'角色'}};
async function renderCompanyAdmin(){
 const a=adminWords[language]||adminWords.en;
 const [members,roles,billing]=await Promise.all([request('members'),request('roles'),request('edition')]);
 const options=selected=>roles.map(r=>`<option value="${esc(r.id)}" ${r.id===selected?'selected':''}>${esc(r.name)}</option>`).join('');
 $('#members').innerHTML=`<p>${billing.seatsUsed} / ${billing.seats} ${a.users}</p>`+members.filter(m=>m.active).map(m=>`<div class="row">${esc(m.email)} <select aria-label="${a.role}" data-member-role="${esc(m.id)}">${options(m.roleId)}</select> ${m.role==='owner'?'':`<button data-remove="${esc(m.id)}">${t.remove}</button>`}</div>`).join('');
 const rolePicker=document.createElement('select');rolePicker.name='roleId';rolePicker.setAttribute('aria-label',a.role);rolePicker.innerHTML=options('sales');$('#add').insertBefore(rolePicker,$('#add button'));$('#add button').disabled=billing.seatsUsed>=billing.seats;
 $('#add').onsubmit=async e=>{e.preventDefault();try{await request('members','POST',Object.fromEntries(new FormData(e.target)));await render()}catch(e){report(e)}};
 document.querySelectorAll('[data-member-role]').forEach(el=>el.onchange=async()=>{try{await request('members/'+el.dataset.memberRole,'PATCH',{roleId:el.value});await render()}catch(e){report(e)}});
 document.querySelectorAll('[data-remove]').forEach(el=>el.onclick=async()=>{try{await request('members/'+el.dataset.remove,'DELETE');await render()}catch(e){report(e)}});
 const panel=document.createElement('section');panel.className='account-plan-settings';
 const roleForm=r=>`<form class="row" data-role-form="${esc(r.id||'')}"><label>${a.name}<input name="name" value="${esc(r.name||'')}" required maxlength="80"></label><label><input type="checkbox" name="templatesItems" ${r.templatesItems?'checked':''}> ${a.templates}</label><label><input type="checkbox" name="statsValues" ${r.statsValues?'checked':''}> ${a.stats}</label><button class="button secondary">${r.id?a.save:a.create}</button></form>`;
 panel.innerHTML=`${renderEdition(language)}<h2 class="account-section-title">${a.roles}</h2><p>Admin: ${a.templates} · ${a.stats}</p>${roles.filter(r=>!r.immutable).map(roleForm).join('')}${roleForm({})}`;
 $('#content').insertBefore(panel,$('#logout'));
 panel.querySelectorAll('[data-role-form]').forEach(form=>form.onsubmit=async e=>{e.preventDefault();const f=new FormData(form),id=form.dataset.roleForm;try{await request('roles'+(id?'/'+id:''),id?'PUT':'POST',{name:f.get('name'),templatesItems:f.has('templatesItems'),statsValues:f.has('statsValues')});await render()}catch(e){report(e)}});
}

$('#language').onchange=e=>{language=e.target.value;localStorage.setItem('dowi-language',language);render().catch(report)};render().catch(e=>{if(e.status===401)location.assign('/login');else report(e)});
