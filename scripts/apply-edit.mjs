#!/usr/bin/env node
/**
 * apply-edit — 改文件的安全通道：先验证、再原子替换、最后确认热重载真的换上了。
 *
 * 为什么需要它：DSH 的文件监听在写入过程中就会触发热重载，导入器一旦读到半截的
 * `lib/client.js` 就会抛 SyntaxError —— 模块求值阶段的异常插件自己兜不住，整个
 * web boot 直接判「1 entry did not activate」。所以验证必须发生在 rename 之前：
 * 监听器只看得到「已经通过 node --check 的完整文件」。
 *
 * 用法：
 *   node scripts/apply-edit.mjs <文件>                  # 从 stdin 读新内容
 *   node scripts/apply-edit.mjs lib/picker.js --source draft.js
 *   node scripts/apply-edit.mjs lib/picker.js --smoke   # 额外跑三套 smoke
 *   node scripts/apply-edit.mjs lib/index.js --port 61223
 *   node scripts/apply-edit.mjs README.md --no-wait     # 非代码文件，不等重载
 *
 * 参数：--port <n>（或环境变量 DSH_GUI_PORT）、--expect <版本>、--smoke、
 *       --no-wait、--allow-version-skew、--dry（只验证不落盘）。
 *
 * 退出码：0 成功；1 验证失败（原文件未动）；2 用法错误；3 已落盘但没等到重载。
 */
import { readFile, writeFile, rename, unlink } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, basename, extname } from 'node:path'
import { request } from 'node:http'

const argv = process.argv.slice(2)
const flags = new Set()
const options = new Map()
const positional = []

for (let i = 0; i < argv.length; i += 1) {
  const token = argv[i]
  if (token === '--source' || token === '--port' || token === '--expect') {
    options.set(token.slice(2), argv[i + 1])
    i += 1
  } else if (token.startsWith('--')) {
    flags.add(token.slice(2))
  } else {
    positional.push(token)
  }
}

const target = positional[0]
if (!target) {
  console.error('usage: node scripts/apply-edit.mjs <file> [--source <path>] [--port <n>] [--smoke] [--no-wait] [--dry]')
  process.exit(2)
}

const root = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
const targetPath = join(root, target)
if (!existsSync(targetPath)) {
  console.error(`✗ 找不到 ${target}`)
  process.exit(2)
}

/* ------------------------------------------------------------------ 1. 收内容 */

const body = options.has('source')
  ? await readFile(join(root, options.get('source')))
  : await new Promise((resolve, reject) => {
    const chunks = []
    process.stdin.on('data', (chunk) => chunks.push(chunk))
    process.stdin.on('end', () => resolve(Buffer.concat(chunks)))
    process.stdin.on('error', reject)
  })

if (body.length === 0) {
  console.error('✗ 新内容是空的，拒绝覆盖（要清空文件请直接写）')
  process.exit(1)
}

// PowerShell 的 `>` / `Out-File` 默认写 UTF-16，`Set-Content -Encoding utf8` 会带 BOM。
// 两者都会让 node --check 报「Invalid or unexpected token」或让 JSON.parse 失败，所以先认出来。
let payload = body
if (payload.length >= 2 && payload[0] === 0xff && payload[1] === 0xfe) {
  console.error('✗ 新内容是 UTF-16LE（PowerShell 重定向的默认编码），请用 UTF-8 写入：')
  console.error('  node -e "process.stdout.write(require(\'fs\').readFileSync(\'x.js\'))" | node scripts/apply-edit.mjs <文件>')
  process.exit(1)
}
if (payload.length >= 3 && payload[0] === 0xef && payload[1] === 0xbb && payload[2] === 0xbf) {
  payload = payload.subarray(3)
  console.log('ℹ 去掉了 UTF-8 BOM')
}
if (payload.includes(0)) {
  console.error('✗ 新内容里有 NUL 字节，看起来不是文本文件，拒绝写入')
  process.exit(1)
}

/* ------------------------------------------------------------------ 2. 先验证（还没落盘） */

const ext = extname(targetPath).toLowerCase()
// 临时文件保留原扩展名，node --check 才会按模块类型解析；前缀以 . 开头，不会被当成入口。
const tempPath = join(dirname(targetPath), `.apply-edit.${process.pid}.${basename(targetPath)}`)

function fail(message) {
  console.error(`✗ ${message}`)
  console.error('  原文件没有改动。')
  try {
    require_cleanup()
  } catch {
    /* best effort */
  }
  process.exit(1)
}

function require_cleanup() {
  const { unlinkSync } = require('node:fs')
  try {
    unlinkSync(tempPath)
  } catch {
    /* already gone */
  }
}

await writeFile(tempPath, payload)

try {
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
    const check = spawnSync(process.execPath, ['--check', tempPath], { encoding: 'utf8' })
    if (check.status !== 0) fail(`node --check 失败：\n${(check.stderr || '').trim()}`)
  } else if (ext === '.json') {
    try {
      JSON.parse(payload.toString('utf8'))
    } catch (error) {
      fail(`JSON 解析失败：${error.message}`)
    }
  } else if (ext === '.yml' || ext === '.yaml') {
    // 没有引入 YAML 依赖，只做基本体检：不允许制表符、每个非空行都要有冒号。
    const lines = payload.toString('utf8').split(/\r?\n/)
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      if (!line.trim() || line.trimStart().startsWith('#')) continue
      if (line.includes('\t')) fail(`YAML 第 ${i + 1} 行含制表符`)
      if (!line.trimStart().startsWith('-') && !line.includes(':')) fail(`YAML 第 ${i + 1} 行缺冒号：${line.trim()}`)
    }
  }

  // 页面半与右栏的版本号必须同步，否则老页面还在跑旧脚本。
  if (target === 'lib/picker.js' || target === 'lib/client.js') {
    const client = (await readFile(join(root, 'lib/client.js'), 'utf8')).match(/const PICKER_API = (\d+)/)
    const picker = (await readFile(join(root, 'lib/picker.js'), 'utf8')).match(/\bversion: (\d+)\b/)
    if (client && picker && client[1] !== picker[1] && !flags.has('allow-version-skew')) {
      fail(`版本号不同步：lib/client.js 的 PICKER_API = ${client[1]}，lib/picker.js 的 version = ${picker[1]}（改页面半要一起抬）`)
    }
  }

  if (flags.has('smoke')) {
    const smoke = spawnSync('npm', ['run', 'smoke'], { cwd: root, encoding: 'utf8', shell: true })
    if (smoke.status !== 0) fail(`smoke 未通过：\n${(smoke.stdout || '') + (smoke.stderr || '')}`)
  }

  if (flags.has('dry')) {
    await unlink(tempPath).catch(() => {})
    console.log(`✓ ${target} 验证通过（--dry，未写入）`)
    process.exit(0)
  }

  /* ---------------------------------------------------------------- 3. 验证通过，原子替换 */

  await rename(tempPath, targetPath)
  console.log(`✓ 已替换 ${target}（${payload.length} 字节）`)
} catch (error) {
  await unlink(tempPath).catch(() => {})
  throw error
}

/* ------------------------------------------------------------------ 4. 等热重载真的换上 */

if (target === 'lib/index.js') {
  console.log('ℹ 这是宿主半，不会热更：需要 plugin_manager set_bundle 关→开（或重启应用）才生效。')
}

if (flags.has('no-wait')) process.exit(0)

const port = Number(options.get('port') || process.env.DSH_GUI_PORT || 0)
if (!port) {
  console.log('ℹ 没给 --port，跳过「等重载」这一步。要确认的话：')
  console.log('  node scripts/apply-edit.mjs <同样的文件> --source <backup> --port <GUI 端口>')
  process.exit(0)
}

const expected = options.get('expect') || (await readFile(join(root, 'lib/client.js'), 'utf8')).match(/const VERSION = '([^']+)'/)?.[1]
const deadline = Date.now() + 10_000

function probe() {
  return new Promise((resolve) => {
    const req = request({ host: '127.0.0.1', port, path: '/element-ref/debug', timeout: 1500 }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        } catch {
          resolve(null)
        }
      })
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => {
      req.destroy()
      resolve(null)
    })
    req.end()
  })
}

let lastSeen = ''
while (Date.now() < deadline) {
  const debug = await probe()
  if (debug && Array.isArray(debug.beacons)) {
    const fresh = debug.beacons.filter((beacon) => String(beacon.version || '').startsWith(String(expected || ''))).pop()
    if (fresh) {
      console.log(`✓ 热重载已生效：${fresh.stage} @ ${fresh.at} → ${fresh.version}`)
      process.exit(0)
    }
    const tail = debug.beacons[debug.beacons.length - 1]
    if (tail) lastSeen = `${tail.stage} ${tail.version} @ ${tail.at}`
  }
  await new Promise((resolve) => setTimeout(resolve, 500))
}

console.error(`✗ 已写入，但 10 秒内没等到 ${expected} 的 beacon（最后看到：${lastSeen || '无'}）`)
console.error(`  回滚：git checkout -- ${target}`)
process.exit(3)
