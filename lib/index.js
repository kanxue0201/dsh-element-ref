/**
 * Element-reference plugin — host half.
 *
 * Serves three things on the interface's own origin:
 *   GET  /element-ref/picker.js   the in-page picker (loaded by the user's dev page)
 *   POST /element-ref/collect     a picked element descriptor (cross-origin from that page)
 *   GET  /element-ref/items       what the right-sidebar panel polls
 * plus two bookkeeping routes for the panel: /element-ref/delete and /element-ref/clear.
 *
 * Nothing here touches the agent: the panel turns a descriptor into text and inserts it into
 * the composer, so the request stays a normal user message.
 */
import { readFile } from 'node:fs/promises'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join as joinPath } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-element-ref'
export const inject = ['webServer', 'tools']

/** One list holds every pick; the panel shows the newest first. */
const MAX_ITEMS = 50
/** Pick descriptors are small; a page cannot post more than this. */
const MAX_BODY = 512 * 1024

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '600',
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...CORS,
  })
  res.end(JSON.stringify(body))
}

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('payload too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export function apply(ctx) {
  const items = []
  /**
   * Annotations still being written in the page. The picker upserts one per pin, so the composer
   * shows the comments while they are still being drafted (before 「发送」 turns them into items).
   */
  const drafts = []
  let seq = 0
  /** Bumped whenever anything the two sidebars can see changes. */
  let rev = 0
  /**
   * Commands for the in-page picker (delete an element, restore it, open its style panel, rewrite
   * its comment). The picker polls this queue; the entry id doubles as its cursor.
   */
  const commands = []
  let commandSeq = 0
  const MAX_COMMANDS = 200
  /**
   * Screenshots of picked media elements, keyed by ref. An <img>/<svg>/<canvas> has no pixels in
   * the markup we hand the model, so the sidebar photographs the element and parks the file here;
   * the path travels with the row and the agent tool hands it to the model.
   */
  /**
   * Where the in-page script lives.
   *
   * `import.meta.url` is resolved **when the module loads**, and Node resolves it through any
   * junction to the real directory. So if the plugin folder is moved while the app keeps
   * running, this path points at a directory that no longer exists — the route then throws and
   * the sidebar only shows "注入失败". Probe the path per request and say which paths were
   * tried, so the failure explains itself instead of returning an empty 400.
   */
  const pickerCandidates = () => {
    const list = []
    try {
      list.push(fileURLToPath(new URL('./picker.js', import.meta.url)))
    } catch {
      /* the module URL is always a file URL here, but never let this throw */
    }
    const override = process.env.DSH_ELEMENT_REF_PICKER
    if (typeof override === 'string' && override !== '') list.push(override)
    return list
  }

  const resolvePickerFile = () => {
    for (const candidate of pickerCandidates()) {
      try {
        if (existsSync(candidate)) return candidate
      } catch {
        /* unreadable candidate: try the next one */
      }
    }
    return ''
  }

  const shots = new Map()
  const shotsDir = joinPath(tmpdir(), 'dsh-element-ref-shots')

  const enqueue = (command) => {
    commandSeq += 1
    const entry = { id: commandSeq, ...command, at: new Date().toISOString() }
    commands.push(entry)
    while (commands.length > MAX_COMMANDS) commands.shift()
    rev += 1
    return entry
  }

  const origin = () => {
    try {
      return ctx.webServer.getOrigin()
    } catch {
      return 'http://127.0.0.1:59276'
    }
  }

  /**
   * The origin the *caller* used. `getOrigin()` throws when the listener binds a wildcard
   * address (no URL form) or when this plugin answers before `listen`, so fall back to the
   * request's own Host header — that is exactly the address the browser just reached us on.
   */
  const originFor = (req) => {
    const host = req && req.headers && req.headers.host
    if (typeof host === 'string' && host !== '') {
      const secure = req.socket && req.socket.encrypted === true
      return `${secure ? 'https' : 'http'}://${host}`
    }
    return origin()
  }

  const servePicker = async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return
    }
    // Read per request: the picker is small, and edits then land without a restart.
    const file = resolvePickerFile()
    if (file === '') {
      const tried = pickerCandidates()
      debugLog.push({ at: new Date().toISOString(), stage: 'picker-missing', tried: tried.join(' | ') })
      sendJson(res, 500, {
        error: 'picker.js was not found on disk',
        tried,
        hint: 'restart DSH so the plugin is loaded from its current folder again',
      })
      return
    }
    let source = ''
    try {
      source = await readFile(file, 'utf8')
    } catch (error) {
      sendJson(res, 500, { error: String(error?.message ?? error), file })
      return
    }
    source = source.replace('%%ENDPOINT%%', `${originFor(req)}/element-ref`)
    res.writeHead(200, {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'no-store',
      ...CORS,
    })
    res.end(source)
  }

  const collect = async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'use POST' })
      return
    }
    let payload
    try {
      payload = JSON.parse(await readBody(req))
    } catch (error) {
      sendJson(res, 400, { error: String(error?.message ?? error) })
      return
    }
    if (payload === null || typeof payload !== 'object') {
      sendJson(res, 400, { error: 'expected an element descriptor' })
      return
    }
    seq += 1
    const item = {
      ...payload,
      ref: `el-${seq}`,
      receivedAt: new Date().toISOString(),
    }
    items.push(item)
    while (items.length > MAX_ITEMS) items.shift()
    rev += 1
    sendJson(res, 200, { ok: true, ref: item.ref })
  }

  const list = async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return
    }
    sendJson(res, 200, {
      items: [...items, ...drafts].map((row) => (
        shots.has(row.ref) ? { ...row, screenshot: shots.get(row.ref) } : row
      )),
      seq,
      rev,
      version: commandSeq,
      endpoint: `${originFor(req)}/element-ref`,
    })
  }

  const mutate = async (req, res, remove) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'use POST' })
      return
    }
    let payload = {}
    try {
      payload = JSON.parse((await readBody(req)) || '{}')
    } catch {
      payload = {}
    }
    remove(payload)
    rev += 1
    sendJson(res, 200, { ok: true, seq, rev, count: items.length + drafts.length })
  }

  const findItem = (ref) => items.find((item) => item.ref === ref) || drafts.find((item) => item.ref === ref) || null

  /**
   * Stores the screenshot the sidebar took of one picked element. The bytes arrive as base64 from
   * the renderer (it has the `<webview>` and can crop the element's rect); this half only writes
   * the file and remembers where it is.
   */
  const shot = async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'use POST' })
      return
    }
    let payload = {}
    try {
      payload = JSON.parse((await readBody(req, 8 * 1024 * 1024)) || '{}')
    } catch {
      payload = {}
    }
    const ref = typeof payload.ref === 'string' ? payload.ref : ''
    const data = typeof payload.data === 'string' ? payload.data : ''
    if (!ref || !data) {
      sendJson(res, 400, { error: 'expected { ref, data }' })
      return
    }
    const safe = ref.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 40) || 'shot'
    const file = joinPath(shotsDir, `${safe}-${Date.now()}.png`)
    try {
      await mkdir(shotsDir, { recursive: true })
      await writeFile(file, Buffer.from(data, 'base64'))
    } catch (error) {
      debugLog.push({ at: new Date().toISOString(), stage: 'shot', ok: false, why: String((error && error.message) || error) })
      sendJson(res, 200, { ok: false, error: String((error && error.message) || error) })
      return
    }
    shots.set(ref, file)
    rev += 1
    debugLog.push({ at: new Date().toISOString(), stage: 'shot', ok: true, ref })
    sendJson(res, 200, { ok: true, path: file, bytes: Buffer.byteLength(data, 'base64') })
  }

  /** Live upsert from the page: one row per pin while its comment is still being written. */
  /**
   * A finished round leaves the host, not the memory of a page reload.
   * The rows stay readable for the agent tool, but they are marked spent so the composer can
   * never show them again — an in-memory "already sent" set died with every hot reload and the
   * old chips reappeared as if a new pick had just happened.
   */
  const consume = async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'use POST' })
      return
    }
    let payload = {}
    try {
      payload = JSON.parse((await readBody(req)) || '{}')
    } catch {
      payload = {}
    }
    const refs = Array.isArray(payload.refs) ? payload.refs.map(String) : []
    const wanted = (ref) => refs.length === 0 || refs.includes(ref)
    let spent = 0
    for (const item of items) {
      if (!wanted(item.ref)) continue
      item.spent = true
      spent += 1
    }
    for (let i = drafts.length - 1; i >= 0; i -= 1) {
      if (wanted(drafts[i].ref)) drafts.splice(i, 1)
    }
    rev += 1
    sendJson(res, 200, { ok: true, spent, seq })
  }

  /**
   * Drop every record owned by one conversation key.
   *
   * A brand-new task has no id until its first message, so its picks share the `new-task` bucket.
   * Once that task is named (or closed), the leftovers must not stay in `/items`: the agent tool
   * reads that list, and stale rows would hand the model elements the user already walked away from.
   */
  const purge = async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'use POST' })
      return
    }
    let payload = {}
    try {
      payload = JSON.parse((await readBody(req)) || '{}')
    } catch {
      payload = {}
    }
    const session = typeof payload.session === 'string' ? payload.session : ''
    if (session === '') {
      sendJson(res, 400, { error: 'expected { session }' })
      return
    }
    let dropped = 0
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const item = items[i]
      // Spent rows are what the model reads back after a send: keep them, drop the abandoned ones.
      if (!item || item.session !== session || item.spent === true) continue
      shots.delete(item.ref)
      items.splice(i, 1)
      dropped += 1
    }
    for (let i = drafts.length - 1; i >= 0; i -= 1) {
      if (drafts[i] && drafts[i].session === session) drafts.splice(i, 1)
    }
    if (dropped > 0) rev += 1
    sendJson(res, 200, { ok: true, dropped })
  }

  const draft = async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'use POST' })
      return
    }
    let payload = {}
    try {
      payload = JSON.parse((await readBody(req)) || '{}')
    } catch {
      payload = {}
    }
    const draftId = typeof payload.draftId === 'string' ? payload.draftId : ''
    if (!draftId) {
      sendJson(res, 400, { error: 'expected { draftId }' })
      return
    }
    const at = drafts.findIndex((row) => row.draftId === draftId)
    if (payload.remove) {
      if (at !== -1) drafts.splice(at, 1)
      rev += 1
      sendJson(res, 200, { ok: true, count: drafts.length })
      return
    }
    const ref = `draft-${draftId}`
    const previous = at === -1 ? null : drafts[at]
    const next = {
      ...payload,
      ref,
      draft: true,
      receivedAt: previous ? previous.receivedAt : new Date().toISOString(),
    }
    delete next.remove
    // 页面草稿把意图放在 comment 里，落库条目叫 requirement。两条路径在这里对齐，
    // 否则「正在写、还没点发送」的批注在卡片和 Prompt 里都是空的。
    if (typeof next.comment === 'string' && next.requirement === undefined) next.requirement = next.comment
    // 归属只认第一次落库时的会话：之后切到别的对话继续写批注，也不能把这条标注搬走。
    if (previous && previous.session && !next.session) next.session = previous.session
    if (at === -1) drafts.push(next)
    else drafts[at] = next
    while (drafts.length > MAX_ITEMS) drafts.shift()
    rev += 1
    sendJson(res, 200, { ok: true, ref })
  }

  /** Edit one annotation: the comment text lives here and is mirrored into the page. */
  const update = async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'use POST' })
      return
    }
    let payload = {}
    try {
      payload = JSON.parse((await readBody(req)) || '{}')
    } catch {
      payload = {}
    }
    const item = findItem(payload.ref)
    if (!item) {
      sendJson(res, 404, { error: 'no such annotation' })
      return
    }
    if (typeof payload.requirement === 'string') {
      item.requirement = payload.requirement
      rev += 1
      enqueue({ type: 'comment', ref: item.ref, text: item.requirement })
    }
    sendJson(res, 200, { ok: true, item })
  }

  /** Ask the page to do something to one element (remove it, put it back, open its panel). */
  const command = async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'use POST' })
      return
    }
    let payload = {}
    try {
      payload = JSON.parse((await readBody(req)) || '{}')
    } catch {
      payload = {}
    }
    const allowed = ['delete', 'undo', 'focus', 'comment', 'cancel']
    if (!allowed.includes(payload.type)) {
      sendJson(res, 400, { error: `unknown command "${payload.type}"` })
      return
    }
    const entry = enqueue({
      type: payload.type,
      ref: typeof payload.ref === 'string' ? payload.ref : '',
      selector: typeof payload.selector === 'string' ? payload.selector : '',
      text: typeof payload.text === 'string' ? payload.text : '',
    })
    sendJson(res, 200, { ok: true, id: entry.id, version: commandSeq })
  }

  /** The picker's cursor into the command queue. */
  const commandsOf = async (req, res) => {    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return
    }
    let since = 0
    try {
      since = Number(new URL(req.url, 'http://127.0.0.1').searchParams.get('since') || 0) || 0
    } catch {
      since = 0
    }
    sendJson(res, 200, { commands: commands.filter((entry) => entry.id > since), version: commandSeq })
  }

  /** The renderer reports what its dock is doing; GET returns the recent reports. */
  const debugLog = []
  const debug = async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return
    }
    if (req.method === 'GET') {
      sendJson(res, 200, { beacons: debugLog })
      return
    }
    let payload = {}
    try {
      payload = JSON.parse((await readBody(req)) || '{}')
    } catch {
      payload = {}
    }
    debugLog.push({ at: new Date().toISOString(), ...payload })
    while (debugLog.length > 60) debugLog.shift()
    sendJson(res, 200, { ok: true })
  }

  /** Undo a removal: the panel hands the whole annotation back. */
  const restore = async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'use POST' })
      return
    }
    let payload = {}
    try {
      payload = JSON.parse((await readBody(req)) || '{}')
    } catch {
      payload = {}
    }
    const item = payload && typeof payload.item === 'object' && payload.item ? payload.item : null
    if (!item || typeof item.ref !== 'string' || !item.ref) {
      sendJson(res, 400, { error: 'expected { item: { ref, ... } }' })
      return
    }
    if (!findItem(item.ref)) {
      if (String(item.ref).startsWith('draft-')) drafts.push(item)
      else items.push(item)
    }
    rev += 1
    sendJson(res, 200, { ok: true, count: items.length + drafts.length })
  }

  ctx.effect(
    () => ctx.webServer.register({ path: '/element-ref/picker.js', kind: 'exact', handler: servePicker }),
    'element-ref: picker script',
  )
  ctx.effect(
    () => ctx.webServer.register({ path: '/element-ref/collect', kind: 'exact', handler: collect }),
    'element-ref: collect route',
  )
  ctx.effect(
    () => ctx.webServer.register({ path: '/element-ref/items', kind: 'exact', handler: list }),
    'element-ref: items route',
  )
  ctx.effect(
    () => ctx.webServer.register({ path: '/element-ref/draft', kind: 'exact', handler: draft }),
    'element-ref: draft route',
  )
  ctx.effect(
    () => ctx.webServer.register({ path: '/element-ref/update', kind: 'exact', handler: update }),
    'element-ref: update route',
  )
  ctx.effect(
    () => ctx.webServer.register({ path: '/element-ref/command', kind: 'exact', handler: command }),
    'element-ref: command route',
  )
  ctx.effect(
    () => ctx.webServer.register({ path: '/element-ref/commands', kind: 'exact', handler: commandsOf }),
    'element-ref: commands route',
  )
  ctx.effect(
    () => ctx.webServer.register({ path: '/element-ref/restore', kind: 'exact', handler: restore }),
    'element-ref: restore route',
  )
  ctx.effect(
    () => ctx.webServer.register({
      path: '/element-ref/delete',
      kind: 'exact',
      handler: (req, res) => mutate(req, res, (payload) => {
        const at = items.findIndex((item) => item.ref === payload.ref)
        if (at !== -1) items.splice(at, 1)
        const draftAt = drafts.findIndex((item) => item.ref === payload.ref)
        if (draftAt !== -1) drafts.splice(draftAt, 1)
      }),
    }),
    'element-ref: delete route',
  )
  ctx.effect(
    () => ctx.webServer.register({
      path: '/element-ref/clear',
      kind: 'exact',
      handler: (req, res) => mutate(req, res, () => {
        items.length = 0
        drafts.length = 0
        // A cancelled round has no commands worth replaying: a page that opens later would
        // otherwise apply them one by one and report "this element is gone" for each.
        commands.length = 0
        // Clearing from the sidebar means "forget this round": the page still shows the pins
        // and the previewed styles, so tell it to put them back.
        enqueue({ type: 'cancel', ref: '', selector: '', text: '' })
      }),
    }),
    'element-ref: clear route',
  )
  ctx.effect(
    () => ctx.webServer.register({ path: '/element-ref/shot', kind: 'exact', handler: shot }),
    'element-ref: screenshot route',
  )
  ctx.effect(
    () => ctx.webServer.register({ path: '/element-ref/consume', kind: 'exact', handler: consume }),
    'element-ref: consume route',
  )
  ctx.effect(
    () => ctx.webServer.register({ path: '/element-ref/purge', kind: 'exact', handler: purge }),
    'element-ref: purge route',
  )
  ctx.effect(
    () => ctx.webServer.register({ path: '/element-ref/debug', kind: 'exact', handler: debug }),
    'element-ref: debug route',
  )

  /**
   * The model-facing door to the very rows the page posted.
   *
   * The transcript only carries the card the user sees — the element head line and the ask — so the
   * selector, the HTML snapshot and the computed styles are read from here, on demand. That keeps
   * every implementation detail out of the conversation while the model still edits against the
   * real values.
   */
  const detailOf = (item) => ({
    order: item.order || 0,
    selector: item.selector || '',
    tag: item.tag || '',
    classes: item.classes || '',
    text: item.text || '',
    page: item.page || '',
    pageTitle: item.pageTitle || '',
    outerHTML: item.outerHTML || '',
    styles: item.styles || {},
    adjustments: item.adjustments || {},
    requirement: item.requirement || item.comment || '',
    // A picked <img>/<svg>/<canvas> is also photographed: the markup carries no pixels, and
    // "what does this picture show" is a question the text cannot answer.
    screenshot: shots.get(item.ref) || item.screenshot || '',
  })

  try {
    ctx.tools.register({
      name: 'element_ref_details',
      description:
        'Read the elements the user just picked in the sidebar browser, each with the change they asked for. '
        + 'Call this before editing whenever a user message carries reference cards: a quoted block whose first line looks like '
        + '`<h1 id="hero-name"> 文本“Elia”` and is followed by `要改成 …` and/or `标注 …`. '
        + 'Returns, one entry per card in card order: order, selector, tag, classes, text, page, pageTitle, the outerHTML snapshot, '
        + 'the current computed styles, the requested CSS adjustments, the note, and — for picked images, svg or canvas — '
        + '`screenshot`, an absolute path to a PNG of the element as it looks on the page (open it when the user asks what '
        + 'the picture contains).',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          order: {
            type: 'integer',
            description: 'Only the annotation with this 1-based order, as printed on its card. Omit to read every annotation of this round.',
          },
        },
        required: [],
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            text: { type: 'string', description: 'The annotations, as pretty-printed JSON.' },
          },
          required: ['text'],
        },
        render: (_args, value) => [{ type: 'text', text: value.text }],
      },
      execute(args) {
        const wanted = (args && typeof args.order === 'number')
          ? items.filter((item) => (item.order || 0) === args.order)
          : items
        const rows = wanted
          .slice()
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .map(detailOf)
        return { text: rows.length ? JSON.stringify(rows, null, 2) : '[]' }
      },
    })
    debugLog.push({ at: new Date().toISOString(), stage: 'tool', ok: true, name: 'element_ref_details' })
  } catch (error) {
    // A missing tool registry must not take the picker down: the cards still work, the model just
    // has to ask for details in the chat.
    debugLog.push({ at: new Date().toISOString(), stage: 'tool', ok: false, message: String(error) })
  }
}
