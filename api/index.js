import createApiHandler from '../server/web-api.cjs'
import getRuntime from '../server/vercel-runtime.cjs'

export default { fetch: createApiHandler(getRuntime) }
