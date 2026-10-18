const copy={
 en:{title:'Your server. Your quotations.',body:'This Web edition is free to self-host under AGPL-3.0. You provide hosting, storage and email. The official iOS app is a separate proprietary product; paid private-server access is managed by Dowi.',source:'Source code',ios:'Ask about iOS access'},
 'zh-Hant':{title:'你的伺服器，你的報價。',body:'此網頁版採用 AGPL-3.0，可免費自架。伺服器、儲存及電郵由你提供。官方 iOS App 為獨立專有產品，私服連接授權由 Dowi 管理。',source:'原始碼',ios:'查詢 iOS 授權'},
 'zh-Hans':{title:'你的服务器，你的报价。',body:'此网页版采用 AGPL-3.0，可免费自建。服务器、存储及邮件由你提供。官方 iOS App 为独立专有产品，私服连接授权由 Dowi 管理。',source:'源代码',ios:'咨询 iOS 授权'}
};
export function renderEdition(language='en'){const c=copy[language]||copy.en;return `<section class="card"><h2>${c.title}</h2><p>${c.body}</p><p><a href="/source">${c.source}</a> · <a href="mailto:support@dayella.co">${c.ios}</a></p></section>`}
