const copy = {
  en: {
    settings:'Settings', workspace:'Workspace', general:'Company', brand:'Brand & quotes', portal:'Customer portal', connections:'Connections', access:'Members & billing',
    subtitle:'A workspace that feels like your business.', search:'Search settings', noResults:'No matching settings', language:'Language',
    dashboard:'Overview', quotes:'Quotations', contacts:'Customers', templates:'Templates', items:'Item library', leads:'Enquiries', reviews:'Reviews',
    company:'Company name', email:'Business email', phone:'Phone number', website:'Website', address:'Business address', currency:'Base currency', tax:'Default tax (%)', terms:'Default terms',
    details:'Company details', detailsHelp:'Your business information, used on customer quotations.', contact:'Contact information', contactHelp:'Make it easy for customers to get in touch.',
    logo:'Company logo', logoHelp:'Shown on your customer quotations. PNG, JPEG or WebP, up to 5 MB.', choose:'Upload logo', remove:'Remove',
    defaults:'Quotation defaults', defaultsHelp:'A starting point for new quotations. Existing quotations keep their saved values.',
    preview:'Quotation preview', previewHelp:'A preview of your company identity.', quoteLabel:'QUOTATION', prepared:'Prepared by',
    tenant:'Tenant', companyId:'Company ID', isolated:'Independent company workspace', isolatedHelp:'Company data and member permissions are separate from your other companies.',
    save:'Save changes', discard:'Discard', saved:'All changes saved', unsaved:'Unsaved changes', saving:'Saving…', saveSuccess:'Settings saved', leave:'Discard your unsaved settings changes?',
    domain:'Your quotation domain', domainHelp:'Give customer quotation links a familiar home.', active:'Active', pending:'Pending', failed:'Needs attention', notConnected:'Not connected',
    managed:'This domain is managed by your platform administrator. Contact support to change it.', configureDomain:'Contact your administrator to connect a custom quotation domain.', hostname:'Customer portal hostname',
    connectDomain:'Connect domain', dns:'DNS configuration', dnsHelp:'HTTPS is available after ownership and certificate validation.', checkDNS:'Check DNS & certificate', removeDomain:'Remove domain', ownership:'Ownership verification',
    xero:'Xero', xeroHelp:'Turn accepted quotations into draft invoices with a manual request.', xeroNote:'You choose when to create an invoice. Nothing is submitted automatically.', manageXero:'Manage Xero',
    agents:'AI & agent access', agentsHelp:'Connect a compatible AI agent to this company using MCP.', agentNote:'Agent tokens are scoped to this company and expire within 90 days. Review suggested quotation edits before applying them.', manageAgents:'Manage access', review:'Review proposals',
    webhooks:'Webhooks', webhooksHelp:'Connect quotation events to your own workflows.', manageWebhooks:'Configure webhooks',
    team:'Your people, your permissions', teamHelp:'Manage invitations, roles, connected mailboxes and company subscriptions in your account.', manageAccount:'Manage members & subscription',
    identity:'Workspace identity', identityHelp:'Use your Tenant ID when speaking with support.', support:'Here to help', supportHelp:'Questions about your workspace? We’re a message away.', contactSupport:'Contact support',
    addCompany:'Add company', switchCompany:'Switch company', account:'Account & mailboxes', export:'Export workspace', newQuote:'New quotation', savedIn:'Changes apply to this company only.',
    logoReady:'Logo ready. Save changes to apply it.', invalidImage:'Choose a PNG, JPEG or WebP image of at most 5 MB.',
    noProposal:'Review pending suggestions from your connected AI tools.', accountLabel:'Company account', help:'Help & support'
  },
  'zh-Hant': {
    settings:'設定', workspace:'工作區', general:'公司資料', brand:'品牌與報價', portal:'客戶網站', connections:'整合連接', access:'成員與訂閱',
    subtitle:'讓工作區展現你的公司風格。', search:'搜尋設定', noResults:'找不到相關設定', language:'語言',
    dashboard:'總覽', quotes:'報價單', contacts:'客戶', templates:'範本', items:'常用項目', leads:'客戶查詢', reviews:'客戶評價',
    company:'公司名稱', email:'商務電郵', phone:'電話號碼', website:'網站', address:'公司地址', currency:'基本貨幣', tax:'預設稅率 (%)', terms:'預設條款',
    details:'公司資料', detailsHelp:'顯示於客戶報價單上的商務資料。', contact:'聯絡資料', contactHelp:'讓客戶輕鬆聯絡你的團隊。',
    logo:'公司標誌', logoHelp:'顯示於客戶報價單。支援 PNG、JPEG 或 WebP，上限 5 MB。', choose:'上傳標誌', remove:'移除',
    defaults:'報價預設值', defaultsHelp:'用於新報價單；現有報價單會保留已儲存的內容。',
    preview:'報價外觀預覽', previewHelp:'預覽你的公司品牌資料。', quoteLabel:'報價單', prepared:'報價公司',
    tenant:'Tenant', companyId:'Company ID', isolated:'獨立公司工作區', isolatedHelp:'公司資料及成員權限與其他公司分開管理。',
    save:'儲存變更', discard:'放棄變更', saved:'所有變更已儲存', unsaved:'有未儲存的變更', saving:'儲存中…', saveSuccess:'設定已儲存', leave:'放棄尚未儲存的設定變更？',
    domain:'你的報價網域', domainHelp:'讓客戶透過熟悉的品牌連結開啟報價。', active:'已啟用', pending:'待完成', failed:'需要處理', notConnected:'未連接',
    managed:'此網域由平台管理員管理。如需變更，請聯絡支援。', configureDomain:'請聯絡管理員連接自訂報價網域。', hostname:'客戶網站網域名稱',
    connectDomain:'連接網域', dns:'DNS 設定', dnsHelp:'完成網域擁有權及憑證驗證後，即可使用 HTTPS。', checkDNS:'檢查 DNS 與憑證', removeDomain:'移除網域', ownership:'擁有權驗證',
    xero:'Xero', xeroHelp:'手動提交要求，將已接受的報價轉成發票草稿。', xeroNote:'由你決定何時建立發票，系統不會自動提交。', manageXero:'管理 Xero',
    agents:'AI 與代理程式', agentsHelp:'透過 MCP 將相容的 AI 代理程式 連接至此公司。', agentNote:'代理程式權杖只適用於此公司，有效期最長 90 天。報價修改建議須經審閱才會生效。', manageAgents:'管理連接權限', review:'審閱修改建議',
    webhooks:'Webhooks', webhooksHelp:'將報價活動連接到你的工作流程。', manageWebhooks:'設定 Webhooks',
    team:'你的團隊，你的權限', teamHelp:'在公司帳戶管理成員邀請、角色、已連接郵箱及公司訂閱。', manageAccount:'管理成員與訂閱',
    identity:'工作區識別資料', identityHelp:'聯絡支援時可提供 Tenant ID。', support:'隨時為你提供協助', supportHelp:'對工作區有疑問？歡迎聯絡我們。', contactSupport:'聯絡支援',
    addCompany:'新增公司', switchCompany:'切換公司', account:'帳戶與郵箱', export:'匯出工作區', newQuote:'新增報價', savedIn:'變更只適用於此公司。',
    logoReady:'標誌已準備好，儲存變更後生效。', invalidImage:'請選擇不超過 5 MB 的 PNG、JPEG 或 WebP 圖片。',
    noProposal:'審閱已連接 AI 工具提出的修改建議。', accountLabel:'公司帳戶', help:'協助與支援'
  },
  'zh-Hans': {
    settings:'设置', workspace:'工作区', general:'公司资料', brand:'品牌与报价', portal:'客户网站', connections:'集成连接', access:'成员与订阅',
    subtitle:'让工作区展现你的公司风格。', search:'搜索设置', noResults:'找不到相关设置', language:'语言',
    dashboard:'总览', quotes:'报价单', contacts:'客户', templates:'模板', items:'常用项目', leads:'客户咨询', reviews:'客户评价',
    company:'公司名称', email:'商务邮箱', phone:'电话号码', website:'网站', address:'公司地址', currency:'基础货币', tax:'默认税率 (%)', terms:'默认条款',
    details:'公司资料', detailsHelp:'显示在客户报价单上的商务资料。', contact:'联系资料', contactHelp:'让客户轻松联系你的团队。',
    logo:'公司标志', logoHelp:'显示在客户报价单。支持 PNG、JPEG 或 WebP，上限 5 MB。', choose:'上传标志', remove:'移除',
    defaults:'报价默认值', defaultsHelp:'用于新报价单；现有报价单会保留已保存的内容。',
    preview:'报价外观预览', previewHelp:'预览你的公司品牌资料。', quoteLabel:'报价单', prepared:'报价公司',
    tenant:'Tenant', companyId:'Company ID', isolated:'独立公司工作区', isolatedHelp:'公司数据及成员权限与其他公司分开管理。',
    save:'保存更改', discard:'放弃更改', saved:'所有更改已保存', unsaved:'有未保存的更改', saving:'保存中…', saveSuccess:'设置已保存', leave:'放弃尚未保存的设置更改？',
    domain:'你的报价域名', domainHelp:'让客户通过熟悉的品牌链接打开报价。', active:'已启用', pending:'待完成', failed:'需要处理', notConnected:'未连接',
    managed:'此域名由平台管理员管理。如需更改，请联系支持。', configureDomain:'请联系管理员连接自定义报价域名。', hostname:'客户网站域名',
    connectDomain:'连接域名', dns:'DNS 设置', dnsHelp:'完成域名所有权及证书验证后，即可使用 HTTPS。', checkDNS:'检查 DNS 与证书', removeDomain:'移除域名', ownership:'所有权验证',
    xero:'Xero', xeroHelp:'手动提交请求，将已接受的报价转换成发票草稿。', xeroNote:'由你决定何时创建发票，系统不会自动提交。', manageXero:'管理 Xero',
    agents:'AI 与代理程序', agentsHelp:'通过 MCP 将兼容的 AI 代理程序 连接至此公司。', agentNote:'代理程序令牌仅适用于此公司，有效期最长 90 天。报价修改建议须经审阅才会生效。', manageAgents:'管理连接权限', review:'审阅修改建议',
    webhooks:'Webhooks', webhooksHelp:'将报价活动连接到你的工作流程。', manageWebhooks:'设置 Webhooks',
    team:'你的团队，你的权限', teamHelp:'在公司账户管理成员邀请、角色、已连接邮箱及公司订阅。', manageAccount:'管理成员与订阅',
    identity:'工作区识别资料', identityHelp:'联系支持时可提供 Tenant ID。', support:'随时为你提供帮助', supportHelp:'对工作区有疑问？欢迎联系我们。', contactSupport:'联系支持',
    addCompany:'添加公司', switchCompany:'切换公司', account:'账户与邮箱', export:'导出工作区', newQuote:'新建报价', savedIn:'更改仅适用于此公司。',
    logoReady:'标志已准备好，保存更改后生效。', invalidImage:'请选择不超过 5 MB 的 PNG、JPEG 或 WebP 图片。',
    noProposal:'审阅已连接 AI 工具提出的修改建议。', accountLabel:'公司账户', help:'帮助与支持'
  }
};
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths = {
  dashboard:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  quotes:'M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 16h6',
  contacts:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  templates:'M8 3h12v14 M4 7h12v14H4z M7 11h6 M7 15h6', items:'M12 3 3 8v9l9 5 9-5V8z M3 8l9 5 9-5 M12 13v9 M7.5 5.5l9 5',
  settings:'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',
  leads:'M21 3 3 10l7 4 4 7 7-18z M10 14 21 3', reviews:'m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z',
  search:'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15 M16 16l5 5',
  company:'M4 21V3h11v18 M15 9h5v12 M2 21h20 M8 7h3 M8 11h3 M8 15h3 M8 21v-3h3v3',
  arrow:'M7 17 17 7 M7 7h10v10', chevron:'m9 5 7 7-7 7', check:'m5 12 4 4L19 6', plus:'M12 5v14 M5 12h14',
  globe:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18 M12 3c5 5 5 13 0 18-5-5-5-13 0-18',
  shield:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6',
  paint:'M4 4h16v12H4z M12 16v5 M8 21h8 M7 8h4 M7 12h8',
  link:'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
  spark:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
  mail:'M3 5h18v14H3z M3 5l9 7 9-7', download:'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5'
};
export const macIcon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.settings}"/></svg>`;
let tab = 'general', languageDraft = null, cleanup = () => {};
const fields = ['company','email','phone','website','address','currency','tax','terms','logoId'];
const serialize = value => JSON.stringify(fields.map(key => String(value[key] ?? '')));
const language = () => copy[localStorage.getItem('dowi-language')] ? localStorage.getItem('dowi-language') : 'en';
const words = () => copy[language()];
export function cleanupMacSettings() { cleanup(); cleanup = () => {}; }

export function macAppShell(db, activeCompanyId, view = 'settings') {
  const t = words(), company = escape(db.settings.company), tenant = escape(db.tenantId);
  document.documentElement.lang = language();
  return `<div class="mac-workspace"><aside class="mac-sidebar" aria-label="${t.workspace}">
    <a class="mac-brand" href="/${tenant}/dashboard"><span class="mac-brand-mark"><img src="/brand/dowi-quotes-mark.svg" alt="" width="37" height="37"></span><span>Dowi Quotes<small>Part of DowiSuite</small></span></a>
    <label class="mac-company-picker"><span class="mac-company-avatar">${macIcon('company')}</span><span><small>${t.workspace}</small><select id="company-switcher" aria-label="${t.switchCompany}">${(db.companies || []).map(c=>`<option value="${escape(c.id)}" ${c.id===activeCompanyId?'selected':''}>${escape(c.name)}</option>`).join('')}</select></span></label>
    <div class="mac-nav-caption">${t.workspace}</div><nav class="mac-app-nav">${['dashboard','quotes','contacts','templates','items','leads','reviews','settings'].filter(k=>!(['templates','items'].includes(k)&&db.currentUser?.permissions?.templatesItems===false)&&!(k==='settings'&&db.currentUser?.role==='member')).map(k=>`<button type="button" data-view="${k}" aria-label="${t[k]}" title="${t[k]}" class="${k===view?'selected':''}" ${k===view?'aria-current="page"':''}>${macIcon(k)}<span>${t[k]}</span>${k===view?'<i></i>':''}</button>`).join('')}</nav><a class="mac-mobile-account ${view==='account'?'selected':''}" href="/${tenant}/account" aria-label="${t.account}" title="${t.account}">${macIcon('shield')}</a>
    <button class="mac-add-company" data-action="new-company">${macIcon('plus')}${t.addCompany}</button>
    <div class="mac-sidebar-bottom"><a href="mailto:support@dayella.co">${macIcon('mail')}${t.help}${macIcon('arrow')}</a><a class="mac-account ${view==='account'?'selected':''}" href="/${tenant}/account"><span class="mac-user-avatar">${escape((db.currentUser?.email||company).slice(0,1).toUpperCase())}</span><span><strong>${company}</strong><small>${t.accountLabel}</small></span>${macIcon('chevron')}</a></div>
  </aside><div class="mac-main"><header class="mac-toolbar"><div class="mac-breadcrumb"><span>${t.workspace}</span>${macIcon('chevron')}<strong>${t[view]||t.workspace}</strong></div>${['settings','account'].includes(view)?'':`<form id="global-search-form" class="mac-global-search">${macIcon('search')}<input name="search" type="search" placeholder="${language()==='en'?'Search quotations…':language()==='zh-Hant'?'搜尋報價單…':'搜索报价单…'}" aria-label="${t.quotes}"></form>`}<div class="mac-toolbar-actions"><label class="mac-language">${macIcon('globe')}<select id="settings-language" aria-label="${t.language}">${[['en','English'],['zh-Hant','繁體中文'],['zh-Hans','简体中文']].map(([v,l])=>`<option value="${v}" ${v===language()?'selected':''}>${l}</option>`).join('')}</select></label><button class="mac-button mac-quiet" data-action="new-quote" aria-label="${t.newQuote}" title="${t.newQuote}">${macIcon('plus')}${t.newQuote}</button></div></header><div class="mac-mobile-workspace"><label>${macIcon('company')}<select id="settings-company-mobile" aria-label="${t.switchCompany}">${(db.companies||[]).map(c=>`<option value="${escape(c.id)}" ${c.id===activeCompanyId?'selected':''}>${escape(c.name)}</option>`).join('')}</select></label><button type="button" id="settings-add-company-mobile" aria-label="${t.addCompany}">${macIcon('plus')}</button></div><main id="content"></main><footer class="mac-footer"><span>Dowi Quotes · ${company}</span>${view==='account'?'':`<button class="text-button" data-action="export">${macIcon('download')}${t.export}</button>`}</footer></div></div>`;
}

export function bindMacWorkspace(render) {
  const selector=document.querySelector('#company-switcher'), mobile=document.querySelector('#settings-company-mobile');
  mobile.onchange=()=>{selector.value=mobile.value;selector.dispatchEvent(new Event('change',{bubbles:true}));mobile.value=selector.value};
  document.querySelector('#settings-add-company-mobile').onclick=()=>document.querySelector('.mac-add-company').click();
  document.querySelector('#settings-language').onchange=e=>{localStorage.setItem('dowi-language',e.target.value);render()};
}

export function macSettingsView(db) {
  const t=words(), s={...db.settings,...languageDraft}, d=db.customDomain, tenant=escape(db.tenantId), managed=d&&!d.cloudflareId;
  const input=(key,type='text',extra='')=>`<label class="mac-field"><span>${t[key]}</span><input name="${key}" type="${type}" value="${escape(s[key])}" ${extra}></label>`;
  const sectionHead=(title,description)=>`<div class="mac-card-heading"><h2>${title}</h2><p>${description}</p></div>`;
  const pane=(id,content)=>`<section id="settings-${id}" class="mac-settings-pane" role="tabpanel" aria-labelledby="tab-${id}" ${tab===id?'':'hidden'}>${content}</section>`;
  const card=(body,classes='')=>`<section class="mac-card ${classes}">${body}</section>`;
  const domainStatus=d?.status==='active'?t.active:d?.status==='failed'?t.failed:d?t.pending:t.notConnected;
  return `<div class="mac-settings-heading"><div class="mac-heading-title"><span class="mac-settings-glyph">${macIcon('settings')}</span><div><h1>${t.settings}</h1><p>${t.subtitle}</p></div></div><div class="mac-save-actions"><button type="button" id="settings-discard" class="mac-button mac-secondary" disabled>${t.discard}</button><button type="submit" form="settings-form" id="settings-save" class="mac-button mac-primary" disabled>${macIcon('check')}<span>${t.save}</span></button></div></div>
  <div class="mac-settings-command"><div class="mac-settings-search">${macIcon('search')}<input type="search" id="settings-search" placeholder="${t.search}" aria-label="${t.search}" aria-controls="settings-search-results" autocomplete="off"><kbd>⌘ K</kbd><div id="settings-search-results" class="mac-search-results" hidden></div></div><span id="settings-save-status" class="mac-save-status" role="status">${macIcon('check')}<span>${t.saved}</span></span></div>
  <nav class="mac-settings-tabs" role="tablist" aria-label="${t.settings}">${[['general','company'],['brand','paint'],['portal','globe'],['connections','link'],['access','contacts']].map(([id,icon])=>`<button id="tab-${id}" type="button" role="tab" aria-controls="settings-${id}" aria-selected="${tab===id}" tabindex="${tab===id?0:-1}" data-settings-tab="${id}">${macIcon(icon)}${t[id]}</button>`).join('')}</nav>
  <div class="mac-settings-layout"><div class="mac-settings-content"><form id="settings-form"><input type="hidden" name="logoId" value="${escape(s.logoId||'')}">
  ${pane('general',card(`<div class="mac-company-banner"><span class="mac-company-monogram">${macIcon('company')}</span><div><h2 data-company-preview>${escape(s.company)}</h2><span class="mac-tenant-label">${t.tenant} ${tenant}</span></div><span class="mac-isolation-badge">${macIcon('shield')}${t.isolated}</span></div>`)+card(sectionHead(t.details,t.detailsHelp)+`<div class="mac-fields">${input('company','text','required maxlength="200" autocomplete="organization"')}${input('website','text','autocomplete="url" placeholder="https://"')}<label class="mac-field mac-wide"><span>${t.address}</span><textarea name="address" rows="3" autocomplete="street-address">${escape(s.address||'')}</textarea></label></div>`)+card(sectionHead(t.contact,t.contactHelp)+`<div class="mac-fields">${input('email','email','autocomplete="email"')}${input('phone','tel','autocomplete="tel"')}</div>`))}
  ${pane('brand',card(sectionHead(t.logo,t.logoHelp)+`<div class="mac-logo-editor"><div class="mac-logo-well" id="settings-logo-preview">${s.logoId?`<img src="/${tenant}/api/assets/${encodeURIComponent(s.logoId)}?inline=1" alt="${t.logo}">`:`<span>${macIcon('paint')}</span>`}</div><div class="mac-logo-actions"><label class="mac-button mac-secondary mac-upload">${macIcon('plus')}${t.choose}<input type="file" id="company-logo-file" aria-label="${t.choose}" accept="image/png,image/jpeg,image/webp"></label><button type="button" class="mac-button mac-quiet" id="remove-logo" ${!s.logoId?'disabled':''}>${t.remove}</button></div></div>`)+card(sectionHead(t.defaults,t.defaultsHelp)+`<div class="mac-fields"><label class="mac-field"><span>${t.currency}</span><select name="currency">${['USD','HKD','CNY','JPY','SGD','GBP','EUR','AUD','CAD','NZD','CHF'].map(c=>`<option ${c===s.currency?'selected':''}>${c}</option>`).join('')}</select></label>${input('tax','number','min="0" max="100" step="0.01"')}<label class="mac-field mac-wide"><span>${t.terms}</span><textarea name="terms" rows="6">${escape(s.terms||'')}</textarea></label></div>`))}
  </form>
  ${pane('portal',card(`<div class="mac-service-title"><span class="mac-service-icon blue">${macIcon('globe')}</span><div><h2>${t.domain}</h2><p>${t.domainHelp}</p></div><span class="mac-status-pill ${d?.status==='active'?'good':''}">${domainStatus}</span></div>${d?`<div class="mac-domain-name">${escape(d.hostname)}</div><div class="mac-info-note">${macIcon('shield')}<p>${managed?t.managed:t.dnsHelp}</p></div><details class="mac-details"><summary>${t.dns}</summary><dl><dt>CNAME</dt><dd><code>${escape(d.hostname)}</code><span>→</span><code>${escape(d.cnameTarget||db.customDomainTarget)}</code></dd>${!managed&&d.txtName&&d.txtValue?`<dt>${t.ownership} · TXT</dt><dd><code>${escape(d.txtName)}</code><code>${escape(d.txtValue)}</code></dd>`:''}</dl></details>${managed?'':`<div class="mac-card-actions"><button class="mac-button mac-secondary" type="button" id="refresh-domain">${t.checkDNS}</button><button class="mac-button mac-quiet mac-danger" type="button" id="remove-domain">${t.removeDomain}</button></div>`}`:!db.customDomainConfigured?`<p class="mac-card-copy">${t.configureDomain}</p>`:`<form id="domain-form"><label class="mac-field"><span>${t.hostname}</span><input name="hostname" required maxlength="253" placeholder="quotes.yourcompany.com"></label><p class="mac-card-copy">CNAME → <code>${escape(db.customDomainTarget)}</code><br>${t.dnsHelp}</p><button class="mac-button mac-primary">${t.connectDomain}</button></form>`}`))}
  ${pane('connections',card(`<div class="mac-service-title"><span class="mac-service-icon xero">xero</span><div><h2>${t.xero}</h2><p>${t.xeroHelp}</p></div></div><div class="mac-service-bottom"><span>${t.xeroNote}</span><button type="button" class="mac-button mac-secondary" id="xero-settings">${t.manageXero}${macIcon('arrow')}</button></div>`)+card(`<div class="mac-service-title"><span class="mac-service-icon violet">${macIcon('spark')}</span><div><h2>${t.agents}</h2><p>${t.agentsHelp}</p></div></div><p class="mac-card-copy">${t.agentNote}</p><code class="mac-endpoint">${escape(db.mcpURL||location.origin+'/mcp')}</code><div class="mac-card-actions"><button class="mac-button mac-secondary" id="agent-settings" type="button">${t.manageAgents}</button><button class="mac-button mac-quiet" id="load-ai-proposals" type="button">${t.review}${macIcon('chevron')}</button></div><p id="ai-proposal-count" class="mac-caption">${t.noProposal}</p>`)+card(`<div class="mac-service-title"><span class="mac-service-icon orange">${macIcon('link')}</span><div><h2>${t.webhooks}</h2><p>${t.webhooksHelp}</p></div><button class="mac-button mac-secondary" type="button" id="webhooks-settings">${t.manageWebhooks}${macIcon('arrow')}</button></div>`))}
  ${pane('access',card(`<div class="mac-service-title"><span class="mac-service-icon blue">${macIcon('contacts')}</span><div><h2>${t.team}</h2><p>${t.teamHelp}</p></div></div><a class="mac-button mac-primary" href="/${tenant}/account">${t.manageAccount}${macIcon('arrow')}</a>`)+card(sectionHead(t.identity,t.identityHelp)+`<dl class="mac-identity"><dt>${t.tenant}</dt><dd>${tenant}</dd><dt>${t.companyId}</dt><dd>${escape(db.activeCompanyId)}</dd></dl><div class="mac-info-note">${macIcon('shield')}<p>${t.isolatedHelp}</p></div>`))}
  <div class="mac-settings-footnote">${macIcon('shield')}<span>${t.savedIn}</span></div></div>
  <aside class="mac-settings-aside"><section class="mac-preview-card"><div class="mac-preview-heading"><span>${t.preview}</span>${macIcon('quotes')}</div><div class="mac-paper"><div class="mac-paper-brand"><span class="mac-paper-logo">${s.logoId?`<img src="/${tenant}/api/assets/${encodeURIComponent(s.logoId)}?inline=1" alt="${t.logo}">`:macIcon('company')}</span><strong data-company-preview>${escape(s.company)}</strong></div><div class="mac-paper-rule"></div><div class="mac-paper-label">${t.quoteLabel}</div><div class="mac-paper-lines" aria-hidden="true"><i></i><i></i></div><div class="mac-paper-table" aria-hidden="true"><div></div><div></div><div></div></div><div class="mac-paper-total"><span data-currency-preview>${escape(s.currency)}</span><i aria-hidden="true"></i></div><div class="mac-paper-footer"><span>${t.prepared}</span><strong data-company-preview>${escape(s.company)}</strong><small data-email-preview>${escape(s.email)}</small></div></div><p>${t.previewHelp}</p></section>
  <section class="mac-support-card"><span class="mac-support-symbol">${macIcon('mail')}</span><h3>${t.support}</h3><p>${t.supportHelp}</p><a href="mailto:support@dayella.co">${t.contactSupport}${macIcon('arrow')}</a></section></aside></div>`;
}

export function bindMacSettings({db, api, uploadFile, refresh, toast, render}) {
  const t=words(), form=document.querySelector('#settings-form'), search=document.querySelector('#settings-search'), results=document.querySelector('#settings-search-results');
  const read=()=>Object.fromEntries(new FormData(form));
  const baseline=serialize(db.settings);
  let dirty=false, busy=false, uploading=false, blobURL=null;
  const update=()=>{
    dirty=serialize(read())!==baseline;
    form.inert=busy;
    document.querySelector('#settings-language').disabled=busy||uploading;
    document.querySelector('#settings-save').disabled=!dirty||busy||uploading;
    document.querySelector('#settings-discard').disabled=!dirty||busy||uploading;
    const status=document.querySelector('#settings-save-status');status.classList.toggle('is-dirty',dirty);
    status.querySelector('span').textContent=busy?t.saving:dirty?t.unsaved:t.saved;
    const v=read(); document.querySelectorAll('[data-company-preview]').forEach(e=>e.textContent=v.company||t.company);
    document.querySelectorAll('[data-email-preview]').forEach(e=>e.textContent=v.email);
    document.querySelectorAll('[data-currency-preview]').forEach(e=>e.textContent=v.currency);
    document.querySelector('#remove-logo').disabled=!v.logoId||uploading||busy;
  };
  const activate=id=>{
    tab=id;
    document.querySelectorAll('[data-settings-tab]').forEach(el=>{const selected=el.dataset.settingsTab===id;el.setAttribute('aria-selected',String(selected));el.tabIndex=selected?0:-1});
    document.querySelectorAll('.mac-settings-pane').forEach(el=>el.hidden=el.id!=='settings-'+id);
  };
  document.querySelectorAll('[data-settings-tab]').forEach(el=>el.onclick=()=>{activate(el.dataset.settingsTab);search.value='';results.hidden=true});
  document.querySelector('.mac-settings-tabs').onkeydown=e=>{
    const tabs=[...document.querySelectorAll('[data-settings-tab]')],current=tabs.indexOf(document.activeElement);if(current<0)return;
    let next;if(e.key==='ArrowRight')next=(current+1)%tabs.length;else if(e.key==='ArrowLeft')next=(current+tabs.length-1)%tabs.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=tabs.length-1;else return;
    e.preventDefault();tabs[next].click();tabs[next].focus();
  };
  search.oninput=()=>{
    const query=search.value.trim().toLocaleLowerCase();results.hidden=!query;if(!query)return;
    const matches=[...document.querySelectorAll('.mac-settings-pane')].filter(p=>p.textContent.toLocaleLowerCase().includes(query));
    results.innerHTML=matches.length?matches.map(p=>{const id=p.id.replace('settings-','');return `<button type="button" data-search-tab="${id}">${macIcon('settings')}<span>${t[id]}</span>${macIcon('chevron')}</button>`}).join(''):`<p role="status">${t.noResults}</p>`;
    results.querySelectorAll('button').forEach(button=>button.onclick=()=>{activate(button.dataset.searchTab);results.hidden=true;search.value='';document.querySelector('#tab-'+tab).focus()});
  };
  search.onkeydown=e=>{if(e.key==='Escape'){results.hidden=true;search.value=''}if(e.key==='ArrowDown'&&results.querySelector('button')){e.preventDefault();results.querySelector('button').focus()}};
  const shortcut=e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();search.focus()}};
  const beforeUnload=e=>{if(dirty||busy||uploading){e.preventDefault();e.returnValue=''}};
  const guard=e=>{
    const target=e.target.closest('.mac-workspace a[href]:not([href^="mailto:"]),[data-view],[data-action="settings"]');
    if(target&&((busy||uploading)||dirty&&!confirm(t.leave))){e.preventDefault();e.stopImmediatePropagation()}else if(target){dirty=false;languageDraft=null}
  };
  const switcher=document.querySelector('#company-switcher');
  const guardCompany=e=>{if(busy||uploading||dirty&&!confirm(t.leave)){e.stopImmediatePropagation();switcher.value=db.activeCompanyId}};
  document.addEventListener('keydown',shortcut);document.addEventListener('click',guard,true);window.addEventListener('beforeunload',beforeUnload);switcher.addEventListener('change',guardCompany,true);
  const mobileSwitcher=document.querySelector('#settings-company-mobile');mobileSwitcher.onchange=()=>{switcher.value=mobileSwitcher.value;switcher.dispatchEvent(new Event('change',{bubbles:true}));mobileSwitcher.value=switcher.value};
  document.querySelector('#settings-add-company-mobile').onclick=()=>document.querySelector('.mac-add-company').click();
  form.oninput=update;form.onchange=update;
  form.addEventListener('invalid',e=>{const pane=e.target.closest('.mac-settings-pane');if(pane)activate(pane.id.replace('settings-',''))},true);
  document.querySelector('#settings-discard').onclick=()=>{if(confirm(t.leave)){dirty=false;languageDraft=null;render()}};
  document.querySelector('#settings-language').onchange=e=>{
    if(busy||uploading){e.target.value=language();return}
    languageDraft=read();localStorage.setItem('dowi-language',e.target.value);render();
  };
  form.onsubmit=async e=>{
    e.preventDefault();if(busy||uploading||!dirty)return;busy=true;update();
    try{await api('settings','PUT',read());dirty=false;languageDraft=null;await refresh();toast(t.saveSuccess)}catch(error){busy=false;update();toast(error.message)}
  };
  const showLogo=url=>{
    document.querySelector('#settings-logo-preview').innerHTML=url?`<img src="${escape(url)}" alt="${t.logo}">`:`<span>${macIcon('paint')}</span>`;
    document.querySelector('.mac-paper-logo').innerHTML=url?`<img src="${escape(url)}" alt="${t.logo}">`:macIcon('company');
  };
  document.querySelector('#company-logo-file').onchange=async e=>{
    const input=e.target,file=input.files[0];if(!file)return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024){toast(t.invalidImage);input.value='';return}
    uploading=true;input.disabled=true;update();
    try{const asset=await uploadFile(file);if(!asset.type.startsWith('image/'))throw Error(t.invalidImage);form.elements.logoId.value=asset.id;if(blobURL)URL.revokeObjectURL(blobURL);blobURL=URL.createObjectURL(file);showLogo(blobURL);toast(t.logoReady)}catch(error){toast(error.message)}finally{uploading=false;input.disabled=false;input.value='';update()}
  };
  document.querySelector('#remove-logo').onclick=()=>{form.elements.logoId.value='';showLogo(null);update()};
  document.documentElement.lang=language();languageDraft=null;update();
  cleanup=()=>{if(dirty)languageDraft=read();document.removeEventListener('keydown',shortcut);document.removeEventListener('click',guard,true);window.removeEventListener('beforeunload',beforeUnload);switcher.removeEventListener('change',guardCompany,true);if(blobURL)URL.revokeObjectURL(blobURL)};
}
