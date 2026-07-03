// Public privacy policy page — required by the App Store / Play Store
// listings for the mobile app. No auth; linked from App Store Connect.
const SECTIONS = [
  {
    h: 'Who we are',
    p: `LoanLedger PH is a private loan-ledger service that lets an individual lender and their
invited borrowers track loan schedules, payments, and account communications. Access is by
invitation only — there is no public registration.`,
  },
  {
    h: 'Information we collect',
    p: `We store only what is needed to service your loan account: your name, email address, phone
number, and optional profile photo; your loan, installment, and payment records; proof-of-payment
files you upload (images or PDFs); messages you exchange with your lender inside the app; and basic
security logs of account activity.`,
  },
  {
    h: 'How we use it',
    p: `Your information is used solely to operate your loan account: showing your schedules and
balances, verifying payments you submit, sending you in-app announcements, and keeping an audit
trail. We do not sell, rent, or share your personal information with third parties, and we do not
use it for advertising.`,
  },
  {
    h: 'Camera and photos',
    p: `The mobile app asks for camera or photo-library access only when you choose to attach a
proof of payment or update your profile photo. Files you attach are uploaded to private storage
and are visible only to you and your lender.`,
  },
  {
    h: 'Where your data lives',
    p: `Data is stored with Supabase (our database and file-storage provider) behind row-level
security: each borrower can only ever read their own records. Payment-proof files are kept in
private buckets and served through short-lived signed links.`,
  },
  {
    h: 'Retention and deletion',
    p: `Records are kept for as long as your loan account is active or as required for bookkeeping.
You may request correction or deletion of your personal data at any time by contacting your lender
or emailing the address below; deletion requests are honoured except where records must be retained
to document a completed transaction.`,
  },
  {
    h: 'Contact',
    p: `For any privacy question or request, email ronayyad@gmail.com.`,
  },
]

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="text-3xl font-bold text-slate-900">Privacy Policy</h1>
        <p className="mt-1 text-sm text-slate-500">LoanLedger PH · Last updated July 3, 2026</p>
        <div className="mt-8 space-y-8">
          {SECTIONS.map((s) => (
            <section key={s.h}>
              <h2 className="text-lg font-semibold text-slate-900">{s.h}</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{s.p}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
