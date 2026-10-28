import {Component,useEffect,useState} from 'react'
import {createRoot} from 'react-dom/client'
import Aurora from '../components/Aurora'
import './background.css'

const LOGIN_AURORA_COLORS=['#1769f5','#08b996','#6757d6']

class AuroraFallback extends Component{
  state={failed:false}
  static getDerivedStateFromError(){return {failed:true}}
  render(){return this.state.failed?null:this.props.children}
}

export function LoginAurora(){
  const [dark,setDark]=useState(false)
  const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [visible,setVisible]=useState(()=>!document.hidden)
  useEffect(()=>{
    const media=matchMedia('(prefers-reduced-motion: reduce)'),motion=()=>setReduced(media.matches),visibility=()=>setVisible(!document.hidden)
    const theme=event=>{if(event.origin!==location.origin||event.source!==parent||event.data?.channel!=='loanledger-login-aurora'||event.data.type!=='theme'||typeof event.data.dark!=='boolean')return;setDark(event.data.dark)}
    media.addEventListener('change',motion);document.addEventListener('visibilitychange',visibility);window.addEventListener('message',theme)
    parent.postMessage({channel:'loanledger-login-aurora',type:'ready'},location.origin)
    return()=>{media.removeEventListener('change',motion);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('message',theme)}
  },[])
  return <div className="login-aurora-root" aria-hidden="true" data-motion={reduced?'static':'flowing'}>
    <AuroraFallback><Aurora colorStops={LOGIN_AURORA_COLORS} speed={0.45} amplitude={0.65} blend={0.65} height={0.85} glow={0.35} brightness={0.9} layers={2} opacity={dark?0.6:0.38} lightMode={!dark} mouseInteraction={false} intro={false} paused={reduced||!visible} dpr={1.25}/></AuroraFallback>
  </div>
}

createRoot(document.getElementById('root')).render(<LoginAurora/> )
