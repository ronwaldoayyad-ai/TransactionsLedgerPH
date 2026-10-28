import {useEffect} from 'react'
import {Link, useLocation} from 'react-router-dom'
import legal from '../../public/legal-content.json'

// Both public routes and the borrower frame use this same policy source.
export default function PrivacyPolicy({kind='privacy'}) {
  const {hash}=useLocation()
  const isTerms=kind==='terms',title=isTerms?'Terms & Conditions':'Privacy Policy'
  const sections=isTerms?legal.terms:legal.privacy
  useEffect(()=>{const previous=document.title;document.title=title+' | LoanLedger PH';return()=>{document.title=previous}},[title])
  useEffect(()=>{const frame=requestAnimationFrame(()=>{const target=hash&&document.getElementById(hash.slice(1));if(target)target.scrollIntoView({block:'start'});else window.scrollTo(0,0)});return()=>cancelAnimationFrame(frame)},[kind,hash])
  return <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 sm:py-12">
    <article className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <Link to="/login" className="text-sm font-medium text-blue-700 underline underline-offset-2">Back to app</Link>
      <nav aria-label="Legal documents" className="my-5 flex flex-wrap gap-4 text-sm">
        <Link to="/privacy" aria-current={!isTerms?'page':undefined} className="font-semibold text-blue-700 underline underline-offset-2">Privacy Policy</Link>
        <Link to="/terms" aria-current={isTerms?'page':undefined} className="font-semibold text-blue-700 underline underline-offset-2">Terms & Conditions</Link>
      </nav>
      <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">LoanLedger PH · Updated {legal.updated}</p>
      <nav aria-label="On this page" className="my-6 rounded-xl border border-blue-100 bg-blue-50 p-4">
        <h2 className="mb-2 text-sm font-bold text-slate-800">On this page</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm">{sections.map(s=><li key={s.id}><a href={'#'+s.id} className="text-blue-800 underline underline-offset-2">{s.title}</a></li>)}</ol>
      </nav>
      <div className="space-y-8">{sections.map((s,i)=><section key={s.id} id={s.id} className="scroll-mt-5 break-words">
        <h2 className="text-lg font-semibold text-slate-900">{i+1}. {s.title}</h2>
        <p className="mt-2 text-sm leading-7 text-slate-700">{s.text}</p>
        {s.intro&&<p className="mt-3 text-sm leading-7 text-slate-700">{s.intro}</p>}
        {!!s.items?.length&&<ul className="mt-3 list-disc space-y-3 pl-5 text-sm leading-7 text-slate-700">{s.items.map((item,n)=><li key={n}>{item}</li>)}</ul>}
        {(s.paragraphs||[]).map((p,n)=><p key={n} className="mt-3 text-sm leading-7 text-slate-700">{p}</p>)}
        {s.link&&/^https:\/\//.test(s.link.url)&&<a className="mt-3 inline-block text-sm text-blue-700 underline underline-offset-2" href={s.link.url} target="_blank" rel="noopener noreferrer">{s.link.label}</a>}
      </section>)}</div>
    </article>
  </div>
}
