export function quoteMatchesStatus(q,filter,now=Date.now()){
 const open=['Sent','Viewed'].includes(q.status),expired=open&&Date.parse(q.expires)<=now,active=open&&!expired;
 switch(filter){
 case 'All':case 'All quotes':case 'Any Status':return true;
 case 'Open':case 'Awaiting Acceptance':return active;
 case 'To follow up':return active&&(q.followups||[]).some(f=>!f.done);
 case 'Unanswered Questions':return !!q.messages?.length&&!q.messages.at(-1).staff;
 case 'Unopened':return active&&!(q.views>0);
 case 'Live, past 24 hours':{const last=Date.parse(q.lastViewed);return active&&Number.isFinite(last)&&last<=now&&last>=now-86400000;}
 case 'Expired':return expired;
 case 'Editing':return q.status==='Draft'&&!!q.firstSent;
 case 'Draft':return q.status==='Draft'&&!q.firstSent;
 case 'Completed':return q.status==='Accepted'&&q.progress==='Complete';
 default:return q.status===filter;
 }
}
