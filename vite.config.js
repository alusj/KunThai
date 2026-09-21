import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { qrcode } from 'vite-plugin-qrcode'

// Production resolves the flat /api/* URLs through vercel.json, but vite dev
// never reads that file. Mirror its literal /api/ rewrites so a local call
// lands on the same handler it would hit on Vercel. Only plain-path sources
// are taken; the regex catch-all is a build concern, not a dev one.
function readApiRewrites(root) {
  try {
    const { rewrites = [] } = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8'))
    return new Map(
      rewrites
        .filter(({ source }) => /^\/api\/[a-zA-Z0-9/-]+$/.test(source))
        .map(({ source, destination }) => [source, destination]),
    )
  } catch {
    // Without vercel.json only the on-disk paths resolve, which is still
    // enough for every handler that has a file of its own.
    return new Map()
  }
}

// Mirror Vercel's file routing: an exact api/<path>.js, otherwise the
// directory's [param].js router. The payments and cron endpoints were folded
// into such routers to stay under the Hobby function cap, so without this the
// dev server keeps looking for files that no longer exist.
async function resolveApiHandler(server, pathname) {
  const segments = pathname
    .slice('/api/'.length)
    .split('/')
    .map((segment) => segment.replace(/[^a-zA-Z0-9-]/g, ''))
    .filter(Boolean)
  if (!segments.length) return null

  // Existence is checked before loading: ssrLoadModule prints the failure
  // itself, so probing a missing file spams the terminal on every 404.
  const load = async (file) => {
    if (!existsSync(file)) return null
    const module = await server.ssrLoadModule(pathToFileURL(file).href)
    return typeof module.default === 'function' ? module.default : null
  }

  const apiDir = resolve(server.config.root, 'api')
  const exact = await load(resolve(apiDir, `${segments.join('/')}.js`))
  if (exact) return { handler: exact, params: {} }
  if (segments.length < 2) return null

  const directory = resolve(apiDir, ...segments.slice(0, -1))
  if (!existsSync(directory)) return null
  const dynamic = readdirSync(directory).find((file) => /^\[[a-zA-Z]+\]\.js$/.test(file))
  if (!dynamic) return null

  const handler = await load(resolve(directory, dynamic))
  if (!handler) return null
  const param = dynamic.match(/^\[([a-zA-Z]+)\]\.js$/)[1]
  return { handler, params: { [param]: segments[segments.length - 1] } }
}

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
      const rewrites = readApiRewrites(server.config.root)

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

        let route
        try {
          route = await resolveApiHandler(server, rewrites.get(url.pathname) || url.pathname)
        } catch {
          return next()
        }
        if (!route) return next()

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
          await route.handler(
            Object.assign(req, { body, query: { ...Object.fromEntries(url.searchParams), ...route.params } }),
            response,
          )
        } catch (error) {
          console.error(`[dev api] ${url.pathname} failed`, error)
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
