import { defineConfig, loadEnv } from 'vite'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const require=createRequire(import.meta.url)
const clientBuildConfig={name:'validate-client-build',configResolved(config){
  if(config.command==='build')require('./tools/validate-client-build.cjs')({...loadEnv(config.mode,config.envDir,'VITE_'),...process.env})
}}
const localOrigin=process.env.LOCAL_PUBLIC_ORIGIN || 'http://127.0.0.1:5173'
const localCompanion={name:'local-staging-flows',configureServer(server){
  const env=loadEnv(server.config.mode,process.cwd(),'')
  if((process.env.VITE_APP_ENV||env.VITE_APP_ENV)!=='local')return
  const {handler,active,startNotificationWorker}=require('./server/local-flow-service.cjs')
  startNotificationWorker()
  const {createPawcheebelsHandler}=require('./server/pawcheebels.cjs')
  const assistant=createPawcheebelsHandler({origin:localOrigin,authenticate:active,env:{...env,...process.env}})
  server.middlewares.use('/local-flow',(req,res)=>{if(req.headers.host!==new URL(localOrigin).host){res.writeHead(403);res.end();return;}if(req.url.startsWith('/pawcheebels/'))return assistant(req,res);handler(req,res)})
}}
export default defineConfig({
  plugins: [clientBuildConfig,react(), tailwindcss(),localCompanion],
  resolve: {alias: {'@':resolve(process.cwd(),'src')}},
  server: {
    // The borrower-facing server must not restart an active screen as assets
    // are published. Development sessions retain HMR unless explicitly disabled.
    hmr: process.env.APP_LIVE_RELOAD === 'false' ? false : undefined,
    watch: { ignored: ['**/test-results/**', '**/playwright-report/**', '**/graphify-out/**'] },
    proxy: process.env.VITE_APP_ENV === 'local' ? {
      '/local-supabase': {target:'http://127.0.0.1:54321',changeOrigin:true,ws:true,rewrite:path=>path.replace(/^\/local-supabase/, '')},
    } : {},
  },
  build: {
    // Split heavy third-party libs into their own long-lived chunks so a code
    // change in app source doesn't bust their browser cache, and so the big,
    // rarely-changing dependencies download in parallel with the app shell.
    rollupOptions: {
      input: {app:resolve(process.cwd(),'index.html'),loginIllustration:resolve(process.cwd(),'login-illustration.html')},
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          // PDF stack (jspdf + autotable + its html2canvas/dompurify deps) is
          // only reachable from the Invoices pages — keep it isolated so it's
          // fetched on demand, never in the initial payload.
          if (/jspdf|html2canvas|dompurify|canvg|core-js/.test(id)) return 'vendor-pdf'
          if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts'
          if (id.includes('@supabase')) return 'vendor-supabase'
          if (/react-router|react-dom|\/react\//.test(id)) return 'vendor-react'
        },
      },
    },
  },
})
