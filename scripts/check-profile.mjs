/**
 * Profile-composition check: read the live desktop profile the way the Electron app does,
 * and report whether this bundle resolved, parsed, and landed in the tree.
 *
 *   node scripts/check-profile.mjs [profileDir] [installDir]
 *
 * Both halves are resolved against the installed DSH app; nothing is written.
 */
const profileDir = process.argv[2] ?? 'C:/Users/15421/.dsh/profiles/desktop'
const installDir = process.argv[3] ?? 'D:/dsh_asar/dsh'

const appBoot = await import(`file:///${installDir.replaceAll('\\', '/')}/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js`)

const profile = appBoot.loadProfileDirectory('dsh', profileDir, `${installDir}/package.json`)

process.stdout.write(`profile: ${profile.name}\n`)
process.stdout.write(`bundles resolved: ${profile.layers.length}\n`)
for (const skipped of profile.skippedBundles) process.stdout.write(`  skipped ${skipped.packageName}: ${skipped.reason}\n`)

const ours = profile.layers.find((layer) => layer.packageName === 'dsh-element-ref')
if (ours === undefined) {
  process.stdout.write('dsh-element-ref: NOT in the composed profile\n')
  process.exitCode = 1
} else {
  process.stdout.write(`dsh-element-ref: layer at ${ours.packageDir}\n`)
  process.stdout.write(`  patch files: ${ours.patchPaths.join(', ')}\n`)
  process.stdout.write(`  entries: ${ours.patches.map((patch) => JSON.stringify(patch)).join(' ')}\n`)
}

const composed = profile.layers.flatMap((layer) => layer.patches).concat(profile.patches)
const entries = composed.flatMap((patch) => (Array.isArray(patch?.insert) ? patch.insert : []))
const entry = entries.find((row) => row?.name === 'dsh-element-ref')
if (entry === undefined) {
  process.stdout.write('dsh-element-ref: no insert entry in the composed tree\n')
  process.exitCode = 1
} else {
  process.stdout.write(`insert entry: ${JSON.stringify(entry)}\n`)
}

// The client half is published from the package manifest, so validate it here too.
const { readFile } = await import('node:fs/promises')
const manifest = JSON.parse(await readFile(`${ours.packageDir}/package.json`, 'utf8'))
const client = manifest.dsh?.client
process.stdout.write(`client declaration: ${JSON.stringify(client)}\n`)
const clientExport = typeof manifest.exports?.['./client'] === 'string'
  ? manifest.exports['./client']
  : manifest.exports?.['./client']?.default
process.stdout.write(`exports["./client"]: ${clientExport ?? 'MISSING'}\n`)
if (typeof clientExport !== 'string') process.exitCode = 1
else {
  const { access } = await import('node:fs/promises')
  await access(`${ours.packageDir}/${clientExport.replace(/^\.\//, '')}`).then(
    () => process.stdout.write(`client bundle present: ${clientExport}\n`),
    () => {
      process.stdout.write(`client bundle MISSING: ${clientExport}\n`)
      process.exitCode = 1
    },
  )
}
