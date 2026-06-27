import { useEffect, useState } from 'react'

// Full-screen sign-in splash (≈5s). The progress bar + chase animation are CSS;
// the playful status line cycles here. Styles live in index.css (.splash-*).
const PHRASES = [
  { time: 0, text: 'Deploying collections squad…' },
  { time: 1300, text: 'Borrower spotted! Pursuing…' },
  { time: 2500, text: 'Running calculations…' },
  { time: 3800, text: 'Securing the perimeter…' },
  { time: 4600, text: 'Ledger balanced. Ready!' },
]

export default function LoadingScreen() {
  const [text, setText] = useState(PHRASES[0].text)

  useEffect(() => {
    const timers = PHRASES.slice(1).map((p) => setTimeout(() => setText(p.text), p.time))
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <div className="splash-screen" role="status" aria-live="polite" aria-label="Signing you in">
      <div className="splash-circle">
        <div className="splash-ring" />

        <div className="splash-brand">
          <div className="splash-title-wrap">
            <h1 className="splash-name">
              LoanLedger <span>PH</span>
            </h1>
          </div>
          <p className="splash-tagline">Simplify. Track. Succeed.</p>
        </div>

        <div className="splash-stage" aria-hidden="true">
          <div className="splash-loop">
            <div className="splash-char splash-lender">🏃‍♂️</div>
            <div className="splash-char splash-borrower">🏃💨</div>
          </div>
        </div>

        <div className="splash-footer">
          {/* key restarts the fade each time the phrase changes */}
          <div key={text} className="splash-text">{text}</div>
          <div className="splash-progress-wrap">
            <div className="splash-progress-bar" />
          </div>
        </div>
      </div>
    </div>
  )
}
