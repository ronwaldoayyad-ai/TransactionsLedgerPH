import {useEffect,useRef,useState} from 'react'
import {useApp} from '../context/AppContext'
import Icon from './Icon'
export function MagneticDots(){return <span className="magnetic-dots" aria-hidden="true">{[0,1,2,3].map(n=><i key={n} style={{'--dot':n}} />)}</span>}
export default function ProcessingFeedback(){
 const {authLoading,session,dataReady,syncError}=useApp(),[pending,setPending]=useState(0),[matrix,setMatrix]=useState(false),[closing,setClosing]=useState(false),matrixStarted=useRef(0),matrixElement=useRef(null)
 const [language,setLanguage]=useState(()=>{try{return sessionStorage.getItem('loanledger-mobile-language')||'English'}catch{return 'English'}})
 const copy=language==='Filipino'?{success:'Matagumpay ang pag-sign in',ready:'Matagumpay ang pag-sign in',preparing:'Inihahanda ang iyong Dashboard…',processing:'Pinoproseso…'}:{success:'Sign-in successful',ready:'Signed in successfully',preparing:'Preparing your Dashboard…',processing:'Processing…'}
 useEffect(()=>{const changed=event=>setLanguage(event.detail==='Filipino'?'Filipino':'English');window.addEventListener('loanledger-language',changed);return()=>window.removeEventListener('loanledger-language',changed)},[])
 useEffect(()=>{
  let armed=0,excludedUntil=0,count=0,alive=true
  const activate=e=>{const control=e.target.closest?.('button,a,[role="button"]');if(/download|upload|save image|save qr|receipt|proof|pdf/i.test(control?.textContent||control?.getAttribute('aria-label')||'')){excludedUntil=Date.now()+3000;return;}armed=Date.now()+800;}
  const nativeFetch=window.fetch
  const wrappedFetch=async(input,init)=>{const url=String(input?.url||input),documentFlow=/storage\/v1|\/assets\/|\.pdf(?:\?|$)|^blob:|^data:|\/auth\/v1\//i.test(url)||init?.body instanceof Blob||init?.body instanceof FormData;const track=Date.now()<armed&&Date.now()>excludedUntil&&!documentFlow;if(track&&alive)setPending(++count);try{return await nativeFetch(input,init)}finally{if(track&&alive)setPending(--count)}}
  window.fetch=wrappedFetch
  const authenticated=()=>{matrixStarted.current=performance.now();setClosing(false);setMatrix(true)}
  document.addEventListener('click',activate,true);document.addEventListener('submit',activate,true);window.addEventListener('loanledger-authenticated',authenticated)
  return()=>{alive=false;if(window.fetch===wrappedFetch)window.fetch=nativeFetch;document.removeEventListener('click',activate,true);document.removeEventListener('submit',activate,true);window.removeEventListener('loanledger-authenticated',authenticated)}
 },[])
 useEffect(()=>{if(matrix){matrixStarted.current=performance.now();matrixElement.current?.focus({preventScroll:true});}},[matrix])
 useEffect(()=>{let alive=true;if(matrix&&!authLoading&&(!session||session.user?.status==='disabled'))queueMicrotask(()=>{if(alive){setMatrix(false);setClosing(false)}});return()=>{alive=false}},[matrix,authLoading,session])
 useEffect(()=>{if(!matrix||(!dataReady&&!syncError))return;let exit;const timer=setTimeout(()=>{setClosing(true);exit=setTimeout(()=>{setMatrix(false);setClosing(false)},450)},Math.ceil(Math.max(0,4000-(performance.now()-matrixStarted.current))));return()=>{clearTimeout(timer);clearTimeout(exit)}},[matrix,dataReady,syncError])
 return <>{matrix&&<div className={"matrix-signin"+(closing?" is-leaving":"")} ref={matrixElement} tabIndex={-1} id="authenticatedMatrix" role="status" aria-live="polite" aria-label={copy.success}><div className="matrix-content"><div className="matrix-stage"><div className="matrix-grid" aria-hidden="true">{Array.from({length:49},(_,n)=><i key={n} style={{'--pulse':Math.floor(n/7)+n%7}} />)}</div><div className="matrix-brand"><Icon name="wallet" /></div></div><h1>LoanLedger PH</h1><p>{dataReady?copy.ready:copy.preparing}</p></div></div>}{!matrix&&(pending>0||authLoading||(session&&!dataReady&&!syncError))&&<div className="magnetic-feedback" id="appProcessingFeedback" role="status" aria-live="polite"><MagneticDots/><span>{copy.processing}</span></div>}</>
}
