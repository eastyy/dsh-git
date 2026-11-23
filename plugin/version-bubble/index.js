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

  /* Each git call costs a process launch, so a short memo keeps the poll from re-walking the log. */
  const STATE_TTL_MS = 3000
  const stateCache = new Map()
  const rootCache = new Map()

  async function resolveRoot(dir) {
    if (rootCache.has(dir)) return rootCache.get(dir)
    const root = await workingRoot(dir)
    if (root !== undefined) rootCache.set(dir, root)
    return root
  }

  function forget(dir) {
    stateCache.delete(dir)
    rootCache.delete(dir)
  }

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
    const top = await git(['rev-parse', '--show-toplevel'], dir)
    if (top.code !== 0) return undefined
    const value = top.stdout.trim()
    return value === '' ? undefined : value
  }

  /** The notes live inside the repository's own git directory, so they are never committed. */
  async function gitDirOf(root) {
    const candidate = join(root, '.git')
    try {
      if (statSync(candidate).isDirectory()) return candidate
    } catch {
      /* a worktree's .git is a file: resolve it below */
    }
    const found = await git(['rev-parse', '--absolute-git-dir'], root)
    if (found.code === 0 && found.stdout.trim() !== '') return found.stdout.trim()
    return candidate
  }

  async function readNotes(root) {
    try {
      const raw = await readFile(join(await gitDirOf(root), 'dsh-version-notes.json'), 'utf8')
      const parsed = JSON.parse(raw)
      return parsed !== null && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  async function saveNote(root, sha, note) {
    const map = await readNotes(root)
    map[sha] = note
    try {
      await writeFile(join(await gitDirOf(root), 'dsh-version-notes.json'), JSON.stringify(map), 'utf8')
    } catch {
      /* unwritable git dir: the note still renders this session */
    }
  }

  async function commitFiles(root, sha) {
    const stat = await git(['show', '--no-color', '--format=', '--numstat', sha], root)
    return stat.code === 0 ? parseNumstat(stat.stdout) : []
  }

  /** The diff a note is written from, bounded per file so one huge commit cannot blow the prompt. */
  async function commitDiff(root, sha, files) {
    const picked = files.slice(0, 8)
    const shown = await Promise.all(
      picked.map(function (file) {
        return git(['show', '--no-color', '--format=', '-U2', sha, '--', file.path], root)
      }),
    )
    const parts = []
    let budget = 16000
    for (let index = 0; index < picked.length; index += 1) {
      if (budget <= 400) break
      const result = shown[index]
      if (result.code !== 0 || result.stdout === '') continue
      const text = result.stdout.slice(0, Math.min(budget, 6000))
      parts.push('### ' + picked[index].path + '\n' + text)
      budget -= text.length
    }
    return parts.join('\n')
  }

  /** Files whose diff says nothing about what the version means. */
  const NOISE_FILES = new Set(['.gitignore', '.gitattributes', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'])

  function baseName(path) {
    const parts = path.split(/[\\/]/)
    return parts[parts.length - 1]
  }

  /** Read the project's default model, when a model route is configured. */
  function modelRoute() {
    try {
      const selection = ctx.get('agentDefaultModel')
      if (selection === undefined || selection === null) return undefined
      const current = typeof selection.currentSelection === 'function' ? selection.currentSelection() : undefined
      if (current === undefined || current === null) return undefined
      if (typeof current.provider !== 'string' || typeof current.model !== 'string') return undefined
      if (current.provider === '' || current.model === '') return undefined
      return { provider: current.provider, model: current.model }
    } catch {
      return undefined
    }
  }

  async function askModel(prompt) {
    const llm = ctx.get('llm')
    const route = modelRoute()
    if (llm === undefined || llm === null || typeof llm.stream !== 'function' || route === undefined) return ''
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 45000)
    let text = ''
    try {
      const stream = llm.stream({
        provider: route.provider,
        model: route.model,
        system: '你是产品设计团队的版本记录助手，只依据给出的 diff 写版本说明。',
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        maxTokens: 700,
        temperature: 0.2,
        signal: controller.signal,
      })
      for await (const chunk of stream) {
        if (chunk === null || typeof chunk !== 'object') continue
        if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
        if (chunk.type === 'finish' && chunk.reason && chunk.reason.kind !== 'stop') return ''
      }
    } catch {
      return ''
    } finally {
      clearTimeout(timer)
    }
    return text
  }

  function clampText(value, max) {
    const clean = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
    return clean.length > max ? clean.slice(0, max) : clean
  }

  const KINDS = ['需求', '文案', '结构', '样式', '其他']

  function parseNote(text) {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end <= start) return undefined
    let parsed
    try {
      parsed = JSON.parse(text.slice(start, end + 1))
    } catch {
      return undefined
    }
    if (parsed === null || typeof parsed !== 'object') return undefined
    const summary = clampText(parsed.summary, 48)
    if (summary === '') return undefined
    const points = []
    const source = Array.isArray(parsed.points) ? parsed.points : []
    for (const point of source) {
      if (points.length >= 4) break
      if (point === null || typeof point !== 'object') continue
      const content = clampText(point.text, 40)
      if (content === '') continue
      const kind = KINDS.includes(point.kind) ? point.kind : '其他'
      points.push({ kind, text: content })
    }
    return { summary, points }
  }

  /** No model or a failed call: still say something exact from the diff itself. */
  function fallbackNote(files, diffText) {
    const added = []
    const removed = []
    let addedLines = 0
    let removedLines = 0
    for (const line of diffText.split('\n')) {
      if (line.startsWith('+++') || line.startsWith('---')) continue
      if (line.startsWith('+')) {
        addedLines += 1
        const heading = /^\+\s{0,3}#{1,6}\s+(.+)$/.exec(line)
        if (heading !== null) added.push(clampText(heading[1].replace(/^#+\s*/, ''), 24))
        continue
      }
      if (line.startsWith('-')) {
        removedLines += 1
        const heading = /^-\s{0,3}#{1,6}\s+(.+)$/.exec(line)
        if (heading !== null) removed.push(clampText(heading[1].replace(/^#+\s*/, ''), 24))
      }
    }
    const points = []
    for (const title of added.slice(0, 2)) points.push({ kind: '结构', text: '新增「' + title + '」' })
    for (const title of removed.slice(0, 2)) points.push({ kind: '结构', text: '删除「' + title + '」' })
    if (points.length === 0) {
      points.push({ kind: '其他', text: '改动 ' + files.length + ' 个文件，+ ' + addedLines + ' / - ' + removedLines + ' 行' })
    }
    return { summary: '改动 ' + files.length + ' 个文件，+ ' + addedLines + ' / - ' + removedLines + ' 行', points }
  }

  function buildPrompt(root, files, diffText) {
    const lines = []
    for (const file of files.slice(0, 20)) lines.push('  ' + file.path + ' (+' + file.added + ' -' + file.removed + ')')
    const project = root.split(/[\\/]/).filter(Boolean).pop() || root
    return [
      '项目：' + project,
      '本次改动的文件：',
      lines.join('\n'),
      '',
      '以下是这次存档相对上一版的实际 diff（可能被截断）：',
      diffText,
      '',
      '请据此写这段版本说明。规则：',
      '1. summary：一句话说清“这版做了什么”，不超过 40 个字，不要以“本次”开头。',
      '2. points：2 到 4 条，每条不超过 30 个字，只写真正改变的东西。',
      '3. kind 只能取：需求（功能或流程变化）、文案（措辞、口径、名称变化）、结构（章节、页面、模块的增删重排）、样式（视觉样式）、其他。',
      '4. 必须落在 diff 的具体内容上，写出改了哪个章节、哪个功能、哪句口径；禁止“优化体验”“完善细节”“更新内容”这类空话，禁止罗列文件名。',
      '5. 只输出 JSON，不要代码块，不要解释：',
      '{"summary":"...","points":[{"kind":"需求","text":"..."}]}',
    ].join('\n')
  }

  async function buildNote(root, sha) {
    const files = await commitFiles(root, sha)
    const meaningful = files.filter(function (file) {
      return !NOISE_FILES.has(baseName(file.path))
    })
    const diffText = await commitDiff(root, sha, meaningful)
    if (diffText === '') return { summary: '', points: [], files }
    let note
    const answer = await askModel(buildPrompt(root, meaningful, diffText))
    if (answer !== '') note = parseNote(answer)
    if (note === undefined) note = fallbackNote(meaningful, diffText)
    return { summary: note.summary, points: note.points, files }
  }

  async function ensureNote(root, sha) {
    const map = await readNotes(root)
    const cached = map[sha]
    if (cached !== undefined && cached !== null && typeof cached.summary === 'string' && cached.summary !== '') {
      return {
        summary: cached.summary,
        points: Array.isArray(cached.points) ? cached.points : [],
        files: Array.isArray(cached.files) && cached.files.length > 0 ? cached.files : await commitFiles(root, sha),
        cached: true,
      }
    }
    const built = await buildNote(root, sha)
    if (built.summary !== '') {
      await saveNote(root, sha, { summary: built.summary, points: built.points, files: built.files })
    }
    return { summary: built.summary, points: built.points, files: built.files, cached: false }
  }

  /** Identity is read once per repository per process: two fewer process spawns on every save. */
  const identityReady = new Set()

  async function ensureIdentity(root) {
    if (identityReady.has(root)) return
    const results = await Promise.all([git(['config', 'user.email'], root), git(['config', 'user.name'], root)])
    const fixes = []
    if (results[0].code !== 0 || results[0].stdout.trim() === '') {
      fixes.push(git(['config', 'user.email', 'version-bubble@local'], root))
    }
    if (results[1].code !== 0 || results[1].stdout.trim() === '') {
      fixes.push(git(['config', 'user.name', '版本气泡'], root))
    }
    if (fixes.length > 0) await Promise.all(fixes)
    identityReady.add(root)
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
    const hit = stateCache.get(dir)
    if (hit !== undefined && Date.now() - hit.at < STATE_TTL_MS) return hit.value
    const root = await resolveRoot(dir)
    if (root === undefined) {
      return { ok: true, dir, root: dir, initialized: false, versions: [], dirty: 0, total: 0 }
    }
    /* One round trip: log, count, status, and the cached notes all resolve together. */
    const results = await Promise.all([
      git(['log', '-n', '60', `--pretty=format:%H${FIELD}%h${FIELD}%at${FIELD}%s${RECORD}`], root),
      git(['rev-list', '--count', 'HEAD'], root),
      git(['status', '--porcelain'], root),
      readNotes(root),
    ])
    const versions = results[0].code === 0 ? parseLog(results[0].stdout) : []
    let total = versions.length
    if (results[1].code === 0) {
      const parsed = Number(results[1].stdout.trim())
      if (Number.isFinite(parsed)) total = parsed
    }
    for (let index = 0; index < versions.length; index += 1) {
      versions[index].n = total - index
    }
    const notes = results[3]
    for (const version of versions) {
      const note = notes[version.sha]
      version.note =
        note !== undefined && note !== null && typeof note.summary === 'string'
          ? { summary: note.summary, points: Array.isArray(note.points) ? note.points : [] }
          : null
    }
    const dirty = results[2].code === 0 ? results[2].stdout.split('\n').filter((line) => line.trim() !== '').length : 0
    const value = { ok: true, dir, root, initialized: versions.length > 0, versions, dirty, total }
    stateCache.set(dir, { at: Date.now(), value })
    return value
  }

  async function snapshot(dir, note) {
    forget(dir)
    let root = await resolveRoot(dir)
    if (root === undefined) {
      const init = await git(['init'], dir)
      if (init.code !== 0) throw failure(init, 'git init 失败')
      root = await resolveRoot(dir)
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
    const head = await git(['rev-parse', 'HEAD'], root)
    const created = head.stdout.trim()
    if (created !== '') {
      /* The timeline title fills in on the next refresh; a slow model never blocks the save. */
      ensureNote(root, created).catch(() => {})
    }
    forget(dir)
    return { ok: true, message: '已存档', subject, files: files.length }
  }

  async function restore(dir, sha) {
    if (typeof sha !== 'string' || !/^[0-9a-f]{4,40}$/i.test(sha)) throw new Error('版本标识无效')
    forget(dir)
    const root = await resolveRoot(dir)
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
    forget(dir)
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
      if (action === 'note' && req.method === 'POST') {
        const body = await readBody(req)
        const sha = String(body.sha || '')
        if (!/^[0-9a-f]{4,40}$/i.test(sha)) throw new Error('版本标识无效')
        const root = await workingRoot(dir)
        if (root === undefined) throw new Error('这个目录还不是版本库')
        const full =
          sha.length === 40 ? sha : (await git(['rev-parse', sha], root)).stdout.trim() || sha
        const note = await ensureNote(root, full)
        sendJson(res, 200, { ok: true, ...note })
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
