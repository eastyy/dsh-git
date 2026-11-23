/**
 * Standalone harness for the editor runtime.
 *
 * Boots the real Host half through a fake Cordis context, serves its routes plus
 * a parent page that mimics the client chrome, and leaves the browser open for
 * the CDP driver in cdp.mjs.
 */
import { createServer } from 'node:http'
import { cp, readFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { apply } from '../index.js'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, '.run/workspace')
await rm(ROOT, { recursive: true, force: true })
await cp(resolve(here, 'workspace'), ROOT, { recursive: true })
const PATH = 'fixture.html'
const PORT = Number(process.env.DHE_PORT || 8391)
const TOKEN = Buffer.from(ROOT, 'utf8').toString('base64url')

let hostHandler = null
const ctx = {
  get(name) {
    if (name === 'workspaceRegistry') return { list: () => [{ path: ROOT, updatedAt: new Date().toISOString() }] }
    if (name === 'workingDirectory') return { defaultDirectory: ROOT }
    return undefined
  },
  effect(fn) {
    return fn()
  },
  webServer: {
    register(entry) {
      hostHandler = entry.handler
      return () => {
        hostHandler = null
      }
    },
  },
  logger: { info() {} },
}

apply(ctx, { root: ROOT })
if (hostHandler === null) throw new Error('host route was not registered')

const page = (await readFile(join(here, 'harness.html'), 'utf8'))
  .replaceAll('__ROOT__', ROOT.replaceAll('\\', '\\\\'))
  .replaceAll('__PATH__', PATH)
  .replaceAll('__SRC__', `/__dsh-html-editor/fs/${TOKEN}/${PATH}`)

const server = createServer((req, res) => {
  const url = req.url || '/'
  if (url.startsWith('/__dsh-html-editor')) {
    hostHandler(req, res)
    return
  }
  if (url === '/' || url.startsWith('/harness')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    res.end(page)
    return
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('not found')
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`harness http://127.0.0.1:${PORT}/  root=${ROOT}`)
})
