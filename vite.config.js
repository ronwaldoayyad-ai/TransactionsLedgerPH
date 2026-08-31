import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Split heavy third-party libs into their own long-lived chunks so a code
    // change in app source doesn't bust their browser cache, and so the big,
    // rarely-changing dependencies download in parallel with the app shell.
    rollupOptions: {
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
