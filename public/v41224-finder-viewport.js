function finderViewportLayout({screenTop,screenHeight,scale,viewportTop,viewportHeight,barHeight}){
 const top=Math.max(12,(viewportTop-screenTop)/scale+12),bottom=Math.min(screenHeight,(viewportTop+viewportHeight-screenTop)/scale)-12;
 const resultsTop=top+barHeight+8;
 return {top,resultsTop,resultsHeight:Math.max(0,bottom-resultsTop)};
}
// Browser integration: use the visible viewport, which shrinks with a mobile keyboard.
let parentFinderViewport=null;
function fitExpandedFinder(){
 const bar=$('#accountFinder'),screen=bar?.closest('.phone-screen');if(!bar||!screen||finderCompact)return;
 const frame=screen.getBoundingClientRect(),scale=frame.height/Math.max(1,screen.clientHeight)||1,v=window.visualViewport;
 const layout=finderViewportLayout({screenTop:frame.top,screenHeight:screen.clientHeight,scale,viewportTop:parentFinderViewport?.top??v?.offsetTop??0,viewportHeight:parentFinderViewport?.height??v?.height??innerHeight,barHeight:bar.offsetHeight});
 Object.assign(bar.style,{top:layout.top+'px',bottom:'auto',left:'12px',right:'12px',width:'auto',zIndex:'31'});
 const overlay=$('.finder-results-overlay');if(overlay){Object.assign(overlay.style,{top:layout.resultsTop+'px',bottom:'auto',height:layout.resultsHeight+'px',padding:'0 12px',alignItems:'stretch'});const dialog=overlay.querySelector('.finder-results-dialog');if(dialog){dialog.style.maxHeight='100%';dialog.style.overflowY='auto';}}
}
let finderViewportFrame=0;function queueFinderViewport(){if(finderViewportFrame)return;finderViewportFrame=requestAnimationFrame(()=>{finderViewportFrame=0;fitExpandedFinder();});}
const viewportPositionFinder=positionFinder;positionFinder=()=>{viewportPositionFinder();fitExpandedFinder();};
const viewportRenderFinder=renderFinder;renderFinder=()=>{viewportRenderFinder();queueFinderViewport();};
const viewportFinderResults=renderStagingFinderResults;renderStagingFinderResults=(...args)=>{const result=viewportFinderResults(...args);queueFinderViewport();return result;};
window.visualViewport?.addEventListener('resize',queueFinderViewport);window.visualViewport?.addEventListener('scroll',queueFinderViewport);window.addEventListener('resize',queueFinderViewport);
window.addEventListener('message',event=>{const p=event.data;if(event.origin!==location.origin||event.source!==parent||p?.channel!=='loanledger-v41224'||p.type!=='visible-viewport'||!Number.isFinite(p.height)||!Number.isFinite(p.top)||p.height<=0||p.top<0)return;parentFinderViewport={height:p.height,top:p.top};queueFinderViewport();});
document.addEventListener('focusin',event=>{if(event.target.id==='finderInput')queueFinderViewport();});
queueFinderViewport();
