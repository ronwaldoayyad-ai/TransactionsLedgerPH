import {interpolate,staticFile,useCurrentFrame,useVideoConfig} from 'remotion'

export const ILLUSTRATION_SECONDS=8
export function LoginIllustration({motionScale=1}){
  const frame=useCurrentFrame(),{fps}=useVideoConfig()
  const phase=interpolate(frame,[0,ILLUSTRATION_SECONDS*fps],[0,Math.PI*2])
  const image=<image href={staticFile('assets/login-reference.png')} width="415" height="703"/>
  return <svg viewBox="0 0 415 133" width="415" height="133" aria-hidden="true" data-frame={frame} style={{display:'block',width:'100%',height:'100%',overflow:'hidden'}}>
    <defs>
      <path id="paperShape" d="M161 52L211 29L264 56L203 94L162 70Z"/>
      <path id="shieldShape" d="M129 50L139 47L147 41L155 47L164 50L163 69L158 81L148 93L137 83L130 68Z"/>
      <path id="lockShape" fillRule="evenodd" clipRule="evenodd" d="M273 54H275V49Q275 39 284 39Q294 39 294 49V54H295Q298 54 298 58V74Q298 78 294 78H272Q269 78 269 74V58Q269 54 273 54Z M279 54H289V49Q289 43 284 43Q279 43 279 49Z"/>
      <ellipse id="coinShape" cx="211" cy="33" rx="12" ry="10"/>
      <circle id="checkShape" cx="302" cy="95" r="14"/>
      <mask id="paperMask" maskUnits="userSpaceOnUse" x="150" y="20" width="125" height="85"><use href="#paperShape" fill="white"/><use href="#coinShape" fill="black"/><use href="#shieldShape" fill="black"/></mask>
      <clipPath id="shieldClip"><use href="#shieldShape"/></clipPath><clipPath id="lockClip"><use href="#lockShape"/></clipPath><clipPath id="coinClip"><use href="#coinShape"/></clipPath><clipPath id="checkClip"><use href="#checkShape"/></clipPath>
    </defs>
    <path d="M40 78Q115 38 211 64T382 76" fill="none" stroke="#1769f5" strokeOpacity=".25" strokeDasharray="3 4"/>
    <path d="M40 102Q119 69 207 101T382 101" fill="none" stroke="#1769f5" strokeOpacity=".3"/>
    <path d="M83 100L219 79L339 103L201 124Z" fill="#e2e8f0"/><path d="M83 100L201 124L339 103V109L201 132L83 107Z" fill="#94a3b8"/>
    <g data-object="paper" transform={`translate(0 ${motionScale*interpolate(Math.sin(phase),[-1,1],[-5,5])}) rotate(${motionScale*interpolate(Math.sin(phase),[-1,1],[-2,2])} 211 62)`}><g mask="url(#paperMask)">{image}</g></g>
    <g data-object="shield" transform={`translate(${motionScale*2*Math.sin(phase)} ${motionScale*-4*Math.sin(phase)}) rotate(${motionScale*interpolate(Math.sin(phase),[-1,1],[-9,9])} 147 68)`}><g clipPath="url(#shieldClip)">{image}</g></g>
    <g data-object="lock" transform={`translate(0 ${motionScale*6*Math.sin(phase*2)})`}><g clipPath="url(#lockClip)">{image}</g></g>
    <g data-object="coin" transform={`translate(0 ${motionScale*7*Math.sin(phase*2)}) rotate(${motionScale*18*Math.sin(phase*2)} 211 33)`}><g clipPath="url(#coinClip)">{image}</g></g>
    <g data-object="check" transform={`translate(302 95) scale(${1+motionScale*interpolate(Math.sin(phase*2),[-1,1],[-.06,.16])}) translate(-302 -95)`}><g clipPath="url(#checkClip)">{image}</g></g>
  </svg>
}
