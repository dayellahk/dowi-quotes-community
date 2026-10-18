import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('customer verification stays open after delay or failure and requires fresh verification after retry',async()=>{
 const timers=new Set(),dialogs=[];let callbacks,resets=0,removes=0;
 const context={setTimeout(fn){timers.add(fn);return fn},clearTimeout(fn){timers.delete(fn)},
  document:{body:{append(){}},createElement(){
   const nodes={'[role="status"]':{},'[data-retry]':{hidden:true},'[data-cancel]':{},'.security-widget':{}};
   const dialog={nodes,setAttribute(){},showModal(){this.open=true},close(){this.open=false},remove(){this.removed=true},querySelector(s){return nodes[s]},addEventListener(type,fn){this[type]=fn}};dialogs.push(dialog);return dialog;
  }},window:{turnstile:{render(_element,options){callbacks=options;return 'widget'},reset(){resets++},remove(){removes++}}}};
 const source=fs.readFileSync(new URL('../public/turnstile.js',import.meta.url),'utf8').replaceAll('export ','');
 vm.runInNewContext(source+';globalThis.api={configureTurnstile,verificationToken}',context);
 context.api.configureTurnstile({enabled:true,siteKey:'public-test-key'});
 let settled=false;const pending=context.api.verificationToken('quote_question');pending.then(()=>settled=true,()=>settled=true);await Promise.resolve();
 const dialog=dialogs[0];assert.equal(callbacks.action,'quote_question');
 [...timers][0]();await Promise.resolve();assert.equal(settled,false);assert.equal(dialog.open,true);assert.equal(dialog.nodes['[data-retry]'].hidden,false);
 callbacks['error-callback']('600010');assert.match(dialog.nodes['[role="status"]'].textContent,/Cloudflare 600010/);assert.equal(settled,false);
 dialog.nodes['[data-retry]'].onclick();assert.equal(resets,1);assert.equal(dialog.nodes['[data-retry]'].hidden,true);
 callbacks['timeout-callback']();assert.equal(dialog.open,true);assert.equal(dialog.nodes['[data-retry]'].hidden,false);
 dialog.nodes['[data-retry]'].onclick();callbacks.callback('fresh-token');assert.equal(await pending,'fresh-token');assert.equal(dialog.open,false);assert.equal(dialog.removed,true);assert.equal(removes,1);assert.equal(timers.size,0);
 const cancelled=context.api.verificationToken('quote_question');await Promise.resolve();const rejection=assert.rejects(cancelled,/cancelled/);dialogs[1].nodes['[data-cancel]'].onclick();await rejection;assert.equal(removes,2);
});
