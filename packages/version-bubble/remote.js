/**
 * Remote (cloud) helpers for dsh-version-bubble.
 *
 * The plugin never stores credentials. Every network operation is a plain
 * `git push` that uses whatever the machine already has — Git Credential
 * Manager, a credential helper, or an SSH key — so there is no token to leak
 * and nothing to configure inside the panel.
 *
 * Only GitHub and GitLab URLs are accepted, so a request cannot repoint the
 * push at an arbitrary host.
 *
 * `run(args, options)` is the caller's git runner and resolves to
 * `{ code, stdout, stderr, timedOut }`; keeping it as a parameter is what lets
 * the tests drive these helpers without a Cordis context.
 */

const HOSTS = ['github.com', 'gitlab.com']

/** Split a GitHub/GitLab URL into provider and owner/repo; undefined when it is not one. */
export function parseRemote(value) {
  const text = typeof value === 'string' ? value.trim().replace(/\/+$/, '') : ''
  if (text === '') return undefined
  const https = /^https:\/\/(?:www\.)?(github\.com|gitlab\.com)\/([^:]+?)(?:\.git)?$/.exec(text)
  const ssh = /^git@(github\.com|gitlab\.com):([^:]+?)(?:\.git)?$/.exec(text)
  const match = https !== null ? https : ssh
  if (match === null) return undefined
  const parts = match[2].split('/')
  if (parts.length < 2) return undefined
  for (const part of parts) {
    if (!/^[A-Za-z0-9._-]+$/.test(part)) return undefined
  }
  return {
    provider: match[1],
    owner: parts.slice(0, -1).join('/'),
    repo: parts[parts.length - 1],
    url: text,
  }
}

/** A readable line for the panel: github.com/owner/repo. */
export function describeRemote(remote) {
  if (remote === null || typeof remote !== 'object' || remote.url === '') return ''
  const host = typeof remote.provider === 'string' && remote.provider !== '' ? remote.provider : 'remote'
  const owner = typeof remote.owner === 'string' ? remote.owner : ''
  const repo = typeof remote.repo === 'string' ? remote.repo : ''
  if (owner === '' || repo === '') return host
  return host + '/' + owner + '/' + repo
}

/** Current branch, the configured origin, and how far ahead of it this repo is. */
export async function readRemote(run, root) {
  const remote = { url: '', provider: '', owner: '', repo: '', branch: '', ahead: 0, behind: 0, upstream: false }
  const url = await run(['remote', 'get-url', 'origin'], root)
  if (url.code === 0) remote.url = url.stdout.trim()
  const branch = await run(['rev-parse', '--abbrev-ref', 'HEAD'], root)
  if (branch.code === 0) remote.branch = branch.stdout.trim()
  if (remote.url !== '') {
    const parsed = parseRemote(remote.url)
    if (parsed !== undefined) {
      remote.provider = parsed.provider
      remote.owner = parsed.owner
      remote.repo = parsed.repo
    }
    if (remote.branch !== '' && remote.branch !== 'HEAD') {
      const counts = await run(['rev-list', '--left-right', '--count', `origin/${remote.branch}...HEAD`], root)
      if (counts.code === 0) {
        const parts = counts.stdout.trim().split(/\s+/)
        remote.behind = Number(parts[0]) || 0
        remote.ahead = Number(parts[1]) || 0
        remote.upstream = true
      } else {
        const total = await run(['rev-list', '--count', 'HEAD'], root)
        remote.ahead = total.code === 0 ? Number(total.stdout.trim()) || 0 : 0
      }
    }
  }
  return remote
}

/** Create or repoint `origin`. Throws on anything that is not a GitHub/GitLab URL. */
export async function setRemote(run, root, value) {
  const parsed = parseRemote(value)
  if (parsed === undefined) throw new Error('只支持 GitHub / GitLab 的 https 或 git@ 地址')
  const existing = await run(['remote', 'get-url', 'origin'], root)
  const result =
    existing.code === 0
      ? await run(['remote', 'set-url', 'origin', parsed.url], root)
      : await run(['remote', 'add', 'origin', parsed.url], root)
  if (result.code !== 0) {
    const detail = String(result.stderr || '').trim()
    throw new Error(detail === '' ? '设置云端地址失败' : detail)
  }
  return readRemote(run, root)
}

/** The failure text worth showing; credential failures get an actionable hint. */
function pushFailure(result) {
  const detail = String(result.stderr || '').trim().split('\n').slice(0, 4).join('\n')
  if (result.timedOut) return new Error('上传超时（网络太慢或卡在登录），稍后重试。')
  if (/could not read Username|could not read Password|Authentication failed|Permission denied|terminal prompts disabled|Access denied/i.test(detail)) {
    return new Error(
      '这台机器还没有 GitHub / GitLab 的 git 登录。先在终端跑一次 `git push` 完成登录（或配好 SSH key），再回来点上传。\n' +
        detail,
    )
  }
  return new Error(detail === '' ? '上传失败' : detail)
}

/** `git push -u origin <branch>`; never force, never rewrites history. */
export async function pushRemote(run, root) {
  const remote = await readRemote(run, root)
  if (remote.url === '') throw new Error('还没有设置云端仓库地址')
  if (remote.branch === '' || remote.branch === 'HEAD') throw new Error('还没有可以上传的版本')
  const result = await run(['push', '-u', 'origin', remote.branch], { timeoutMs: 180000 })
  if (result.code !== 0) throw pushFailure(result)
  return { branch: remote.branch, provider: remote.provider, owner: remote.owner, repo: remote.repo }
}

export { HOSTS }
