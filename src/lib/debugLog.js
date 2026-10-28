// SDK failure objects can contain query details. Never log them in production.
export function debugError(...args) { if (import.meta.env.DEV) console.error(...args) }
export function debugWarn(...args) { if (import.meta.env.DEV) console.warn(...args) }
