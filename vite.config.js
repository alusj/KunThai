import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { qrcode } from 'vite-plugin-qrcode'

// Vercel serves everything in `api/` as a serverless function in production,
// but `vite dev` knows nothing about them, so locally every /api/* call used to
// fall through to index.html. This dev-only plugin runs the same handler files
// in-process, which is what makes features like KAI testable before a
// deploy. It is `apply: 'serve'`, so the production build never sees it.
function kunthaiDevApi() {
  return {
    name: 'kunthai-dev-api',
    apply: 'serve',
    configureServer(server) {
      // Vite only exposes VITE_-prefixed values to the app; API handlers read
      // real server variables from process.env, so load .env for the dev
      // process. Never bundled — this runs in the Node dev server only.
      for (const file of ['.env', '.env.local']) {
        try {
          const contents = readFileSync(resolve(server.config.root, file), 'utf8')
          for (const line of contents.split('\n')) {
            const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
            if (!match || line.trim().startsWith('#')) continue
            const [, key, rawValue] = match
            if (process.env[key] !== undefined) continue
            process.env[key] = rawValue.replace(/^["']|["']$/g, '')
          }
        } catch {
          // A missing env file just means those handlers report themselves
          // unavailable, exactly as they would on a misconfigured deploy.
        }
      }

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost')
        if (!url.pathname.startsWith('/api/')) return next()

        const name = url.pathname.slice('/api/'.length).replace(/[^a-zA-Z0-9-]/g, '')
        if (!name) return next()

        let handler
        try {
          const module = await server.ssrLoadModule(
            pathToFileURL(resolve(server.config.root, 'api', `${name}.js`)).href,
          )
          handler = module.default
        } catch {
          return next()
        }
        if (typeof handler !== 'function') return next()

        const body = await new Promise((resolveBody) => {
          const chunks = []
          req.on('data', (chunk) => chunks.push(chunk))
          req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8')
            if (!raw) return resolveBody({})
            try {
              resolveBody(JSON.parse(raw))
            } catch {
              resolveBody({})
            }
          })
          req.on('error', () => resolveBody({}))
        })

        // The minimum of the Vercel response shape the handlers actually use.
        const response = Object.assign(res, {
          status(code) {
            res.statusCode = code
            return response
          },
          json(payload) {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(payload))
            return payload
          },
          send(payload) {
            res.end(typeof payload === 'string' ? payload : JSON.stringify(payload))
            return payload
          },
        })

        try {
          await handler(Object.assign(req, { body, query: Object.fromEntries(url.searchParams) }), response)
        } catch (error) {
          console.error(`[dev api] ${name} failed`, error)
          if (!res.writableEnded) {
            res.statusCode = 500
            res.end(JSON.stringify({ ok: false, message: 'Dev API handler failed.' }))
          }
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), qrcode(), kunthaiDevApi()],
  build: {
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks: {
          maps: ['maplibre-gl'],
          motion: ['framer-motion'],
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          vendor: ['lucide-react', 'react-icons', 'lottie-react'],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
  },
})
