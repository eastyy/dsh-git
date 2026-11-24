/**
 * Remote helpers, driven against real git repositories.
 *
 * No network: the "cloud" side is a local bare repository, so this exercises
 * `git remote add/set-url`, the ahead/behind counting and `git push` itself
 * without needing GitHub credentials.
 */
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseRemote, readRemote, setRemote, pushRemote } from '../remote.js'

const rows = []
function check(name, ok, detail) {
  rows.push({ name, ok: Boolean(ok) })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) process.exitCode = 1
}

/** The runner shape remote.js expects, backed by the real git binary. */
function runner(cwd) {
  return function (args, options) {
    const timeout = options && typeof options.timeoutMs === 'number' ? options.timeoutMs : 20000
    return new Promise((resolve) => {
      execFile(
        'git',
        args,
        { cwd, timeout, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
        (error, stdout, stderr) => {
          const code = error === null ? 0 : typeof error.code === 'number' ? error.code : -1
          resolve({ code, stdout: String(stdout || ''), stderr: String(stderr || ''), timedOut: error !== null && error.killed === true })
        },
      )
    })
  }
}

const root = await mkdtemp(join(tmpdir(), 'vwb-remote-'))
const project = join(root, 'project')
const bare = join(root, 'cloud.git')
await mkdir(project, { recursive: true })
const git = runner(project)
await git(['init', '-q'])
await git(['symbolic-ref', 'HEAD', 'refs/heads/main'])
await git(['config', 'user.name', 'tester'])
await git(['config', 'user.email', 'tester@local'])
await writeFile(join(project, 'a.txt'), 'one\n', 'utf8')
await git(['add', '-A'])
await git(['commit', '-q', '-m', 'v1'])
await git(['init', '-q', '--bare', bare])

/* ---------------------------------------------------------- url parsing */
const https = parseRemote('https://github.com/eastyy/dsh-git.git')
check('https github url', https && https.provider === 'github.com' && https.owner === 'eastyy' && https.repo === 'dsh-git', JSON.stringify(https))
const ssh = parseRemote('git@gitlab.com:group/sub/repo.git')
check('ssh gitlab subgroup', ssh && ssh.provider === 'gitlab.com' && ssh.owner === 'group/sub' && ssh.repo === 'repo', JSON.stringify(ssh))
check('rejects other hosts', parseRemote('https://evil.example/a/b') === undefined && parseRemote('file:///C:/x') === undefined)
check('rejects a bare host', parseRemote('https://github.com/onlyowner') === undefined)

/* ------------------------------------------------------- set/read remote */
const set = await setRemote(git, project, 'https://github.com/eastyy/demo.git')
check('setRemote adds origin', set.url === 'https://github.com/eastyy/demo.git', set.url)
const url = await git(['remote', 'get-url', 'origin'])
check('origin stored in git', url.stdout.trim() === 'https://github.com/eastyy/demo.git', url.stdout.trim())

let rejected = false
try {
  await setRemote(git, project, 'https://evil.example/a/b')
} catch {
  rejected = true
}
check('setRemote rejects a foreign host', rejected)

const before = await readRemote(git, project)
check('readRemote reports provider', before.provider === 'github.com' && before.owner === 'eastyy' && before.repo === 'demo', JSON.stringify(before))
check('readRemote counts unsent versions', before.branch === 'main' && before.ahead === 1 && before.upstream === false, `branch=${before.branch} ahead=${before.ahead}`)

/* ------------------------------------------------------------------ push */
await git(['remote', 'set-url', 'origin', pathToFileURL(bare).href])
const pushed = await pushRemote(git, project)
check('pushRemote pushes the branch', pushed.branch === 'main', JSON.stringify(pushed))
/* The bare repository's own HEAD still points at its initial branch, so compare
   the pushed branch rather than HEAD. */
const cloudHead = await runner(root)(['--git-dir', bare, 'rev-parse', 'refs/heads/main'])
const localHead = await git(['rev-parse', 'HEAD'])
check('cloud repository received the commit', cloudHead.stdout.trim() === localHead.stdout.trim(), cloudHead.stdout.trim().slice(0, 8))

const after = await readRemote(git, project)
check('readRemote sees it as synced', after.ahead === 0 && after.upstream === true, `ahead=${after.ahead} upstream=${after.upstream}`)

/* A second commit shows up as one unsent version again. */
await writeFile(join(project, 'a.txt'), 'two\n', 'utf8')
await git(['add', '-A'])
await git(['commit', '-q', '-m', 'v2'])
const pending = await readRemote(git, project)
check('new commit is counted as unsent', pending.ahead === 1, `ahead=${pending.ahead}`)

await rm(root, { recursive: true, force: true })

const failed = rows.filter((row) => !row.ok)
console.log(`\n${rows.length - failed.length}/${rows.length} checks passed`)
if (failed.length > 0) console.log('failed: ' + failed.map((row) => row.name).join(', '))
