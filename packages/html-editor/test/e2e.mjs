/**
 * End-to-end check against a real DSH Web server booted with the test profile.
 *
 * The server is started separately (see test/e2e/out.log for its token URL).
 * This driver opens the actual Harness UI, verifies the plugin launcher, opens
 * the editor, selects a heading, and screenshots the result.
 */
import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const run = resolve(here, 'e2e')
const log = await readFile(join(run, 'out.log'), 'utf8')
const match = /http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+/.exec(log)
if (!match) throw new Error('no token URL in e2e/out.log')
const url = match[0]
const DEBUG_PORT = 9335
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

const steps = []
function check(name, condition, detail) {
  steps.push({ name, ok: Boolean(condition), detail })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!condition) process.exitCode = 1
}

const profileDir = join(run, 'edge-profile')
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

async function waitJson(target, timeoutMs = 20000) {
  const started = Date.now()
  for (;;) {
    try {
      const response = await fetch(target)
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
const errors = []
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
  if (message.method === 'Runtime.exceptionThrown') {
    errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text || '')
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    errors.push((message.params.args || []).map((arg) => arg.value ?? arg.description ?? '').join(' '))
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

async function waitFor(expression, timeoutMs = 20000) {
  const started = Date.now()
  for (;;) {
    try {
      if (await evaluate(expression)) return true
    } catch (_error) {
      /* context not ready */
    }
    if (Date.now() - started > timeoutMs) throw new Error('timeout waiting for ' + expression)
    await new Promise((done) => setTimeout(done, 150))
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

await send('Page.navigate', { url })
await waitFor('document.readyState === "complete"', 30000)
await waitFor('Boolean(document.querySelector("#root"))', 30000)
await waitFor('Boolean(document.querySelector(".dhe-launcher"))', 40000)
check('plugin loaded in real Harness', true)
await new Promise((done) => setTimeout(done, 800))
await writeFile(join(run, 'e2e-launcher.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))

await clickSelector('.dhe-launcher')
await waitFor('Boolean(document.querySelector(".dhe-root"))', 10000)
await waitFor('document.querySelectorAll(".dhe-file").length > 0', 20000)
await waitFor('Boolean(document.querySelector(".dhe-canvas iframe"))', 20000)
await waitFor('Boolean(document.querySelector(".dhe-canvas iframe").contentDocument.getElementById("title"))', 25000)
await waitFor('Boolean(document.querySelector(".dhe-canvas iframe").contentWindow.__DSH_HTML_EDITOR_ACTIVE__)', 25000)
check('editor opened over real Harness', true)
check('workspace files listed', (await evaluate('document.querySelectorAll(".dhe-file").length')) >= 1, String(await evaluate('[...document.querySelectorAll(".dhe-file-name")].map(n => n.textContent).join(", ")')))
check('iframe runtime active', true)
check('no CSP/frame block', true)

const point = await evaluate(`(() => {
  const frame = document.querySelector('.dhe-canvas iframe')
  const rect = frame.getBoundingClientRect()
  const heading = frame.contentDocument.getElementById('title').getBoundingClientRect()
  return { x: rect.left + heading.left + heading.width / 2, y: rect.top + heading.top + heading.height / 2 }
})()`)
await clickAt(point.x, point.y)
await waitFor('document.querySelector(".dhe-inspect .dhe-tag") && document.querySelector(".dhe-inspect .dhe-tag").textContent.includes("h1#title")', 10000)
check('selection and inspector work in real Harness', true)
await writeFile(join(run, 'e2e-editor.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))

const severe = errors.filter((row) => /dsh-html-editor|dhe-|html-editor/i.test(row))
check('no plugin runtime errors', severe.length === 0, severe.slice(0, 3).join(' | '))
if (errors.length > 0) console.log('console errors (first 5):\n' + errors.slice(0, 5).join('\n'))

const failed = steps.filter((step) => !step.ok)
console.log(`\n${steps.length - failed.length}/${steps.length} end-to-end checks passed`)
if (failed.length > 0) console.log('failed: ' + failed.map((step) => step.name).join(', '))

socket.close()
browser.kill()
process.exit(failed.length > 0 ? 1 : 0)
