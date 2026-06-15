// Probes the Supabase project to confirm the migration has been applied.
// Run: node supabase/verify-schema.cjs
const SUPABASE_URL = 'https://ckbpdrucyogsjatnmvvu.supabase.co'
const SUPABASE_PUBLIC_KEY = 'sb_publishable_J4Ir9Ww2QNoZSlmv8ALfig_Eej1BXWb'

const TABLES = ['profiles', 'loans', 'transactions', 'transactions_effective', 'payments', 'audit_log']

async function check(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: SUPABASE_PUBLIC_KEY, Authorization: `Bearer ${SUPABASE_PUBLIC_KEY}` },
  })
  const body = await res.text()
  if (res.ok) return { table, ok: true, note: 'exists (RLS active — anon sees no rows)' }
  let code = ''
  try { code = JSON.parse(body).code ?? '' } catch { /* not json */ }
  return { table, ok: false, note: `${res.status} ${code || body.slice(0, 80)}` }
}

;(async () => {
  console.log(`Probing ${SUPABASE_URL} ...\n`)
  let allOk = true
  for (const t of TABLES) {
    const r = await check(t)
    allOk = allOk && r.ok
    console.log(`${r.ok ? '✓' : '✗'} ${t.padEnd(24)} ${r.note}`)
  }
  console.log(allOk ? '\nSchema verified — all tables reachable.' : '\nSchema not (fully) applied yet — run supabase/migrations/20260612000000_initial_schema.sql in the SQL Editor.')
})()
