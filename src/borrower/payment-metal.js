// Reuse the Finder's CSS border animation without a canvas or shader runtime.
const desktop=matchMedia('(min-width:1024px)')
let host=null,scheduled=0
function syncPaymentBorder(){
 scheduled=0
 const target=desktop.matches?document.querySelector('.borrower-desktop-sidebar:not([hidden]) [data-desktop-page="payment"]'):document.querySelector('#nav:not(.hidden) [data-page="payment"] .ni')
 if(!target){host?.remove();host=null;return}
 if(!host){host=document.createElement('span');host.className='payment-finder-border';host.setAttribute('aria-hidden','true')}
 if(host.parentElement!==target)target.append(host)
 host.style.animationPlayState=document.hidden?'paused':'running'
}
function queuePaymentBorder(){if(!scheduled)scheduled=requestAnimationFrame(syncPaymentBorder)}
window.addEventListener('loanledger-screen-rendered',queuePaymentBorder)
window.addEventListener('resize',queuePaymentBorder,{passive:true})
document.addEventListener('visibilitychange',queuePaymentBorder)
window.addEventListener('pagehide',()=>{cancelAnimationFrame(scheduled);scheduled=0})
window.addEventListener('pageshow',queuePaymentBorder)
queuePaymentBorder()
