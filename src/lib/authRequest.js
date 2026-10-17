export const AUTH_REQUEST_TIMEOUT_MS = 20000

// Limit authentication/profile requests without cutting off document uploads.
export async function fetchAuthentication(input, init, fetcher = fetch, timeoutMs = AUTH_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController()
  let abortListener
  const cancelled = new Promise((_resolve, reject) => {
    abortListener = () => reject(controller.signal.reason)
    controller.signal.addEventListener('abort', abortListener, { once: true })
  })
  const upstream = init?.signal || (typeof Request !== 'undefined' && input instanceof Request ? input.signal : undefined)
  const forwardAbort = () => controller.abort(upstream.reason)
  if (upstream?.aborted) forwardAbort()
  else upstream?.addEventListener('abort', forwardAbort, { once: true })
  // AbortError prevents the data SDK from silently retrying a timed-out
  // profile GET and extending the interactive sign-in deadline repeatedly.
  const timer = setTimeout(() => controller.abort(new DOMException('Sign-in timed out. Check your connection and try again.', 'AbortError')), timeoutMs)
  const request = async () => {
    if (controller.signal.aborted) throw controller.signal.reason
    const response = await fetcher(input, { ...init, signal: controller.signal })
    // Include a stalled response body in the deadline. Auth/profile bodies are
    // small; the original response stays intact for the SDK to consume.
    if (typeof response?.clone === 'function') await response.clone().arrayBuffer()
    return response
  }
  try { return await Promise.race([request(), cancelled]) }
  finally {
    clearTimeout(timer)
    upstream?.removeEventListener('abort', forwardAbort)
    controller.signal.removeEventListener('abort', abortListener)
  }
}
