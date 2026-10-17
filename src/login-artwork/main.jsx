import {useEffect,useMemo,useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {Player} from '@remotion/player'
import {staticFile} from 'remotion'
import {LoginIllustration,ILLUSTRATION_SECONDS} from './Illustration'

export function IllustrationError(){useEffect(()=>parent.postMessage({channel:'loanledger-login-artwork',type:'failed'},location.origin),[]);return null}

export function IllustrationPlayer(){
  const player=useRef(null),[loaded,setLoaded]=useState(false)
  const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [onScreen,setOnScreen]=useState(true),[tabVisible,setTabVisible]=useState(()=>document.visibilityState==='visible')
  const playing=onScreen&&tabVisible
  const inputProps=useMemo(()=>({motionScale:reduced ? 0.3 : 1}),[reduced])
  useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)'),change=()=>setReduced(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change)},[])
  useEffect(()=>{let active=true;const image=new Image();image.onload=()=>{if(active)setLoaded(true)};image.src=staticFile('assets/login-reference.png');return()=>{active=false}},[])
  useEffect(()=>{const observer=new IntersectionObserver(([entry])=>setOnScreen(entry.isIntersecting));observer.observe(document.documentElement);const change=()=>setTabVisible(document.visibilityState==='visible');document.addEventListener('visibilitychange',change);return()=>{observer.disconnect();document.removeEventListener('visibilitychange',change)}},[])
  useEffect(()=>{if(!loaded)return;if(playing)player.current?.play();else player.current?.pause()},[loaded,playing])
  useEffect(()=>{if(loaded)parent.postMessage({channel:'loanledger-login-artwork',type:'ready'},location.origin)},[loaded])
  return <div style={{position:'relative',width:'100%',height:'100%'}} data-engine="remotion" data-playing={playing} data-motion={reduced?'gentle':'full'}>
    {loaded&&<Player ref={player} component={LoginIllustration} inputProps={inputProps} durationInFrames={ILLUSTRATION_SECONDS*30} fps={30} compositionWidth={415} compositionHeight={133} autoPlay={playing} loop initiallyMuted numberOfSharedAudioTags={0} controls={false} clickToPlay={false} allowFullscreen={false} style={{width:'100%',height:'100%'}} errorFallback={()=> <IllustrationError/>}/>}
  </div>
}

createRoot(document.getElementById('root')).render(<IllustrationPlayer/> )
