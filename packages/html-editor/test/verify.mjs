/**
 * Manifest-level self-check: package wiring, bundle patch, display resources,
 * runtime files, and (when present) the desktop profile installation.
 */
import { readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const rows = []
function check(name, ok, detail) {
  rows.push({ name, ok: Boolean(ok) })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) process.exitCode = 1
}

const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
check('package name', manifest.name === 'dsh-html-editor', manifest.name)
check('bundle patch declared', manifest.dsh?.bundle?.patch === './cordis.patch.yml')
check('client platform is web', manifest.dsh?.client?.platform === 'web')
check('client loads immediately', manifest.dsh?.client?.immediately === true)
check('main export', manifest.exports?.['.'] === './index.js')
check('client export', manifest.exports?.['./client'] === './client.js')
check('locale export', manifest.exports?.['./locale/*.json'] !== undefined)
check('icon export', manifest.exports?.['./icon'] !== undefined)

for (const file of manifest.files || []) {
  if (file.includes('*')) continue
  try {
    await stat(join(root, file))
    check(`file exists: ${file}`, true)
  } catch {
    check(`file exists: ${file}`, false)
  }
}

const patch = await readFile(join(root, 'cordis.patch.yml'), 'utf8')
check('patch inserts this package', patch.includes('id: dsh-html-editor') && patch.includes('name: dsh-html-editor'))

for (const locale of ['en', 'zh']) {
  const data = JSON.parse(await readFile(join(root, 'locale', `${locale}.json`), 'utf8'))
  check(`locale ${locale} title`, typeof data.meta?.title === 'string' && data.meta.title.length > 0, data.meta?.title)
  check(`locale ${locale} description`, typeof data.meta?.description === 'string' && data.meta.description.length > 0)
}

const icon = await readFile(join(root, 'icon.svg'))
check('icon is SVG', icon.subarray(0, 64).toString('utf8').includes('<svg'))
check('icon within size limit', icon.byteLength <= 256 * 1024, `${icon.byteLength} bytes`)

const client = await readFile(join(root, 'client.js'), 'utf8')
check('client registers module id', client.includes("id: 'dsh-html-editor'"))
check('client registers shell overlay', client.includes("'shell.overlay'"))
check('client registers document action', client.includes("'sidebar.right.tab.document.actions'"))

const host = await import('../index.js')
check('host exports apply', typeof host.apply === 'function')
check('host injects webServer', Array.isArray(host.inject) && host.inject.includes('webServer'))

const runtime = await readFile(join(root, 'assets/editor.js'), 'utf8')
check('runtime is guarded', runtime.includes('__DSH_HTML_EDITOR_ACTIVE__'))
check('runtime posts serialized markup', runtime.includes("post('serialize'"))
check('runtime has undo', runtime.includes('function undo()'))

/* The desktop profile is optional: the package is still valid without it, so a
   profile that does not install this bundle is a skip, not a failure. */
const profile = process.env.DSH_PROFILE_DIR || join(process.env.USERPROFILE || '', '.dsh', 'profiles', 'desktop')
try {
  const profileManifest = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8'))
  const dependency = profileManifest.dependencies?.['dsh-html-editor']
  if (typeof dependency !== 'string') {
    console.log('SKIP  profile checks — this profile does not install dsh-html-editor')
  } else {
    const bundles = Array.isArray(profileManifest.dsh?.profile?.bundles) ? profileManifest.dsh.profile.bundles : []
    check('profile declares dependency', dependency.includes('html-editor'), dependency)
    check('profile selects bundle', bundles.includes('dsh-html-editor'))
    const link = await stat(join(profile, 'node_modules', 'dsh-html-editor'))
    check('profile links package', link.isDirectory() || link.isSymbolicLink())
  }
} catch (error) {
  console.log(`SKIP  profile checks — ${error instanceof Error ? error.message : String(error)}`)
}

const failed = rows.filter((row) => !row.ok)
console.log(`\n${rows.length - failed.length}/${rows.length} checks passed`)
if (failed.length > 0) console.log('failed: ' + failed.map((row) => row.name).join(', '))
