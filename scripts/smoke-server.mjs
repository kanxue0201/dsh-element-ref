/**
 * Host-half smoke test: mount lib/index.js against a stand-in webServer, exercise
 * every route, and check the picker placeholder got substituted.
 *
 *   node scripts/smoke-server.mjs
 */
import { createServer } from 'node:http'
import { apply, inject, name } from '../lib/index.js'

const routes = new Map()
const effects = []
const tools = new Map()

const ctx = {
  effect(factory, label) {
    const dispose = factory()
    effects.push({ label, dispose })
    return dispose
  },
  tools: {
    register(definition) {
      tools.set(definition.name, definition)
      return () => tools.delete(definition.name)
    },
  },
  webServer: {
    getOrigin: () => `http://127.0.0.1:${server.address().port}`,
    get port() {
      return server.address().port
    },
    register(route) {
      if (routes.has(route.path)) throw new Error(`duplicate route ${route.path}`)
      routes.set(route.path, route)
      return () => routes.delete(route.path)
    },
  },
}

const server = createServer((req, res) => {
  const route = routes.get(new URL(req.url, 'http://127.0.0.1').pathname)
  if (!route) {
    res.writeHead(404).end('no route')
    return
  }
  Promise.resolve(route.handler(req, res)).catch((error) => {
    res.writeHead(500).end(String(error))
  })
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`

let failures = 0
const check = (ok, label, detail) => {
  if (ok) process.stdout.write(`  ok   ${label}\n`)
  else {
    failures += 1
    process.stdout.write(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}\n`)
  }
}

apply(ctx)
check(name === 'dsh-element-ref', 'plugin name')
check(JSON.stringify(inject) === '["webServer","tools"]', 'injects webServer and tools')
const tool = tools.get('element_ref_details')
check(tool !== undefined, 'registers the details tool')
check(tool && typeof tool.execute === 'function' && typeof tool.output.render === 'function', 'the tool executes and renders')
const ROUTES = ['picker.js', 'collect', 'draft', 'items', 'update', 'command', 'commands', 'restore', 'delete', 'clear', 'consume', 'purge', 'debug', 'shot']
check(
  ROUTES.every((name) => routes.has(`/element-ref/${name}`)) && routes.size === ROUTES.length,
  'every route registered',
  [...routes.keys()].join(', '),
)

const picker = await (await fetch(`${base}/element-ref/picker.js`)).text()
check(picker.includes(`"${base}/element-ref"`) || picker.includes(`'${base}/element-ref'`), 'picker endpoint substituted')
check(!picker.includes('%%ENDPOINT%%'), 'no placeholder left in picker')
check(picker.includes('captureSnapshot') || picker.includes('outerHTML'), 'picker builds a descriptor')

const empty = await (await fetch(`${base}/element-ref/items`)).json()
check(Array.isArray(empty.items) && empty.items.length === 0, 'list starts empty')
check(empty.endpoint === `${base}/element-ref`, 'list reports its endpoint', empty.endpoint)

// --- a live draft: what the page is still writing shows up in the composer ---------------
const drafted = await (await fetch(`${base}/element-ref/draft`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ draftId: 'd1', order: 1, selector: '#hero-name', tag: 'h1', comment: '再大一点' }),
})).json()
check(drafted.ok === true && drafted.ref === 'draft-d1', 'draft accepted', JSON.stringify(drafted))
const withDraft = await (await fetch(`${base}/element-ref/items`)).json()
check(
  withDraft.items.length === 1 && withDraft.items[0].draft === true && withDraft.items[0].comment === '再大一点',
  'draft shows up in the list',
  JSON.stringify(withDraft.items),
)
await fetch(`${base}/element-ref/draft`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ draftId: 'd1', remove: true }),
})
const noDraft = await (await fetch(`${base}/element-ref/items`)).json()
check(noDraft.items.length === 0, 'draft withdrawn', JSON.stringify(noDraft.items))

const descriptor = {
  page: 'http://localhost:5173/pricing',
  pageTitle: 'Pricing',
  selector: '#plan-pro > button.cta',
  tag: 'button',
  id: '',
  classes: 'cta',
  text: 'Go Pro',
  outerHTML: '<button class="cta">Go Pro</button>',
  styles: { color: 'rgb(255, 255, 255)', 'background-color': 'rgb(47, 107, 255)' },
  source: 'src/components/Pricing.tsx:42:9',
  ancestors: 'main#app > section.plans > div#plan-pro',
  pickedAt: new Date().toISOString(),
}
const collected = await fetch(`${base}/element-ref/collect`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(descriptor),
})
const collectedBody = await collected.json()
check(collected.status === 200 && collectedBody.ref === 'el-1', 'collect stores a descriptor', JSON.stringify(collectedBody))
check(collected.headers.get('access-control-allow-origin') === '*', 'collect answers CORS')

const one = await (await fetch(`${base}/element-ref/items`)).json()
check(one.items.length === 1 && one.items[0].selector === descriptor.selector, 'list returns the pick')
check(typeof one.items[0].receivedAt === 'string', 'pick carries receivedAt')

// --- annotations: comment edits become commands the page polls for ------------------------
const updated = await (await fetch(`${base}/element-ref/update`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ ref: 'el-1', requirement: '标题再大一点' }),
})).json()
check(updated.ok === true, 'update accepts a comment', JSON.stringify(updated))
const withComment = await (await fetch(`${base}/element-ref/items`)).json()
check(withComment.items[0].requirement === '标题再大一点', 'comment reaches the annotation list')

const cmds = await (await fetch(`${base}/element-ref/commands?since=0`)).json()
check(
  cmds.commands.some((c) => c.type === 'comment' && c.ref === 'el-1'),
  'comment is queued for the page',
  JSON.stringify(cmds.commands),
)

const focus = await (await fetch(`${base}/element-ref/command`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ type: 'focus', ref: 'el-1' }),
})).json()
check(focus.ok === true && typeof focus.id === 'number', 'focus command accepted', JSON.stringify(focus))
const afterFocus = await (await fetch(`${base}/element-ref/commands?since=${focus.id}`)).json()
check(afterFocus.commands.length === 0, 'commands cursor advances')

const badCommand = await fetch(`${base}/element-ref/command`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ type: 'nuke', ref: 'el-1' }),
})
check(badCommand.status === 400, 'unknown command rejected', badCommand.status)

const options = await fetch(`${base}/element-ref/collect`, { method: 'OPTIONS' })
check(options.status === 204, 'preflight answered', options.status)

const bad = await fetch(`${base}/element-ref/collect`, { method: 'POST', body: 'not json' })
check(bad.status === 400, 'malformed body rejected', bad.status)

const getCollect = await fetch(`${base}/element-ref/collect`)
check(getCollect.status === 405, 'GET rejected on collect', getCollect.status)

const removed = await (await fetch(`${base}/element-ref/delete`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ ref: 'el-1' }),
})).json()
check(removed.count === 0, 'delete removes the pick', JSON.stringify(removed))

const restored = await (await fetch(`${base}/element-ref/restore`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ item: one.items[0] }),
})).json()
const afterRestore = await (await fetch(`${base}/element-ref/items`)).json()
check(restored.ok === true && afterRestore.items.length === 1, 'restore brings the pick back', JSON.stringify(restored))

await fetch(`${base}/element-ref/collect`, { method: 'POST', body: JSON.stringify(descriptor) })
const cleared = await (await fetch(`${base}/element-ref/clear`, { method: 'POST', body: '{}' })).json()
check(cleared.count === 0, 'clear empties the list', JSON.stringify(cleared))

const afterClear = await (await fetch(`${base}/element-ref/commands?since=0`)).json()
check(
  afterClear.commands.length === 1 && afterClear.commands[0].type === 'cancel',
  'clear drops the replayable queue and leaves only the cancel command',
  JSON.stringify(afterClear.commands),
)

// Ownership: the conversation a pick happened in is recorded with the row, and a later draft from
// another conversation must not steal it.
await fetch(`${base}/element-ref/collect`, {
  method: 'POST',
  body: JSON.stringify({ ...descriptor, session: 'task-a' }),
})
const owned = await (await fetch(`${base}/element-ref/items`)).json()
check(owned.items[0].session === 'task-a', 'a pick remembers the conversation it came from')
await fetch(`${base}/element-ref/draft`, {
  method: 'POST',
  body: JSON.stringify({ draftId: 'own-1', ref: owned.items[0].ref, selector: owned.items[0].selector, session: 'task-b', comment: '再来一版' }),
})
const reOwned = await (await fetch(`${base}/element-ref/items`)).json()
const ownedRow = reOwned.items.find((row) => row.draftId === 'own-1')
check(
  ownedRow !== undefined && ownedRow.session === 'task-b',
  'a fresh draft carries its own conversation',
  JSON.stringify(ownedRow && ownedRow.session),
)
await fetch(`${base}/element-ref/draft`, {
  method: 'POST',
  body: JSON.stringify({ draftId: 'own-1', ref: owned.items[0].ref, selector: owned.items[0].selector, comment: '换个说法' }),
})
const keptOwn = await (await fetch(`${base}/element-ref/items`)).json()
const keptRow = keptOwn.items.find((row) => row.draftId === 'own-1')
check(
  keptRow !== undefined && keptRow.session === 'task-b',
  'a later draft without an owner keeps the one recorded first',
  JSON.stringify(keptRow && keptRow.session),
)
await fetch(`${base}/element-ref/clear`, { method: 'POST', body: '{}' })

// A sent round must stay readable for the model but never come back to the composer — not even
// after a reload, which is what an in-memory "already sent" set failed to survive.
await fetch(`${base}/element-ref/collect`, { method: 'POST', body: JSON.stringify(descriptor) })
const sent = await (await fetch(`${base}/element-ref/items`)).json()
const sentRef = sent.items[0].ref
const consumed = await (await fetch(`${base}/element-ref/consume`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ refs: [sentRef] }),
})).json()
const afterConsume = await (await fetch(`${base}/element-ref/items`)).json()
check(consumed.spent === 1, 'consume marks the sent row', JSON.stringify(consumed))
check(
  afterConsume.items.length === 1 && afterConsume.items[0].spent === true,
  'a consumed row stays readable but is flagged spent',
  JSON.stringify(afterConsume.items),
)

// A brand-new task has no id yet, so its picks share one bucket; once the task is named those rows
// must leave /items entirely — the agent tool lists them, and they are no longer the user's work.
await fetch(`${base}/element-ref/collect`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ ...descriptor, session: 'new-task' }),
})
const purged = await (await fetch(`${base}/element-ref/purge`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ session: 'new-task' }),
})).json()
const afterPurge = await (await fetch(`${base}/element-ref/items`)).json()
check(purged.dropped === 1, 'purge drops the unnamed task bucket', JSON.stringify(purged))
check(
  afterPurge.items.every((row) => row.session !== 'new-task'),
  'nothing named new-task survives a purge',
  JSON.stringify(afterPurge.items.map((row) => row.session)),
)

// A picked picture has no pixels in the markup, so the sidebar posts a PNG and the row carries the
// path; the agent tool is what finally hands it to the model.
const onePixelPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const shotRes = await (await fetch(`${base}/element-ref/shot`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ ref: sentRef, data: onePixelPng }),
})).json()
check(shotRes.ok === true && typeof shotRes.path === 'string' && shotRes.path.endsWith('.png'), 'a screenshot lands on disk', JSON.stringify(shotRes))
const withShot = await (await fetch(`${base}/element-ref/items`)).json()
check(withShot.items[0].screenshot === shotRes.path, 'the row carries its screenshot path', JSON.stringify(withShot.items[0].screenshot))
const details = await tools.get('element_ref_details').execute({})
const shotName = shotRes.path.split(/[\\/]/).pop()
check(details.text.includes(shotName), 'the model-facing tool hands over the screenshot path', details.text.slice(0, 200))

const missing = await fetch(`${base}/element-ref/nothing`)
check(missing.status === 404, 'unknown path stays unhandled', missing.status)

for (const { dispose } of effects.reverse()) dispose()
check(routes.size === 0, 'effects dispose their routes', routes.size)

server.close()
process.stdout.write(failures === 0 ? '\nhost half: all checks passed\n' : `\nhost half: ${failures} check(s) failed\n`)
process.exitCode = failures === 0 ? 0 : 1
