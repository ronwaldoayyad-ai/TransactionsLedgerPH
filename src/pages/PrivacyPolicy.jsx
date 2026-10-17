import legal from '../../public/legal-content.json'

// Public route and borrower frame share the same policy content.
export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-slate-50 px-6 py-12">
      <article className="mx-auto w-full max-w-2xl">
        <h1 className="text-3xl font-bold text-slate-900">Privacy Policy</h1>
        <p className="mt-1 text-sm text-slate-500">LoanLedger PH · Updated {legal.updated}</p>
        <div className="mt-8 space-y-8">
          {legal.privacy.map((section,i) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold text-slate-900">{i+1}. {section.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{section.text}</p>
              {section.link&&<a className="text-sm text-blue-700 underline" href={section.link.url} target="_blank" rel="noopener noreferrer">{section.link.label}</a>}
            </section>
          ))}
        </div>
      </article>
    </div>
  )
}
