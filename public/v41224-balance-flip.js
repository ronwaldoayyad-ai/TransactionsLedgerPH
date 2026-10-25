// Commit the selected balance immediately; animate only an inert visual copy and the card.
(() => {
 let active=null;
 function clearFlip(){
  const state=active;if(!state)return;active=null;
  clearTimeout(state.timer);state.fold?.cancel();state.unfold?.cancel();state.layer.remove();
  state.card.style.opacity=state.opacity;state.card.classList.remove('is-balance-flipping');
 }
 const previousSetmode=setmode;
 setmode=value=>{
  const next=Number(value);if(![0,1].includes(next)||next===mode)return;
  clearFlip();const card=document.querySelector('#balance'),direction=next>mode?1:-1;
  const animate=page==='dashboard'&&card&&typeof card.animate==='function'&&!document.hidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
  let ghost,rect;
  if(animate){rect=card.getBoundingClientRect();ghost=card.cloneNode(true);ghost.removeAttribute('id');ghost.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));ghost.querySelectorAll('*').forEach(node=>{for(const attribute of [...node.attributes])if(attribute.name.startsWith('on'))node.removeAttribute(attribute.name);});ghost.inert=true;ghost.setAttribute('aria-hidden','true');ghost.classList.add('balance-flip-ghost');Object.assign(ghost.style,{left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',boxSizing:'border-box'});}
  previousSetmode(next);
  if(!animate||!card.isConnected||page!=='dashboard')return;
  const layer=document.createElement('div');layer.className='balance-flip-layer desktop-primary-column';layer.inert=true;layer.setAttribute('aria-hidden','true');layer.append(ghost);document.body.append(layer);
  const state={card,layer,opacity:card.style.opacity,fold:null,unfold:null,timer:null};active=state;state.timer=setTimeout(clearFlip,800);card.style.opacity='0';card.classList.add('is-balance-flipping');
  try{
   state.fold=ghost.animate([{transform:'perspective(1100px) rotateY(0deg)'},{transform:'perspective(1100px) rotateY('+(-90*direction)+'deg)'}],{duration:180,easing:'cubic-bezier(.55,0,.85,.45)',fill:'both'});
   state.fold.finished.then(()=>{
    if(active!==state||!card.isConnected){if(active===state)clearFlip();return;}
    layer.remove();card.style.opacity=state.opacity;
    state.unfold=card.animate([{transform:'perspective(1100px) rotateY('+(90*direction)+'deg)'},{transform:'perspective(1100px) rotateY(0deg)'}],{duration:230,easing:'cubic-bezier(.16,1,.3,1)',fill:'both'});
    state.unfold.finished.then(()=>{if(active===state)clearFlip();}).catch(()=>{if(active===state)clearFlip();});
   }).catch(()=>{if(active===state)clearFlip();});
  }catch{clearFlip();}
 };
 const previousRender=render;render=()=>{clearFlip();previousRender();};
 window.addEventListener('resize',clearFlip);
 window.addEventListener('scroll',clearFlip,{capture:true,passive:true});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clearFlip();});
 window.addEventListener('pagehide',clearFlip);
 matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',clearFlip);
})();
