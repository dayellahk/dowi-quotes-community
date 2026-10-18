import {test} from 'node:test';
import assert from 'node:assert/strict';
import {acceptQuote,itemAmounts,lineItem,publicQuote,totals} from '../lib/domain.mjs';

test('discounted quantity uses net unit price and calculates costs and gross profit',()=>{
 const item=lineItem({id:'service-1',name:'Design service',qty:16,price:491.15,cost:200,discountType:'percent',discountValue:6,editableQuantity:true});
 const amounts=itemAmounts(item);
 assert.equal(amounts.unitPrice,461.68);
 assert.equal(amounts.discount,471.52);
 assert.equal(amounts.revenue,7386.88);
 assert.equal(amounts.cost,3200);
 assert.equal(totals({items:[item],tax:0}).margin,4186.88);
 assert.equal(totals({items:[item],tax:0}).marginPercent,4186.88/7386.88*100);
});

test('recurring quote totals cover all billing periods and customer acceptance saves editable quantity',()=>{
 const item=lineItem({id:'subscription-1',name:'Support',qty:1,price:100,cost:40,discountType:'amount',discountValue:10,editableQuantity:true,repeatUnit:'month',repeatEvery:1,repeatCount:16});
 const q={id:'quote-1',number:1001,title:'Support plan',status:'Sent',created:'2026-01-01T00:00:00.000Z',expires:'2027-01-01T00:00:00.000Z',tax:10,notes:'',terms:'',items:[item],activity:[],token:'private',messages:[]};
 assert.deepEqual(itemAmounts(item),{discount:160,revenue:1440,cost:640,unitPrice:90,periods:16});
 assert.equal(totals(q).total,1584);
 acceptQuote(q,{name:'Customer',agreed:true,selected:[0],quantities:{'subscription-1':2}});
 assert.equal(q.items[0].qty,2);
 assert.equal(totals(q).subtotal,2880);
 const share=publicQuote(q);
 assert.equal(share.items[0].cost,undefined);
 assert.equal(share.items[0].discountValue,10);
 assert.equal(share.items[0].repeatCount,16);
 assert.equal(share.items[0].editableQuantity,true);
});
