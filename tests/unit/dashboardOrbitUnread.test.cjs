const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('public/v41224-dashboard-orbit.js','utf8');
function helpers(){const context={};vm.createContext(context);vm.runInContext(source.slice(0,source.indexOf('// Dashboard presentation')),context);return context;}

test('orb counts only unread incoming lender messages for its current borrower',()=>{
 const {dashboardOrbitUnreadCount:count}=helpers();
 const messages=[{borrowerId:'a',fromAdmin:true,readAt:null},{borrowerId:'a',fromAdmin:true},{borrowerId:'a',fromAdmin:true,readAt:'2026-10-19'},{borrowerId:'a',fromAdmin:false},{borrowerId:'b',fromAdmin:true},{sender:'assistant'},null];
 assert.equal(count(messages,'a'),2);assert.equal(count(messages,'b'),1);
 assert.equal(count(messages,null),0);assert.equal(count(null,'a'),0);assert.equal(count([], 'a'),0);
 messages[0].readAt='2026-10-19';messages[1].readAt='2026-10-19';assert.equal(count(messages,'a'),0);
});

test('badge caps its visible width while retaining the full accessible count',()=>{
 const {dashboardOrbitBadgeText:label}=helpers();assert.equal(label(1),'1');assert.equal(label(99),'99');assert.equal(label(100),'99+');
});

test('both badges update from read status, hide at zero and clear on sign-out',()=>{
 const badges=Object.fromEntries(['#dashboardOrbitUnread','#dashboardOrbitLenderUnread'].map(id=>[id,{hidden:true,textContent:''}]));
 const buttons=Object.fromEntries(['#dashboardOrbitTrigger','[data-orbit-action="lender"]'].map(id=>[id,{setAttribute(key,value){this[key]=value;}}]));
 let eligible=true;
 const c={...helpers(),dashboardOrbitRoot:{querySelector:id=>badges[id]||buttons[id]},dashboardOrbitEligible:()=>eligible,stagingData:{user:{id:'a'},messages:[{borrowerId:'a',fromAdmin:true,readAt:null}]},preferredLanguage:'English',dashboardOrbitPhase:'closed'};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('function syncDashboardOrbitUnread(){'),source.indexOf('function syncDashboardOrbit(){')),c);
 c.syncDashboardOrbitUnread();for(const badge of Object.values(badges)){assert.equal(badge.hidden,false);assert.equal(badge.textContent,'1');}
 assert.match(buttons['#dashboardOrbitTrigger']['aria-label'],/Open.*1 unread message from lender/);
 c.dashboardOrbitPhase='open';c.syncDashboardOrbitUnread();assert.match(buttons['#dashboardOrbitTrigger']['aria-label'],/Close.*1 unread/);assert.equal(c.stagingData.messages[0].readAt,null);
 c.stagingData.messages[0].readAt='2026-10-19';c.syncDashboardOrbitUnread();for(const badge of Object.values(badges)){assert.equal(badge.hidden,true);assert.equal(badge.textContent,'');}
 c.stagingData.messages[0].readAt=null;eligible=false;c.syncDashboardOrbitUnread();assert.equal(badges['#dashboardOrbitUnread'].hidden,true);
});

test('badges use the existing realtime snapshot render and do not mark reads when opening the fan',()=>{
 assert.match(source,/orbitOriginalRender\(\);syncDashboardOrbit\(\)/);
 assert.doesNotMatch(source.slice(source.indexOf('function openDashboardOrbit(){'),source.indexOf('function finishDashboardOrbitClose')),/message-read/);
 assert.match(source,/badge\.setAttribute\('aria-hidden','true'\)/);
 const css=fs.readFileSync('public/v41224-dashboard-orbit.css','utf8');assert.match(css,/orbit-unread-badge\[hidden\]\{display:none!important\}/);assert.match(css,/pointer-events:none/);
});
