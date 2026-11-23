/**
 * Browser-level integration check for the editor runtime.
 *
 * Drives the harness page with the Chrome DevTools Protocol: selects a heading,
 * edits its text, recolors it, deletes and undoes, then saves and verifies both
 * the browser DOM and the file on disk.
 */
import { spawn } from 'node:child_process'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { cp } from 'node:fs/promises'
import { apply } from '../index.js'

const here = dirname(fileURLToPath(import.meta.url))
const run = resolve(here, '.run')
const ROOT = join(run, 'workspace')
const PATH = 'fixture.html'
const PORT = 8391
const DEBUG_PORT = 9333
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const TOKEN = Buffer.from(ROOT, 'utf8').toString('base64url')

const steps = []
function check(name, condition, detail) {
  steps.push({ name, ok: Boolean(condition), detail })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!condition) process.exitCode = 1
}

await rm(ROOT, { recursive: true, force: true })
await cp(join(here, 'workspace'), ROOT, { recursive: true })
await mkdir(run, { recursive: true })

/* ---------------------------------------------------------------- host */
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
      return () => {}
    },
  },
  logger: { info() {} },
}
apply(ctx, { root: ROOT })

const page = (await readFile(join(here, 'harness.html'), 'utf8'))
  .replaceAll('__ROOT__', ROOT.replaceAll('\\', '\\\\'))
  .replaceAll('__PATH__', PATH)
  .replaceAll('__SRC__', `/__dsh-html-editor/fs/${TOKEN}/${PATH}`)

const harness = createServer((req, res) => {
  const url = req.url || '/'
  if (url.startsWith('/__dsh-html-editor')) return hostHandler(req, res)
  if (url === '/' || url.startsWith('/harness')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    res.end(page)
    return
  }
  res.writeHead(404)
  res.end('not found')
})
await new Promise((done) => harness.listen(PORT, '127.0.0.1', done))

/* ------------------------------------------------------- host contract */
{
  const document = await fetch(`http://127.0.0.1:${PORT}/__dsh-html-editor/fs/${TOKEN}/${PATH}`)
  const body = await document.text()
  const csp = document.headers.get('content-security-policy') || ''
  check('document served', document.status === 200 && body.includes('过程监控'), `status ${document.status}`)
  check('runtime injected', body.includes('data-dhe="injected"') && body.includes('__DSH_HTML_EDITOR__'))
  check('nonce CSP present', /script-src 'nonce-[^']+'/.test(csp), csp.slice(0, 80))
  check('user CSP stripped', !/http-equiv=["']?content-security-policy/i.test(body))
  const state = await fetch(`http://127.0.0.1:${PORT}/__dsh-html-editor/api/state?root=${encodeURIComponent(ROOT)}`).then((r) => r.json())
  check('state lists fixture', state.ok === true && state.files.some((file) => file.path === PATH), JSON.stringify(state.files?.map((f) => f.path)))
  const css = await fetch(`http://127.0.0.1:${PORT}/__dsh-html-editor/fs/${TOKEN}/fixture.css`)
  check('relative asset served', css.status === 200 && (await css.text()).includes('--brand'), `status ${css.status}`)
}

/* ------------------------------------------------------------- browser */
const profileDir = join(run, 'edge-profile')
await rm(profileDir, { recursive: true, force: true })
const browser = spawn(
  EDGE,
  [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--force-device-scale-factor=1',
    '--hide-scrollbars',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

async function waitJson(url, timeoutMs = 20000) {
  const started = Date.now()
  for (;;) {
    try {
      const response = await fetch(url)
      if (response.ok) return await response.json()
    } catch (_error) {
      /* not up yet */
    }
    if (Date.now() - started > timeoutMs) throw new Error('browser did not start: ' + url)
    await new Promise((done) => setTimeout(done, 150))
  }
}

const version = await waitJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`)
const targetList = await waitJson(`http://127.0.0.1:${DEBUG_PORT}/json`)
const target = targetList.find((entry) => entry.type === 'page')
check('debug target found', Boolean(target) && Boolean(version.Browser))

class Cdp {
  constructor(url) {
    this.next = 0
    this.pending = new Map()
    this.events = new Map()
    this.socket = new WebSocket(url)
    this.ready = new Promise((done, fail) => {
      this.socket.addEventListener('open', done)
      this.socket.addEventListener('error', fail)
    })
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id !== undefined) {
        const waiter = this.pending.get(message.id)
        if (!waiter) return
        this.pending.delete(message.id)
        if (message.error) waiter.fail(new Error(message.error.message))
        else waiter.done(message.result)
        return
      }
      const listener = this.events.get(message.method)
      if (listener) listener(message.params)
    })
  }
  async send(method, params = {}) {
    await this.ready
    const id = ++this.next
    const promise = new Promise((done, fail) => this.pending.set(id, { done, fail }))
    this.socket.send(JSON.stringify({ id, method, params }))
    return promise
  }
  on(method, callback) {
    this.events.set(method, callback)
  }
  close() {
    try {
      this.socket.close()
    } catch (_error) {
      /* closed */
    }
  }
}

const cdp = new Cdp(target.webSocketDebuggerUrl)
await cdp.send('Page.enable')
await cdp.send('Runtime.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1480, height: 1000, deviceScaleFactor: 1, mobile: false })

async function evaluate(expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  }
  return result.result.value
}

async function waitFor(expression, timeoutMs = 15000) {
  const started = Date.now()
  for (;;) {
    try {
      if (await evaluate(expression)) return true
    } catch (_error) {
      /* navigation or context not ready */
    }
    if (Date.now() - started > timeoutMs) throw new Error('timeout waiting for ' + expression)
    await new Promise((done) => setTimeout(done, 120))
  }
}

await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` })
await waitFor('document.readyState === "complete"')
await waitFor('window.__log && window.__log.some((m) => m.type === "dhe:ready")', 20000)

const iframeInfo = await evaluate(`(() => {
  const frame = document.getElementById('frame')
  const rect = frame.getBoundingClientRect()
  const root = frames[0].document
  return {
    rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    scriptRan: root.body.dataset.scriptRan || '',
    title: root.title,
    bg: getComputedStyle(root.body).backgroundColor
  }
})()`)
check('page script blocked by CSP', iframeInfo.scriptRan === '', JSON.stringify(iframeInfo.scriptRan))
check('document title intact', iframeInfo.title === '过程监控 · 设计稿', iframeInfo.title)
check('relative stylesheet applied', iframeInfo.bg === 'rgb(246, 247, 251)', iframeInfo.bg)

// Body-level edits must be captured by history too.
await evaluate(`frames[0].document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))`)
await waitFor('window.__log.some((m) => m.type === "dhe:selection" && m.selection && m.selection.tag === "body")', 5000)
await evaluate('window.send("style", { changes: { backgroundColor: "#fef3c7" } })')
await waitFor('getComputedStyle(frames[0].document.body).backgroundColor === "rgb(254, 243, 199)"', 5000)
check('body background applied', true)
await evaluate('window.send("command", { name: "undo" })')
await waitFor('getComputedStyle(frames[0].document.body).backgroundColor === "rgb(246, 247, 251)"', 5000)
check('body edit undo restores attributes', true)

const headingPoint = await evaluate(`(() => {
  const frame = document.getElementById('frame').getBoundingClientRect()
  const rect = frames[0].document.getElementById('title').getBoundingClientRect()
  return { x: frame.left + rect.left + rect.width / 2, y: frame.top + rect.top + rect.height / 2 }
})()`)

async function mouse(type, x, y, clickCount = 1) {
  await cdp.send('Input.dispatchMouseEvent', {
    type,
    x,
    y,
    button: 'left',
    buttons: type === 'mousePressed' ? 1 : 0,
    clickCount,
  })
}

await mouse('mouseMoved', headingPoint.x, headingPoint.y)
await mouse('mousePressed', headingPoint.x, headingPoint.y)
await mouse('mouseReleased', headingPoint.x, headingPoint.y)
await waitFor('window.__log.some((m) => m.type === "dhe:selection" && m.selection)')

const selected = await evaluate(`(() => {
  const rows = window.__log.filter((m) => m.type === 'dhe:selection' && m.selection)
  const last = rows[rows.length - 1].selection
  const tag = frames[0].document.querySelector('[data-dhe-root] .dhe-tag')
  return { tag: last.tag, id: last.id, label: last.label, overlay: tag ? tag.textContent : '' }
})()`)
check('click selects heading', selected.tag === 'h1' && selected.id === 'title', JSON.stringify(selected))
check('selection label drawn', selected.overlay.includes('h1#title'), selected.overlay)

await mouse('mousePressed', headingPoint.x, headingPoint.y, 1)
await mouse('mouseReleased', headingPoint.x, headingPoint.y, 1)
await mouse('mousePressed', headingPoint.x, headingPoint.y, 2)
await mouse('mouseReleased', headingPoint.x, headingPoint.y, 2)
await waitFor('frames[0].document.getElementById("title").isContentEditable', 6000)
check('double-click enters text editing', true)

await cdp.send('Input.insertText', { text: '过程监控 · 值班台设计稿' })
await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
await waitFor('frames[0].document.getElementById("title").textContent.includes("值班台")', 6000)
const edited = await evaluate(`(() => {
  const el = frames[0].document.getElementById('title')
  return { text: el.textContent, editable: el.isContentEditable, dirty: window.__log.filter(m => m.type === 'dhe:state').slice(-1)[0]?.dirty }
})()`)
check('text edit committed', edited.text.includes('值班台') && !edited.editable, JSON.stringify(edited))
check('dirty state published', edited.dirty === true, String(edited.dirty))

await evaluate('window.applyColor("#c2410c")')
await waitFor('getComputedStyle(frames[0].document.getElementById("title")).color === "rgb(194, 65, 12)"', 5000)
const colored = await evaluate('getComputedStyle(frames[0].document.getElementById("title")).color')
check('color applied', colored === 'rgb(194, 65, 12)', colored)

await cdp.send('Page.captureScreenshot', { format: 'png' }).then(async (shot) => {
  await import('node:fs/promises').then((fs) => fs.writeFile(join(run, 'editor.png'), Buffer.from(shot.data, 'base64')))
})
check('screenshot captured', true)

await evaluate('window.send("command", { name: "delete" })')
await waitFor('!frames[0].document.getElementById("title")', 5000)
check('delete removes element', true)
await evaluate('window.send("command", { name: "undo" })')
await waitFor('Boolean(frames[0].document.getElementById("title"))', 5000)
const restored = await evaluate(`(() => {
  const el = frames[0].document.getElementById('title')
  return { text: el.textContent, color: getComputedStyle(el).color }
})()`)
check('undo restores element', restored.text.includes('值班台'), JSON.stringify(restored))

await evaluate('window.saveNow()')
await waitFor('window.__saved !== null', 15000)
const saved = await evaluate('window.__saved')
check('save reported ok', saved && saved.ok === true, JSON.stringify(saved))
const disk = await readFile(join(ROOT, PATH), 'utf8')
check('disk content updated', disk.includes('值班台') && disk.includes('rgb(194, 65, 12)'), disk.slice(0, 80))
check('backup written', Boolean(saved.backup) && saved.backup.includes('.dsh-html-editor'), String(saved.backup))

/* ------------------------------------------------------------- report */
const failed = steps.filter((step) => !step.ok)
console.log(`\n${steps.length - failed.length}/${steps.length} checks passed`)
if (failed.length > 0) console.log('failed: ' + failed.map((step) => step.name).join(', '))

cdp.close()
browser.kill()
harness.close()
await new Promise((done) => setTimeout(done, 400))
process.exit(failed.length > 0 ? 1 : 0)
