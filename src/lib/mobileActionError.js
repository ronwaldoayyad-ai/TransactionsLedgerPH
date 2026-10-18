export function mobileActionError(action,error) {
  const message=error?.message||'Unable to save. Please retry.'
  if(action!=='payment-submit')return message
  if(/row.level security|JWT.*(expired|invalid)|active sign.in|session.*(ended|expired)|sign in again/i.test(message))return 'Your sign-in or access has changed. Sign in again before retrying. Your draft has been kept.'
  if(/fetch|network|timed? out|timeout/i.test(message))return 'Your payment could not be confirmed. Your draft has been kept. Check Recent Payments before retrying with the same details.'
  return message
}
