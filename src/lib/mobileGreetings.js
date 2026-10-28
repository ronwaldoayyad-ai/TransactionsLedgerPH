import { dashboardTimeGreetings, dashboardOccasions, dashboardMovableOccasions } from './mobileGreetingCatalog'

export function greetingFor(user, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).filter(p => p.type!=='literal').map(p => [p.type,p.value]))
  const hour = Number(parts.hour)
  const period = hour>=5 && hour<12?'morning':hour>=12 && hour<18?'afternoon':'evening'
  const year = Number(parts.year)
  const lastAugust = new Date(Date.UTC(year,7,31))
  const heroes = 31-(lastAugust.getUTCDay()+6)%7
  let occasion = dashboardOccasions[`${parts.month}-${parts.day}`] || dashboardMovableOccasions[`${parts.year}-${parts.month}-${parts.day}`]
  if(parts.month==='08' && Number(parts.day)===heroes) occasion={english:'Honoring our heroes',choices:[['English','Honoring our heroes'],['Filipino','Pagpupugay sa ating mga bayani']]}
  const choices = occasion?.choices || dashboardTimeGreetings[period]
  let language = ''
  try { const saved = JSON.parse(sessionStorage.getItem('loanledger-mobile-language') || 'null');if(saved?.user===user.id) language=saved.language } catch { /* optional preference */ }
  if(!language) {
    const random = new Uint32Array(1);crypto.getRandomValues(random)
    language=dashboardTimeGreetings[period][random[0]%dashboardTimeGreetings[period].length][0]
    try {sessionStorage.setItem('loanledger-mobile-language',JSON.stringify({user:user.id,language}))} catch { /* optional preference */ }
  }
  const choice = choices.find(c => c[0]===language) || choices[0]
  return {language:choice[0],text:choice[1],english:occasion?.english || dashboardTimeGreetings[period][0][1]}
}
