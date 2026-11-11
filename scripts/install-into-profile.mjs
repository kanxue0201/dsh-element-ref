/**
 * 把本插件登记进一个 dsh profile（默认 desktop）：
 *   1. package.json → dependencies 里加 link: 指向本仓库
 *   2. package.json → dsh.profile.bundles 里加 "dsh-element-ref"
 *   3. node_modules/dsh-element-ref 建 junction（Windows）或 symlink
 *
 * 只写这三处，不跑包管理器、不动 lockfile —— 我们用的是 link:，
 * 真实代码一直在仓库里，profile 只是个指针。
 *
 *   node scripts/install-into-profile.mjs             # 装进默认 desktop profile
 *   node scripts/install-into-profile.mjs --dry-run   # 只打印将要做什么
 *   node scripts/install-into-profile.mjs --profile C:/Users/me/.dsh/profiles/other
 *
 * 改完需要重启 DSH 桌面应用（profile 在启动时合成一次）。
 */
import { readFile, writeFile, mkdir, symlink, lstat, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG = 'dsh-element-ref'
const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const profileIdx = args.indexOf('--profile')
const profileDir = profileIdx >= 0
  ? resolve(args[profileIdx + 1])
  : resolve(process.env.DSH_HOME ?? `${process.env.USERPROFILE ?? ''}/.dsh`, 'profiles', process.env.DSH_PROFILE ?? 'desktop')

const out = (line) => process.stdout.write(`${line}\n`)

async function exists(path) {
  try { await lstat(path); return true } catch { return false }
}

const manifestPath = `${profileDir}/package.json`
const raw = await readFile(manifestPath, 'utf8')
const manifest = JSON.parse(raw)

const linkSpec = `link:${repo.replaceAll('\\', '/')}`
const bundles = manifest.dsh?.profile?.bundles
if (bundles === undefined) {
  out(`! ${manifestPath} 里没有 dsh.profile.bundles，这看起来不是一个 profile 目录`)
  process.exit(1)
}

const depChanged = manifest.dependencies?.[PKG] !== linkSpec
const bundleChanged = !bundles.includes(PKG)

out(`profile: ${profileDir}`)
out(`  dependencies["${PKG}"]: ${manifest.dependencies?.[PKG] ?? '(缺)'}${depChanged ? '  → 写入 link:' + repo : '  (ok)'}`)
out(`  dsh.profile.bundles: ${bundleChanged ? '(缺) → 追加 ' + PKG + `（第 ${bundles.length + 1} 个）` : '(ok)'}`)

if (depChanged) manifest.dependencies = { ...manifest.dependencies, [PKG]: linkSpec }
if (bundleChanged) bundles.push(PKG)

const linkPath = `${profileDir}/node_modules/${PKG}`
const linkExists = await exists(linkPath)

out(`  node_modules/${PKG}: ${linkExists ? '已存在' : '将创建 junction → ' + repo}`)

if (dryRun) { out('(dry-run：什么都没写)'); process.exit(0) }

if (depChanged || bundleChanged) {
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  out(`已写 ${manifestPath}`)
}

if (!linkExists) {
  await mkdir(`${profileDir}/node_modules`, { recursive: true })
  if (process.platform === 'win32') {
    // 目录 junction 不需要管理员权限，node 的 type:'junction' 就是 mklink /J
    await symlink(repo, linkPath, 'junction')
  } else {
    await symlink(repo, linkPath, 'dir')
  }
  out(`已建链接 ${linkPath}`)
}

out('完成。重启 DSH 桌面应用后，bundle 才会被合成进运行时。')
void rm
