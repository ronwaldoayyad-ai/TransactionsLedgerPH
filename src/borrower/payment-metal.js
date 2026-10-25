// Same Paper Liquid Metal shader used by the Vengeance UI reference, mounted only on Payments.
import {ShaderMount,liquidMetalFragmentShader,getShaderColorFromString} from '@paper-design/shaders'

const reduced=matchMedia('(prefers-reduced-motion: reduce)'),desktop=matchMedia('(min-width:1024px)')
let mount=null,host=null,scheduled=0,unavailable=false
function syncPaymentMetal(){
 scheduled=0
 const target=desktop.matches?document.querySelector('.borrower-desktop-sidebar:not([hidden]) [data-desktop-page="payment"]'):document.querySelector('#nav:not(.hidden) [data-page="payment"] .ni')
 if(!target){mount?.dispose();mount=null;host?.remove();host=null;return}
 if(!host){host=document.createElement('span');host.className='payment-metal-border';host.setAttribute('aria-hidden','true')}
 if(host.parentElement!==target)target.append(host)
 host.classList.toggle('is-static',reduced.matches||unavailable)
 if(reduced.matches){mount?.dispose();mount=null;return}
 if(!mount&&!unavailable){
  try{mount=new ShaderMount(host,liquidMetalFragmentShader,{
   u_colorBack:getShaderColorFromString('#7183a2'),u_colorTint:getShaderColorFromString('#e4efff'),
   u_repetition:4,u_softness:0,u_shiftRed:.3,u_shiftBlue:-.3,u_distortion:.15,u_contour:0,u_angle:45,u_shape:0,u_isImage:false,
   u_fit:2,u_scale:1,u_rotation:0,u_offsetX:0,u_offsetY:0,u_originX:.5,u_originY:.5,u_worldWidth:0,u_worldHeight:0,
  },{alpha:true,antialias:false,powerPreference:'low-power'},.4,0,1,32768)
  }catch{unavailable=true;host.replaceChildren();host.classList.add('is-static')}
 }
 // ShaderMount also pauses while offscreen. One instance is reused across desktop tab changes.
 mount?.setSpeed(document.hidden?0:.4)
}
function queuePaymentMetal(){if(!scheduled)scheduled=requestAnimationFrame(syncPaymentMetal)}
window.addEventListener('loanledger-screen-rendered',queuePaymentMetal)
window.addEventListener('resize',queuePaymentMetal,{passive:true})
document.addEventListener('visibilitychange',queuePaymentMetal)
reduced.addEventListener('change',queuePaymentMetal)
window.addEventListener('pagehide',()=>{cancelAnimationFrame(scheduled);scheduled=0;mount?.dispose();mount=null})
window.addEventListener('pageshow',queuePaymentMetal)
queuePaymentMetal()
