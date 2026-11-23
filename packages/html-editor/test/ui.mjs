/**
 * Full client-UI harness: renders the plugin's React half in a mock DSH page,
 * serves the real Host routes, and drives the editor with CDP.
 */
import { spawn } from 'node:child_process'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { apply } from '../index.js'

const here = dirname(fileURLToPath(import.meta.url))
const run = resolve(here, '.run')
const ROOT = join(run, 'workspace')
const PORT = 8392
const DEBUG_PORT = 9334
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

await rm(ROOT, { recursive: true, force: true })
await cp(join(here, 'workspace'), ROOT, { recursive: true })
await mkdir(run, { recursive: true })

const steps = []
function check(name, condition, detail) {
  steps.push({ name, ok: Boolean(condition), detail })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!condition) process.exitCode = 1
}

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

const ui = (await readFile(join(here, 'ui.html'), 'utf8')).replaceAll('__ROOT__', ROOT.replaceAll('\\', '\\\\'))
const react = await readFile(join(here, 'mock/node_modules/react/umd/react.development.js'))
const reactDom = await readFile(join(here, 'mock/node_modules/react-dom/umd/react-dom.development.js'))
const client = await readFile(resolve(here, '../client.js'))

const server = createServer((req, res) => {
  const url = req.url || '/'
  if (url.startsWith('/__dsh-html-editor')) return hostHandler(req, res)
  if (url === '/' || url.startsWith('/index')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    res.end(ui)
    return
  }
  if (url.startsWith('/client.js')) {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
    res.end(client)
    return
  }
  if (url.startsWith('/mock/react.js')) {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
    res.end(react)
    return
  }
  if (url.startsWith('/mock/react-dom.js')) {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
    res.end(reactDom)
    return
  }
  res.writeHead(404)
  res.end('not found')
})
await new Promise((done) => server.listen(PORT, '127.0.0.1', done))

const profileDir = join(run, 'edge-profile-ui')
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
      /* not up */
    }
    if (Date.now() - started > timeoutMs) throw new Error('browser did not start')
    await new Promise((done) => setTimeout(done, 150))
  }
}

const targets = await waitJson(`http://127.0.0.1:${DEBUG_PORT}/json`)
const target = targets.find((entry) => entry.type === 'page')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((done, fail) => {
  socket.addEventListener('open', done)
  socket.addEventListener('error', fail)
})

let nextId = 0
const pending = new Map()
const consoleRows = []
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id !== undefined) {
    const waiter = pending.get(message.id)
    if (!waiter) return
    pending.delete(message.id)
    if (message.error) waiter.fail(new Error(message.error.message))
    else waiter.done(message.result)
    return
  }
  if (message.method === 'Runtime.consoleAPICalled') {
    const text = (message.params.args || []).map((arg) => arg.value ?? arg.description ?? '').join(' ')
    consoleRows.push(message.params.type + ': ' + text)
  }
  if (message.method === 'Runtime.exceptionThrown') {
    consoleRows.push('exception: ' + (message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text))
  }
})

function send(method, params = {}) {
  const id = ++nextId
  const promise = new Promise((done, fail) => pending.set(id, { done, fail }))
  socket.send(JSON.stringify({ id, method, params }))
  return promise
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1480, height: 1000, deviceScaleFactor: 1, mobile: false })

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}

async function waitFor(expression, timeoutMs = 15000) {
  const started = Date.now()
  for (;;) {
    try {
      if (await evaluate(expression)) return true
    } catch (_error) {
      /* context not ready */
    }
    if (Date.now() - started > timeoutMs) throw new Error('timeout waiting for ' + expression)
    await new Promise((done) => setTimeout(done, 120))
  }
}

async function clickAt(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 })
}

async function clickSelector(selector) {
  const rect = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })()`)
  if (!rect) throw new Error('missing selector ' + selector)
  await clickAt(rect.x, rect.y)
}

async function screenshot(name) {
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(run, name), Buffer.from(shot.data, 'base64'))
}

await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` })
await waitFor('document.readyState === "complete"')
await waitFor('Boolean(document.querySelector(".dhe-launcher"))')
await new Promise((done) => setTimeout(done, 1200))
console.log('page errors:', await evaluate('JSON.stringify(window.__errors)'))
await waitFor('window.__errors.length === 0')
check('client module registered', await evaluate('Boolean(window.__dheRegistrations["shell.overlay"])'))
check('document preview action registered', await evaluate('Boolean(window.__dheRegistrations["sidebar.right.tab.document.actions"])'))
check('preview action rendered', await evaluate('Boolean(document.querySelector(".dhe-preview-btn"))'))

// The preview-header action should open the editor on its own file.
await clickSelector('.dhe-preview-btn')
await waitFor('Boolean(document.querySelector(".dhe-root"))')
await waitFor('Boolean(document.querySelector(".dhe-canvas iframe").contentDocument.getElementById("title"))', 20000)
check('preview action opens editor', await evaluate('document.querySelector(".dhe-title span").textContent.includes("fixture.html")'))
await evaluate(`document.querySelector('.dhe-bar button[title^="关闭"]').click()`)
await waitFor('!document.querySelector(".dhe-root")')
check('editor closes', true)

await clickSelector('.dhe-launcher')
await waitFor('Boolean(document.querySelector(".dhe-root"))')
await waitFor('Boolean(document.querySelector(".dhe-canvas iframe"))')
await waitFor('Boolean(document.querySelector(".dhe-canvas iframe").contentDocument.getElementById("title"))', 20000)
await waitFor('Boolean(document.querySelector(".dhe-canvas iframe").contentWindow.__DSH_HTML_EDITOR_ACTIVE__)', 20000)
check('full-screen editor opens', true)
check('file list rendered', await evaluate('document.querySelectorAll(".dhe-file").length > 0'))
check('status bar reports elements', await evaluate('document.querySelector(".dhe-stage-foot").textContent.includes("个元素")'))

const point = await evaluate(`(() => {
  const frame = document.querySelector('.dhe-canvas iframe')
  const rect = frame.getBoundingClientRect()
  const heading = frame.contentDocument.getElementById('title').getBoundingClientRect()
  return { x: rect.left + heading.left + heading.width / 2, y: rect.top + heading.top + heading.height / 2 }
})()`)
await clickAt(point.x, point.y)
await waitFor('document.querySelector(".dhe-inspect .dhe-tag") && document.querySelector(".dhe-inspect .dhe-tag").textContent.includes("h1#title")')
check('inspector follows selection', true)
check('color section present', await evaluate('document.querySelector(".dhe-inspect").textContent.includes("文字颜色") || document.querySelector(".dhe-inspect").textContent.includes("背景")'))
await screenshot('ui-editor.png')

// Edit the heading through the inspector textarea, then blur.
await clickSelector('.dhe-textarea')
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 })
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 })
await send('Input.insertText', { text: '过程监控 · 值班台 2.0' })
await clickSelector('.dhe-side-head b')
await waitFor('document.querySelector(".dhe-canvas iframe").contentDocument.getElementById("title").textContent.includes("2.0")', 8000)
check('inspector text edit applied', true)

// Delete from the inspector, then undo from the toolbar.
await evaluate(`[...document.querySelectorAll('.dhe-btn')].find((b) => b.textContent.includes('删除元素')).click()`)
await waitFor('!document.querySelector(".dhe-canvas iframe").contentDocument.getElementById("title")', 6000)
check('delete from inspector', true)
await evaluate(`document.querySelector('.dhe-bar button[title^="撤销"]').click()`)
await waitFor('Boolean(document.querySelector(".dhe-canvas iframe").contentDocument.getElementById("title"))', 6000)
check('toolbar undo restores', true)

// Save and verify the file on disk.
await evaluate(`document.querySelector('.dhe-btn--primary').click()`)
await waitFor('document.querySelector(".dhe-btn--primary").textContent.includes("已保存")', 15000)
const disk = await readFile(join(ROOT, 'fixture.html'), 'utf8')
check('save writes the file', disk.includes('值班台 2.0'), disk.includes('值班台 2.0') ? '' : disk.slice(0, 120))
await screenshot('ui-saved.png')

check('no page errors', (await evaluate('window.__errors.length')) === 0, JSON.stringify(await evaluate('window.__errors')))
const warnings = consoleRows.filter((row) => /exception|error|Warning: Each child|Warning: React/i.test(row))
check('no React console errors', warnings.length === 0, warnings.slice(0, 3).join(' | '))

const failed = steps.filter((step) => !step.ok)
console.log(`\n${steps.length - failed.length}/${steps.length} client checks passed`)
if (failed.length > 0) console.log('failed: ' + failed.map((step) => step.name).join(', '))

socket.close()
browser.kill()
server.close()
await new Promise((done) => setTimeout(done, 400))
process.exit(failed.length > 0 ? 1 : 0)
