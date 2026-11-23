/**
 * Host half of the HTML visual editor.
 *
 * Owns every filesystem operation: lists the workspace's HTML files, serves an
 * HTML document into the editor's iframe (with page scripts disabled and the
 * in-page editing runtime injected), and writes edited markup back to the same
 * file with a timestamped backup.
 *
 * The Client half only renders the chrome and forwards user intent; a browser
 * module cannot touch the filesystem on its own.
 *
 * @module dsh-html-editor
 */

import { randomBytes } from 'node:crypto'
import { statSync } from 'node:fs'
import { mkdir, readFile, readdir, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export const name = 'dsh-html-editor'

/** The composed Web server is required; every other service is optional. */
export const inject = ['webServer']

const PREFIX = '/__dsh-html-editor'
const BACKUP_DIR = '.dsh-html-editor'
const HTML_EXTENSIONS = new Set(['.html', '.htm'])
const MAX_HTML_BYTES = 8 * 1024 * 1024
const MAX_BODY_BYTES = 14 * 1024 * 1024
const MAX_FILES = 800
const MAX_DEPTH = 10
const KEEP_BACKUPS = 12

/** Directories that never contain a page the user wants to edit. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '.next',
  '.nuxt',
  '.cache',
  '.turbo',
  '.parcel-cache',
  '.dsh-html-editor',
  'dist',
  'build',
  'out',
  'coverage',
  'vendor',
  '__pycache__',
])

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
}

/** `apply` runs once per profile; the closure owns the caches below. */
export function apply(ctx, config) {
  const conf = config !== null && typeof config === 'object' ? config : {}
  const configuredRoot = typeof conf.root === 'string' && conf.root.trim() !== '' ? conf.root : ''

  /** mtime of the in-iframe runtime, used as a cache-busting revision. */
  function runtimeRevision() {
    try {
      return String(Math.floor(statSync(new URL('./assets/editor.js', import.meta.url)).mtimeMs))
    } catch {
      return '1'
    }
  }

  function workspaces() {
    try {
      const registry = ctx.get('workspaceRegistry')
      if (registry === undefined || registry === null || typeof registry.list !== 'function') return []
      const items = registry.list()
      if (!Array.isArray(items)) return []
      return items
        .filter((item) => item !== null && typeof item === 'object' && typeof item.path === 'string' && item.path !== '')
        .map((item) => ({ path: item.path, updatedAt: String(item.updatedAt || item.createdAt || '') }))
    } catch {
      return []
    }
  }

  function launchDirectory() {
    try {
      const working = ctx.get('workingDirectory')
      if (working !== undefined && working !== null && typeof working.defaultDirectory === 'string') {
        return working.defaultDirectory
      }
    } catch {
      /* optional service absent */
    }
    return ''
  }

  /** The most recently touched workspace, else the configured/launch directory. */
  function defaultRoot() {
    if (configuredRoot !== '') return configuredRoot
    const rows = workspaces()
    if (rows.length > 0) {
      let best = rows[0]
      let bestAt = -1
      for (const row of rows) {
        const at = Date.parse(row.updatedAt) || 0
        if (at > bestAt) {
          bestAt = at
          best = row
        }
      }
      return best.path
    }
    return launchDirectory() || process.cwd()
  }

  /** Registered workspaces plus the launch directory: the only roots we expose. */
  let rootsCache = { at: 0, rows: [] }
  async function allowedRoots() {
    if (Date.now() - rootsCache.at < 3000) return rootsCache.rows
    const candidates = new Set()
    for (const row of workspaces()) candidates.add(row.path)
    const launch = launchDirectory()
    if (launch !== '') candidates.add(launch)
    if (configuredRoot !== '') candidates.add(configuredRoot)
    const rows = []
    for (const candidate of candidates) {
      try {
        if (!isAbsolute(candidate)) continue
        const real = await realpath(candidate)
        if (statSync(real).isDirectory()) rows.push(real)
      } catch {
        /* missing or unreadable: not a root */
      }
    }
    rootsCache = { at: Date.now(), rows }
    return rows
  }

  function isInside(child, parent) {
    const rel = relative(parent, child)
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
  }

  async function rootIsAllowed(root) {
    let real
    try {
      real = await realpath(root)
    } catch {
      return false
    }
    for (const base of await allowedRoots()) {
      if (isInside(real, base)) return true
    }
    return false
  }

  async function pickRoot(requested) {
    if (typeof requested === 'string' && requested !== '' && isAbsolute(requested)) {
      try {
        if ((await stat(requested)).isDirectory() && (await rootIsAllowed(requested))) {
          return await realpath(requested)
        }
      } catch {
        /* fall back to the default root */
      }
    }
    const fallback = defaultRoot()
    try {
      return await realpath(fallback)
    } catch {
      return fallback
    }
  }

  /** A write target must name an authorized root explicitly; never fall back silently. */
  async function requireRoot(requested) {
    if (typeof requested !== 'string' || !isAbsolute(requested)) throw new Error('缺少工作区目录')
    if (!(await rootIsAllowed(requested))) throw new Error('这个工作区未授权')
    return await realpath(requested)
  }

  function encodeRoot(root) {
    return Buffer.from(root, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  function decodeRoot(token) {
    const padded = token.replace(/-/g, '+').replace(/_/g, '/')
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
    return Buffer.from(padded + pad, 'base64').toString('utf8')
  }

  /** Resolve a workspace-relative POSIX path, refusing escapes and symlink tricks. */
  async function resolveInside(root, rel, options = {}) {
    const clean = String(rel === undefined || rel === null ? '' : rel).replace(/^[/\\]+/, '')
    const target = resolve(root, clean.split('/').join(sep))
    if (!isInside(target, root)) throw new Error('路径超出工作区')
    if (options.mustExist !== false) {
      const real = await realpath(target)
      if (!isInside(real, root)) throw new Error('路径超出工作区')
      return real
    }
    const parentReal = await realpath(dirname(target))
    if (!isInside(parentReal, root)) throw new Error('路径超出工作区')
    return join(parentReal, basename(target))
  }

  async function toPosix(root, absolute) {
    return relative(root, absolute).split(sep).join('/')
  }

  async function listHtml(root) {
    const files = []
    let truncated = false
    async function walk(directory, depth) {
      if (files.length >= MAX_FILES) {
        truncated = true
        return
      }
      if (depth > MAX_DEPTH) return
      let entries
      try {
        entries = await readdir(directory, { withFileTypes: true })
      } catch {
        return
      }
      entries.sort((a, b) => a.name.localeCompare(b.name))
      for (const entry of entries) {
        if (files.length >= MAX_FILES) {
          truncated = true
          return
        }
        if (entry.name.startsWith('.')) continue
        if (entry.isSymbolicLink()) continue
        const absolute = join(directory, entry.name)
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) continue
          await walk(absolute, depth + 1)
          continue
        }
        if (!entry.isFile()) continue
        const extension = extname(entry.name).toLowerCase()
        if (!HTML_EXTENSIONS.has(extension)) continue
        try {
          const info = await stat(absolute)
          files.push({
            path: await toPosix(root, absolute),
            abs: absolute,
            name: entry.name,
            dir: (await toPosix(root, dirname(absolute))) === '.' ? '' : await toPosix(root, dirname(absolute)),
            size: info.size,
            mtime: info.mtimeMs,
          })
        } catch {
          /* raced with a delete */
        }
      }
    }
    await walk(root, 0)
    files.sort((a, b) => a.path.localeCompare(b.path))
    return { files, truncated }
  }

  /** Strip the page's own CSP/base tags and install our nonce-guarded runtime. */
  function injectRuntime(html, info) {
    const nonce = randomBytes(18).toString('base64')
    const config = JSON.stringify(info)
      .replace(/</g, '\\u003c')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029')
    const headTag = `<script nonce="${nonce}" data-dhe="injected">window.__DSH_HTML_EDITOR__=${config}</script>`
    const bodyTag = `<script nonce="${nonce}" data-dhe="injected" src="${PREFIX}/editor.js?v=${runtimeRevision()}"></script>`
    /* A meta refresh would navigate the canvas away and take the runtime with
       it; the tag stays in the saved markup, it just does not fire here. */
    let out = String(html).replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '')
    if (/<head(\s[^>]*)?>/i.test(out)) {
      out = out.replace(/<head(\s[^>]*)?>/i, (match) => match + headTag)
    } else if (/<html(\s[^>]*)?>/i.test(out)) {
      out = out.replace(/<html(\s[^>]*)?>/i, (match) => match + headTag)
    } else {
      out = headTag + out
    }
    if (/<\/body\s*>/i.test(out)) {
      out = out.replace(/<\/body\s*>/i, () => bodyTag + '</body>')
    } else {
      out = out + bodyTag
    }
    return { html: out, nonce }
  }

  function cspFor(nonce) {
    return [
      "default-src 'self' https: http: data: blob:",
      `script-src 'nonce-${nonce}'`,
      "style-src 'self' 'unsafe-inline' https: http: data:",
      'img-src * data: blob:',
      "font-src 'self' https: http: data:",
      'media-src * data: blob:',
      "connect-src 'none'",
      "object-src 'none'",
      "frame-src 'none'",
      "worker-src 'none'",
      "form-action 'none'",
      "base-uri 'self'",
      "frame-ancestors 'self'",
    ].join('; ')
  }

  function sendJson(res, status, value) {
    const body = Buffer.from(JSON.stringify(value), 'utf8')
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': String(body.length),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    })
    res.end(body)
  }

  function sendBytes(res, status, body, headers) {
    res.writeHead(status, {
      'content-length': String(body.length),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...headers,
    })
    res.end(body)
  }

  async function readBody(req) {
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > MAX_BODY_BYTES) throw new Error('请求体过大')
      chunks.push(chunk)
    }
    if (size === 0) return {}
    try {
      const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      return parsed !== null && typeof parsed === 'object' ? parsed : {}
    } catch {
      throw new Error('请求体不是合法 JSON')
    }
  }

  function stamp() {
    const now = new Date()
    const pad = (value, width = 2) => String(value).padStart(width, '0')
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${pad(now.getMilliseconds(), 3)}`
  }

  async function backup(root, absolute, previous) {
    try {
      const rel = await toPosix(root, absolute)
      const folder = join(root, BACKUP_DIR, 'backups', rel.replace(/[\\/]+/g, '__'))
      await mkdir(folder, { recursive: true })
      const file = join(folder, `${stamp()}.html`)
      await writeFile(file, previous, 'utf8')
      const rows = (await readdir(folder)).filter((name) => name.endsWith('.html')).sort()
      for (const old of rows.slice(0, Math.max(0, rows.length - KEEP_BACKUPS))) {
        await unlink(join(folder, old)).catch(() => {})
      }
      return file
    } catch {
      return ''
    }
  }

  async function saveDocument(root, rel, html) {
    if (typeof html !== 'string') throw new Error('缺少 HTML 内容')
    if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) throw new Error('HTML 文件超过 8 MB')
    if (!HTML_EXTENSIONS.has(extname(rel).toLowerCase())) throw new Error('只能保存 .html / .htm 文件')
    const absolute = await resolveInside(root, rel, { mustExist: false })
    let previous = ''
    try {
      previous = await readFile(absolute, 'utf8')
    } catch {
      /* new file */
    }
    let backupPath = ''
    if (previous !== '' && previous !== html) {
      backupPath = await backup(root, absolute, previous)
    }
    await mkdir(dirname(absolute), { recursive: true })
    const temporary = `${absolute}.dhe-${process.pid}-${Date.now()}.tmp`
    await writeFile(temporary, html, 'utf8')
    try {
      await rename(temporary, absolute)
    } catch (error) {
      await unlink(temporary).catch(() => {})
      throw error
    }
    const info = await stat(absolute)
    return { path: await toPosix(root, absolute), abs: absolute, size: info.size, mtime: info.mtimeMs, backup: backupPath }
  }

  async function serveDocument(res, root, rel) {
    const absolute = await resolveInside(root, rel)
    const info = await stat(absolute)
    if (!info.isFile()) throw new Error('不是文件')
    if (info.size > MAX_HTML_BYTES) throw new Error('HTML 文件超过 8 MB')
    const source = await readFile(absolute, 'utf8')
    const token = encodeRoot(root)
    const { html, nonce } = injectRuntime(source, {
      root,
      path: await toPosix(root, absolute),
      prefix: PREFIX,
      token,
    })
    sendBytes(res, 200, Buffer.from(html, 'utf8'), {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': cspFor(nonce),
      'x-frame-options': 'SAMEORIGIN',
    })
  }

  async function serveAsset(res, root, rel, method) {
    const absolute = await resolveInside(root, rel)
    let info = await stat(absolute)
    if (info.isDirectory()) {
      const index = await resolveInside(root, (rel.replace(/\/+$/, '') + '/index.html').replace(/^\/+/, ''))
      info = await stat(index)
      if (!info.isFile()) throw new Error('不是文件')
      return serveDocument(res, root, await toPosix(root, index))
    }
    if (!info.isFile()) throw new Error('不是文件')
    const extension = extname(absolute).toLowerCase()
    if (HTML_EXTENSIONS.has(extension)) return serveDocument(res, root, rel)
    if (info.size > 32 * 1024 * 1024) throw new Error('资源文件超过 32 MB')
    if (method === 'HEAD') {
      sendBytes(res, 200, Buffer.alloc(0), { 'content-type': MIME[extension] || 'application/octet-stream' })
      return
    }
    const body = await readFile(absolute)
    sendBytes(res, 200, body, {
      'content-type': MIME[extension] || 'application/octet-stream',
      'cross-origin-resource-policy': 'cross-origin',
    })
  }

  async function handleApi(req, res, action, url) {
    if (action === 'api/ping') {
      sendJson(res, 200, { ok: true, version: '0.1.0', root: await pickRoot(url.searchParams.get('root')) })
      return
    }
    if (action === 'api/state') {
      const root = await pickRoot(url.searchParams.get('root'))
      const { files, truncated } = await listHtml(root)
      sendJson(res, 200, { ok: true, root, token: encodeRoot(root), files, truncated })
      return
    }
    if (action === 'api/read') {
      const root = await pickRoot(url.searchParams.get('root'))
      const rel = url.searchParams.get('path') || ''
      const absolute = await resolveInside(root, rel)
      const info = await stat(absolute)
      if (info.size > MAX_HTML_BYTES) throw new Error('HTML 文件超过 8 MB')
      const html = await readFile(absolute, 'utf8')
      sendJson(res, 200, { ok: true, root, path: await toPosix(root, absolute), html, size: info.size, mtime: info.mtimeMs })
      return
    }
    if (action === 'api/resolve') {
      const file = url.searchParams.get('file') || ''
      if (!isAbsolute(file)) throw new Error('需要绝对路径')
      const real = await realpath(file)
      for (const base of await allowedRoots()) {
        if (isInside(real, base)) {
          sendJson(res, 200, { ok: true, root: base, path: await toPosix(base, real), abs: real })
          return
        }
      }
      throw new Error('这个文件不在已注册的工作区里')
    }
    if (action === 'api/save' && req.method === 'POST') {
      const body = await readBody(req)
      const root = await requireRoot(body.root)
      const rel = typeof body.path === 'string' ? body.path : ''
      const result = await saveDocument(root, rel, body.html)
      sendJson(res, 200, { ok: true, ...result })
      return
    }
    sendJson(res, 404, { ok: false, error: '未知操作' })
  }

  /**
   * A state-changing request has to come from the page that hosts us.
   * A cross-site "simple" request needs no preflight, so without this a page
   * at any origin could POST a save and never need to read the response.
   */
  function trusted(req) {
    const site = typeof req.headers['sec-fetch-site'] === 'string' ? req.headers['sec-fetch-site'].toLowerCase() : ''
    if (site === 'cross-site') return false
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : ''
    if (origin === '') return true
    const host = typeof req.headers.host === 'string' ? req.headers.host : ''
    if (host === '') return false
    return origin === `http://${host}` || origin === `https://${host}`
  }

  function isJson(req) {
    const type = typeof req.headers['content-type'] === 'string' ? req.headers['content-type'].toLowerCase() : ''
    return type.startsWith('application/json')
  }

  /** The composed Web server hands us the escaped request URL and the raw response. */
  async function handle(req, res) {
    const method = req.method || 'GET'
    const url = new URL(req.url === undefined ? PREFIX : req.url, 'http://127.0.0.1')
    const pathname = url.pathname
    try {
      if (!trusted(req) || (method !== 'GET' && method !== 'HEAD' && !isJson(req))) {
        sendJson(res, 403, { ok: false, error: '请求来源不受信任' })
        return
      }
      if (pathname === `${PREFIX}/editor.js`) {
        const body = await readFile(new URL('./assets/editor.js', import.meta.url))
        sendBytes(res, 200, body, { 'content-type': 'text/javascript; charset=utf-8' })
        return
      }
      if (pathname.startsWith(`${PREFIX}/fs/`)) {
        const rest = pathname.slice(`${PREFIX}/fs/`.length)
        const slash = rest.indexOf('/')
        if (slash <= 0) throw new Error('缺少文件路径')
        const token = rest.slice(0, slash)
        const root = decodeRoot(token)
        if (!isAbsolute(root) || !(await rootIsAllowed(root))) throw new Error('工作区未授权')
        const rel = decodeURIComponent(rest.slice(slash + 1))
        await serveAsset(res, root, rel, method)
        return
      }
      if (pathname.startsWith(`${PREFIX}/api/`)) {
        await handleApi(req, res, pathname.slice(PREFIX.length + 1), url)
        return
      }
      sendJson(res, 404, { ok: false, error: '未知路径' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (res.headersSent) {
        try {
          res.end()
        } catch {
          /* already closed */
        }
        return
      }
      sendJson(res, 200, { ok: false, error: message })
    }
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: PREFIX, handler: handle }))
  ctx.logger?.info?.(`dsh-html-editor: mounted at ${PREFIX} (default root ${defaultRoot()})`)
}
