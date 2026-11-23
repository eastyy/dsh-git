/**
 * Host half of the version bubble.
 *
 * Owns the git work: it exposes a tiny JSON endpoint under
 * `/__dsh-version-bubble/` on the composing web server, and answers with the
 * version list, the dirty count, and snapshot/restore results. The Client half
 * (client.js) is only a view over this endpoint, because a browser module has
 * no process access of its own.
 */
import { existsSync, statSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'

const PREFIX = '/__dsh-version-bubble'
const FIELD = '\u001f'
const RECORD = '\u001e'
const MAX_BODY = 64 * 1024
const DEFAULT_IGNORE = [
  'node_modules/',
  '.DS_Store',
  'Thumbs.db',
  '*.log',
  '.cache/',
]

/** Hard dependencies: without these the bubble has nothing to render. */
export const inject = ['webServer', 'subprocess']

export function apply(ctx, config) {
  const conf = config !== null && typeof config === 'object' ? config : {}

  /** The directory this bubble versions: explicit config wins, then the project last worked in. */
  function baseDirectory() {
    if (typeof conf.repoPath === 'string' && conf.repoPath.trim() !== '') return conf.repoPath
    const followed = followPath()
    if (followed !== '') return followed
    try {
      const wd = ctx.get('workingDirectory')
      if (wd !== undefined && wd !== null && typeof wd.defaultDirectory === 'string' && wd.defaultDirectory !== '') {
        return wd.defaultDirectory
      }
    } catch {
      /* optional service absent: fall through */
    }
    return process.cwd()
  }

  let gitExecutable

  /** Workspaces the user already opened in this Harness, as the only allowed targets. */
  function workspaces() {
    try {
      const registry = ctx.get('workspaceRegistry')
      if (registry === undefined || registry === null || typeof registry.list !== 'function') return []
      const items = registry.list()
      if (!Array.isArray(items)) return []
      const rows = []
      for (const item of items) {
        if (item === null || typeof item !== 'object') continue
        if (typeof item.path !== 'string' || item.path === '') continue
        rows.push({ path: item.path, title: typeof item.title === 'string' && item.title !== '' ? item.title : item.path })
      }
      return rows
    } catch {
      return []
    }
  }

  /**
   * The project the user most recently worked in: the workspace with a Session
   * whose record moved last, else the workspace record itself, else the first
   * registered workspace. The `.git` directory lands inside that project.
   */
  function followPath() {
    try {
      const registry = ctx.get('workspaceRegistry')
      if (registry === undefined || registry === null || typeof registry.list !== 'function') return ''
      const items = registry.list()
      if (!Array.isArray(items)) return ''
      let bestWithSession = ''
      let bestWithSessionAt = -1
      let bestAny = ''
      let bestAnyAt = -1
      for (const item of items) {
        if (item === null || typeof item !== 'object' || typeof item.path !== 'string' || item.path === '') continue
        const stamp = Date.parse(String(item.updatedAt || item.createdAt || '')) || 0
        const sessions = Array.isArray(item.sessionIds) ? item.sessionIds.length : 0
        if (stamp > bestAnyAt) {
          bestAnyAt = stamp
          bestAny = item.path
        }
        if (sessions > 0 && stamp > bestWithSessionAt) {
          bestWithSessionAt = stamp
          bestWithSession = item.path
        }
      }
      return bestWithSession !== '' ? bestWithSession : bestAny
    } catch {
      return ''
    }
  }

  function normalizeDir(value) {
    return value.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase()
  }

  /** Resolve the target directory: a known workspace, any existing absolute directory, else the default. */
  function resolveDir(requested) {
    const base = baseDirectory()
    if (typeof requested !== 'string' || requested === '') return base
    const wanted = normalizeDir(requested)
    for (const item of workspaces()) {
      if (normalizeDir(item.path) === wanted) return item.path
    }
    try {
      if (isAbsolute(requested) && existsSync(requested) && statSync(requested).isDirectory()) return requested
    } catch {
      /* unreadable path: fall back */
    }
    return base
  }

  async function gitBinary() {
    if (gitExecutable !== undefined) return gitExecutable
    try {
      gitExecutable = await ctx.subprocess.resolveExecutable('git')
    } catch {
      gitExecutable = 'git'
    }
    return gitExecutable
  }

  /** Run git and collect both streams. Never throws for a non-zero exit. */
  async function git(args, cwd) {
    const executable = await gitBinary()
    const handle = ctx.subprocess.spawn({
      argv: [executable, ...args],
      cwd,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: 4 * 1024 * 1024 },
        stderr: { maxBytes: 256 * 1024 },
      },
      graceMs: 3000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat', GIT_EDITOR: 'true' },
    })
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      try {
        handle.terminate()
      } catch {
        /* already gone */
      }
    }, 20000)
    let outcome
    try {
      outcome = await handle.done
    } finally {
      clearTimeout(timer)
    }
    const stdout = handle.collected.stdout === undefined ? '' : handle.collected.stdout.readFrom(0).text
    const stderr = handle.collected.stderr === undefined ? '' : handle.collected.stderr.readFrom(0).text
    const code =
      outcome !== undefined && outcome !== null && typeof outcome.exitCode === 'number' ? outcome.exitCode : -1
    return { code, stdout, stderr, timedOut }
  }

  function failure(result, fallback) {
    const detail = String(result.stderr || '').trim()
    const reason = detail === '' ? fallback : detail.split('\n').slice(0, 4).join('\n')
    return new Error(result.timedOut ? 'git 执行超时' : reason)
  }

  function parseLog(text) {
    const rows = []
    for (const chunk of text.split(RECORD)) {
      const record = chunk.replace(/^\n+/, '')
      if (record === '') continue
      const parts = record.split(FIELD)
      if (parts.length < 4) continue
      const at = Number(parts[2])
      rows.push({
        sha: parts[0],
        short: parts[1],
        at: Number.isFinite(at) ? at : 0,
        subject: parts.slice(3).join(FIELD),
      })
    }
    return rows
  }

  function parseNumstat(text) {
    const files = []
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue
      const parts = line.split('\t')
      if (parts.length < 3) continue
      files.push({
        path: parts[2],
        added: parts[0] === '-' ? 0 : Number(parts[0]) || 0,
        removed: parts[1] === '-' ? 0 : Number(parts[1]) || 0,
      })
    }
    return files
  }

  async function workingRoot(dir) {
    const probe = await git(['rev-parse', '--is-inside-work-tree'], dir)
    if (probe.code !== 0) return undefined
    const top = await git(['rev-parse', '--show-toplevel'], dir)
    if (top.code !== 0) return undefined
    return top.stdout.trim()
  }

  async function ensureIdentity(root) {
    const email = await git(['config', 'user.email'], root)
    if (email.code !== 0 || email.stdout.trim() === '') {
      await git(['config', 'user.email', 'version-bubble@local'], root)
    }
    const name = await git(['config', 'user.name'], root)
    if (name.code !== 0 || name.stdout.trim() === '') {
      await git(['config', 'user.name', '版本气泡'], root)
    }
  }

  async function ensureIgnore(root) {
    const file = join(root, '.gitignore')
    try {
      await readFile(file, 'utf8')
      return
    } catch {
      /* absent: create the minimal noise filter */
    }
    try {
      await writeFile(file, DEFAULT_IGNORE.join('\n') + '\n', 'utf8')
    } catch {
      /* read-only project: git still works without an ignore file */
    }
  }

  function describe(files) {
    const names = files.slice(0, 3).map((file) => {
      const parts = file.path.split('/')
      return parts[parts.length - 1]
    })
    const tail = files.length > 3 ? ' 等' : ''
    return `${files.length} 个文件（${names.join('、')}${tail}）`
  }

  function buildSubject(note, files) {
    const clean = typeof note === 'string' ? note.trim() : ''
    if (clean !== '') return clean.slice(0, 120)
    return `存档 · ${describe(files)}`.slice(0, 120)
  }

  function buildBody(files) {
    const lines = ['改动文件：']
    for (const file of files.slice(0, 40)) {
      lines.push(`  ${file.path}  +${file.added} -${file.removed}`)
    }
    if (files.length > 40) lines.push(`  … 还有 ${files.length - 40} 个文件`)
    return lines.join('\n')
  }

  async function readState(dir) {
    const root = await workingRoot(dir)
    if (root === undefined) {
      return { ok: true, dir, root: dir, initialized: false, versions: [], dirty: 0, total: 0 }
    }
    const log = await git(['log', '-n', '60', `--pretty=format:%H${FIELD}%h${FIELD}%at${FIELD}%s${RECORD}`], root)
    const versions = log.code === 0 ? parseLog(log.stdout) : []
    let total = versions.length
    const count = await git(['rev-list', '--count', 'HEAD'], root)
    if (count.code === 0) {
      const parsed = Number(count.stdout.trim())
      if (Number.isFinite(parsed)) total = parsed
    }
    for (let index = 0; index < versions.length; index += 1) {
      versions[index].n = total - index
    }
    const status = await git(['status', '--porcelain'], root)
    const dirty = status.code === 0 ? status.stdout.split('\n').filter((line) => line.trim() !== '').length : 0
    return { ok: true, dir, root, initialized: versions.length > 0, versions, dirty, total }
  }

  async function snapshot(dir, note) {
    let root = await workingRoot(dir)
    if (root === undefined) {
      const init = await git(['init'], dir)
      if (init.code !== 0) throw failure(init, 'git init 失败')
      root = await workingRoot(dir)
      if (root === undefined) throw new Error('无法初始化版本库')
    }
    await ensureIdentity(root)
    await ensureIgnore(root)
    const add = await git(['add', '-A'], root)
    if (add.code !== 0) throw failure(add, '暂存改动失败')
    const staged = await git(['diff', '--cached', '--numstat'], root)
    if (staged.code !== 0) throw failure(staged, '统计改动失败')
    const files = parseNumstat(staged.stdout)
    if (files.length === 0) {
      return { ok: true, empty: true, message: '没有需要存档的改动' }
    }
    const subject = buildSubject(note, files)
    const commit = await git(['commit', '-m', subject, '-m', buildBody(files)], root)
    if (commit.code !== 0) throw failure(commit, '创建存档失败')
    return { ok: true, message: '已存档', subject, files: files.length }
  }

  async function restore(dir, sha) {
    if (typeof sha !== 'string' || !/^[0-9a-f]{4,40}$/i.test(sha)) throw new Error('版本标识无效')
    const root = await workingRoot(dir)
    if (root === undefined) throw new Error('这个目录还不是版本库')
    await ensureIdentity(root)
    const checkout = await git(['checkout', sha, '--', '.'], root)
    if (checkout.code !== 0) throw failure(checkout, '回到这一版失败')
    const add = await git(['add', '-A'], root)
    if (add.code !== 0) throw failure(add, '暂存改动失败')
    const staged = await git(['diff', '--cached', '--numstat'], root)
    const files = staged.code === 0 ? parseNumstat(staged.stdout) : []
    if (files.length === 0) {
      return { ok: true, empty: true, message: '当前内容和这一版一致，无需回退' }
    }
    const short = sha.slice(0, 7)
    const commit = await git(['commit', '-m', `回到 ${short}`, '-m', buildBody(files)], root)
    if (commit.code !== 0) throw failure(commit, '记录回退失败')
    return { ok: true, message: `已回到 ${short}，并记为新的一版` }
  }

  function sendJson(res, status, value) {
    const body = Buffer.from(JSON.stringify(value), 'utf8')
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': String(body.length),
      'cache-control': 'no-store',
    })
    res.end(body)
  }

  async function readBody(req) {
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > MAX_BODY) throw new Error('请求体过大')
      chunks.push(chunk)
    }
    if (size === 0) return {}
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      return {}
    }
  }

  async function handle(req, res) {
    const url = new URL(req.url === undefined ? PREFIX : req.url, 'http://127.0.0.1')
    if (!url.pathname.startsWith(PREFIX)) {
      sendJson(res, 404, { ok: false, error: '未知路径' })
      return
    }
    const action = url.pathname.slice(PREFIX.length).replace(/^\/+/, '').replace(/\/+$/, '')
    const dir = resolveDir(url.searchParams.get('dir'))
    try {
      if (action === 'workspaces') {
        sendJson(res, 200, { ok: true, items: workspaces() })
        return
      }
      if (action === 'state') {
        sendJson(res, 200, await readState(dir))
        return
      }
      if (action === 'snapshot' && req.method === 'POST') {
        const body = await readBody(req)
        sendJson(res, 200, await snapshot(dir, typeof body.note === 'string' ? body.note : ''))
        return
      }
      if (action === 'restore' && req.method === 'POST') {
        const body = await readBody(req)
        sendJson(res, 200, await restore(dir, String(body.sha || '')))
        return
      }
      sendJson(res, 404, { ok: false, error: '未知操作' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      sendJson(res, 200, { ok: false, error: message })
    }
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: PREFIX, handler: handle }))
}
