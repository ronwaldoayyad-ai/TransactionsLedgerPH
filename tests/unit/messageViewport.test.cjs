const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../public/v41224-message-viewport.js'),'utf8');
function fixture({height=844,navTop=769,cardTop=147,offsetTop=0,device='actualweb',orbTop=null}={}) {
  const frames=[],listeners={},viewportListeners={},styles={};let calls=0;
  const classes={};
  const card={getBoundingClientRect:()=>({top:cardTop}),style:{setProperty:(key,value)=>styles[key]=value},classList:{toggle:(key,value)=>classes[key]=value}};
  const viewport={height,offsetTop,addEventListener:(key,value)=>viewportListeners[key]=value};
  const document={querySelector:()=>card,getElementById:id=>id==='deviceHolder'?{dataset:{device}}:id==='dashboardOrbitTrigger'?(orbTop==null?null:{getBoundingClientRect:()=>({top:orbTop,height:60})}):{classList:{contains:()=>false},getBoundingClientRect:()=>({top:navTop})}};
  const context={document,window:{visualViewport:viewport,innerHeight:height,addEventListener:(key,value)=>listeners[key]=value},requestAnimationFrame:callback=>frames.push(callback),render:()=>++calls};
  vm.runInNewContext(source,context);return {context,frames,listeners,viewportListeners,viewport,styles,classes,flush:()=>{while(frames.length)frames.shift()();},calls:()=>calls};
}
test('chat uses the space above fixed navigation, including a twelve pixel gap',()=>{const f=fixture();f.flush();assert.equal(f.styles['--chat-available-height'],'610px');});
test('keyboard viewport constrains chat even when navigation is below the keyboard',()=>{const f=fixture({height:430});f.flush();assert.equal(f.styles['--chat-available-height'],'271px');f.viewport.height=380;f.viewportListeners.resize();f.flush();assert.equal(f.styles['--chat-available-height'],'221px');});
test('render and viewport events coalesce without polling or replacing render results',()=>{const f=fixture();assert.equal(f.context.render(),1);assert.equal(f.context.render(),2);f.listeners.resize();f.viewportListeners.scroll();assert.equal(f.frames.length,1);f.flush();assert.equal(f.calls(),2);});
test('device mockups are not changed',()=>{const f=fixture({device:'mobileweb'});f.flush();assert.deepEqual(f.styles,{});});
test('visible orb also stays below the composer instead of intercepting Send',()=>{const f=fixture({orbTop:691});f.flush();assert.equal(f.styles['--chat-available-height'],'532px');});
test('small keyboard space hides optional context, then the chat header if necessary',()=>{const tight=fixture({height:430,orbTop:352});tight.flush();assert.equal(tight.classes['chat-viewport-tight'],true);assert.equal(tight.classes['chat-viewport-compact'],false);const compact=fixture({height:320,orbTop:242});compact.flush();assert.equal(compact.classes['chat-viewport-compact'],true);});
