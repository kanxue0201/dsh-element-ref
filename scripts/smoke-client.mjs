/**
 * Interface-half smoke test: run lib/client.js under a stub module loader with a
 * tiny hook runtime, then check the registrations and the insert flow.
 *
 *   node scripts/smoke-client.mjs
 */
import { readFile } from 'node:fs/promises'

// --- a miniature React: createElement + the four hooks the panel uses -----------------
function createElement(type, props, ...children) {
  return { type, props: { ...(props || {}), children: children.length === 0 ? undefined : children.length === 1 ? children[0] : children } }
}

/** The runtime a render pass collects into; hooks delegate here through `active`. */
let active = null

const depsChanged = (a, b) => !a || !b || a.length !== b.length || a.some((value, index) => !Object.is(value, b[index]))

const React = {
  createElement,
  useState(initial) {
    const runtime = active
    const cell = runtime.state(initial)
    return [cell.value, (next) => runtime.set(cell, next)]
  },
  useRef(initial) {
    return active.ref(initial)
  },
  useEffect(fn, deps) {
    active.effect(fn, deps)
  },
  useCallback(fn, deps) {
    return active.callback(fn, deps)
  },
}

/** Render one component with a fresh hook table, settling state updates like React would. */
async function mount(Comp, props) {
  const hooks = []
  let cursor = 0
  let dirty = true
  const effects = []

  const slot = (kind, initial) => {
    const at = cursor
    cursor += 1
    if (!hooks[at] || hooks[at].kind !== kind) hooks[at] = { kind, value: initial }
    return hooks[at]
  }

  const runtime = {
    state(initial) {
      const cell = slot('state', typeof initial === 'function' ? initial() : initial)
      return cell
    },
    set(cell, next) {
      const value = typeof next === 'function' ? next(cell.value) : next
      if (Object.is(value, cell.value)) return
      cell.value = value
      dirty = true
    },
    ref(initial) {
      return slot('ref', { current: initial }).value
    },
    effect(fn, deps) {
      const at = cursor
      cursor += 1
      const previous = hooks[at]
      if (previous && previous.kind === 'effect' && !depsChanged(previous.deps, deps)) return
      // Remember the deps: without this an empty-deps effect subscribes again on every pass.
      hooks[at] = { kind: 'effect', deps, cleanup: previous && previous.cleanup }
      effects.push({ at, fn, deps, cleanup: previous && previous.cleanup })
    },
    callback(fn, deps) {
      const at = cursor
      cursor += 1
      const previous = hooks[at]
      if (previous && previous.kind === 'callback' && !depsChanged(previous.deps, deps)) return previous.value
      hooks[at] = { kind: 'callback', deps, value: fn }
      return fn
    },
  }

  function renderNode(node) {
    if (node === null || node === undefined || typeof node !== 'object') return node
    if (Array.isArray(node)) return node.map(renderNode)
    if (typeof node.type === 'function') return renderNode(node.type(node.props))
    return { ...node, props: { ...node.props, children: renderNode(node.props.children) } }
  }

  let tree = null
  let rounds = 0
  const previousRuntime = active
  active = runtime
  try {
    while (dirty) {
      rounds += 1
      if (rounds > 40) throw new Error('render loop did not settle')
      dirty = false
      cursor = 0
      effects.length = 0
      tree = renderNode({ type: Comp, props })
      for (const effect of effects) {
        if (effect.cleanup) effect.cleanup()
        const cleanup = effect.fn()
        const cell = hooks[effect.at]
        if (cell) cell.cleanup = typeof cleanup === 'function' ? cleanup : undefined
      }
      await new Promise((resolve) => process.nextTick(resolve))
      await new Promise((resolve) => setImmediate(resolve))
    }
  } finally {
    active = previousRuntime
  }
  return tree
}

function walk(node, out = []) {
  if (node === null || node === undefined) return out
  if (Array.isArray(node)) {
    for (const child of node) walk(child, out)
    return out
  }
  if (typeof node !== 'object') return out
  out.push(node)
  walk(node.props && node.props.children, out)
  return out
}

function textOf(node) {
  const parts = []
  const visit = (value) => {
    if (value === null || value === undefined) return
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (typeof value === 'string' || typeof value === 'number') {
      parts.push(String(value))
      return
    }
    if (typeof value === 'object') visit(value.props && value.props.children)
  }
  visit(node)
  return parts.join(' ')
}

let failures = 0
const check = (ok, label, detail) => {
  if (ok) process.stdout.write(`  ok   ${label}\n`)
  else {
    failures += 1
    process.stdout.write(`  FAIL ${label}${detail === undefined ? '' : ` - ${detail}`}\n`)
  }
}

// --- stub the browser surface the bundle touches at load -------------------------------
const registrations = []
const seatEffects = []
const injectedScopes = []
const items = [{
  ref: 'el-1',
  page: 'http://localhost:5173/pricing',
  pageTitle: 'Pricing',
  selector: '#plan-pro > button.cta',
  tag: 'button',
  id: '',
  classes: 'cta',
  text: 'Go Pro',
  outerHTML: '<button class="cta">Go Pro</button>',
  styles: { color: 'rgb(255, 255, 255)' },
  source: 'src/components/Pricing.tsx:42:9',
  ancestors: 'main#app > section.plans > div#plan-pro',
  pickedAt: '2026-11-07T14:00:00.000Z',
}]

globalThis.fetch = async (url, options = {}) => {
  if (String(url).includes('/items')) {
    return { ok: true, status: 200, json: async () => ({ items, seq: 1, endpoint: 'http://127.0.0.1:59276/element-ref' }) }
  }
  if (String(url).includes('/picker.js')) {
    return { ok: true, status: 200, text: async () => '/* picker source */' }
  }
  return { ok: true, status: 200, json: async () => ({ ok: true }) }
}
globalThis.setTimeout = () => 0
globalThis.clearTimeout = () => {}
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true })

let loaded = null
globalThis.window = {
  __ModuleLoader__: {
    load(module) {
      loaded = module
    },
  },
}

const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
const bundleUrl = new URL('../lib/client.js', import.meta.url)
await import(`${bundleUrl.href}?smoke=${Date.now()}`).catch((error) => {
  // The bundle expects browser globals; if evaluation failed, run the same text here.
  process.stdout.write(`  note dynamic import: ${error && error.message}\n`)
})
if (!loaded) {
  const fn = new Function('window', 'navigator', source)
  fn(globalThis.window, globalThis.navigator)
}
check(loaded !== null, 'bundle registers a factory', loaded && loaded.id)
check(source.includes("postJson('/clear'"), 'the dock close button clears the round on the host')
check(source.includes('cancelRound'), 'clearing the round is one named step')
check(source.includes('clearAll'), 'the page is asked to drop its pins directly')
check(source.includes('clearPageMarks'), 'the dock close both tells the host and wipes the page')
// The address-row icon is the switch: pressing it must never start a round, so the direction of
// a click comes from our own state and turning off disarms every frame.
check(source.includes('const disarmPicker'), 'turning picking off has one named step')
check(source.includes('if (pickWantedNow()) {'), 'the icon decides by its own state, not by probing a page')
check(source.includes('__DSH_ELEMENT_REF_SHARED__'), 'the picking flag is shared across module reloads')
check(source.includes('const frames = allBrowserFrames()'), 'disarming reaches every sidebar tab')
check(!source.includes('injectPicker(stale'), 'a stale picker is destroyed, never replaced')
// Every sidebar tab keeps its own frame with a live picker; clearing only one left the tab in
// front armed, so the page kept highlighting after a send.
check(source.includes('function allBrowserFrames'), 'clearing looks at every sidebar browser frame')
check(source.includes('frames.push(bridgeFrame)'), 'the bridged frame is cleared even when it is not listed')
check(source.includes('if (cleared) return \'cleared\''), 'one cleared frame is enough to report a wipe')
// Chips are labels now: no panel, no buttons, hover shows the shortened requirement.
check(source.includes('function chipHint'), 'a chip answers a hover with the shortened requirement')
check(source.includes('title: chipHint(item)'), 'the chip title is the requirement, not the selector')
check(!source.includes('dockPanel'), 'the chip panel is gone')
check(!source.includes('setOpen('), 'a chip no longer opens anything')
check(source.includes('seedCursor'), 'a freshly attached page jumps to the head of the command queue')
check(source.includes("since=999999999"), 'seeding asks the host for the current head, not the history')
check(source.includes('function cardMarkup'), 'each chip rides into the draft as a wire marker the transcript paints')
check(source.includes('function ElementRefCard'), 'a user-text node paints the marker as a block, so the sentence falls on its own line')
check(source.includes("ctx.slots.inject('conversation.user.text.node'"), 'the block is registered in the transcript, not in the composer')
check(source.includes("actions.setDraft(cards + (typed ? CARD_BREAK + typed : ''))"), 'a card-only submit still submits: the markers keep the draft non-empty')
check(!source.includes('按这条批注改。'), 'the canned sentence is gone')
check(!source.includes('细节（选择器 / HTML 快照 / 当前样式）'), 'the body never shows the user a URL')
check(source.includes("](dsh-element:'"), 'the marker names the reference the transcript parses back')
check(source.includes('finishRound'), 'a sent round clears its chips and its pins')
check(source.includes('function captureShot'), 'a picked picture is photographed, since markup carries no pixels')
check(source.includes('const order = prefix ? prefix[1] : (/^\\d+$/.test(refId) ? refId : \'\')'), 'a lone card takes its number from the marker ref')
check(source.includes('capturePage({'), 'the crop comes from the webview itself')
check(source.includes("const SHOT_TAGS = { img: 1, svg: 1, canvas: 1 }"), 'only pictures are photographed')
check(source.includes('if (!rect || rect.width < 4 || rect.height < 4)'), 'a zero-size element is not photographed')

const renderedPortals = []
const plugin = loaded.factory((id) => {
  if (id === 'react-dom/client') return {
    createRoot: (node) => ({
      render(el) { renderedPortals.push({ node, el }) },
      unmount() {},
    }),
  }
  if (id !== 'react') throw new Error(`unexpected require(${id})`)
  return React
})
check(plugin && Array.isArray(plugin.inject) && typeof plugin.apply === 'function', 'factory returns a cordis plugin', JSON.stringify(plugin && plugin.inject))

const ctx = {
  effect(factory) {
    return factory()
  },
  slots: {
    inject(seat, factory) {
      registrations.push({ seat })
      const dispose = factory()
      return () => {
        registrations.push({ seat, disposed: true })
        if (typeof dispose === 'function') dispose()
      }
    },
    register(definition, Body) {
      registrations.push({ definition, Body })
      return () => {}
    },
  },
  sidebarRightTabs: {
    register(definition) {
      registrations.push({ sidebarTab: definition })
      return () => {}
    },
  },
  sidebarRight: {
    openTab(kind) {
      registrations.push({ opened: kind })
    },
  },
  uiConversation: {
    userText: {
      register(rule) {
        registrations.push({ userTextRule: rule })
        return () => {}
      },
    },
  },
}

plugin.apply(ctx)

const seats = registrations.map((row) => row.seat).filter(Boolean)
check(seats.includes('conversation.composer.dock'), 'composer dock seat', seats.join(', '))
check(!seats.some((seat) => seat.indexOf('sidebar.right.pane') === 0), 'no sidebar page seats any more', seats.join(', '))

const bodies = registrations.filter((row) => row.definition)
check(bodies.every((row) => typeof row.Body === 'function'), 'every slot registration has a component')
check(!seats.includes('conversation.session.header.utilities'), 'no conversation header button any more')
check(
  bodies.every((row) => row.definition.name === 'conversation.composer.dock' || row.definition.name === 'conversation.user.text.node'),
  'the plugin only registers the dock and the transcript card',
  JSON.stringify(bodies.map((row) => row.definition.name)),
)
check(registrations.some((row) => row.userTextRule && row.userTextRule.id === 'element-ref'), 'the transcript learns the wire marker')
check(registrations.every((row) => !row.sidebarTab), 'the plugin registers no tab of its own')
check(JSON.stringify(plugin.inject) === JSON.stringify(['slots', 'sidebarRight', 'uiConversation']), 'declares its services', JSON.stringify(plugin.inject))

// --- chips belong to the conversation they were picked in --------------------------------
const clientSource = source
check(clientSource.includes('function ownsSession'), 'chips know their owning conversation')
check(clientSource.includes('function visibleItems(sessionId)'), 'the chip list is scoped by conversation')
check(clientSource.includes('visibleItems(visibleSessionId())'), 'the row and the send button read the live conversation')
check(clientSource.includes('if (owner && !entry.body.session) entry.body.session = owner'), 'a pick reports the conversation it happened in')
check(clientSource.includes('SHARED_ROOT.inputs'), 'the composer registry survives a hot update')
check(clientSource.includes('inputs.get(sessionId) !== actions) inputs.set(sessionId, actions)'), 'a mounted seat registers its composer on render')
check(clientSource.includes("return legacySession !== '' && me === legacySession"), 'untagged annotations stop at the first conversation')
check(clientSource.includes("const NEW_TASK_KEY = 'new-task'"), 'a task without an id gets its own bucket instead of borrowing the last one')
check(clientSource.includes('if (!sessionId && actions) loose.actions = actions'), 'an unnamed composer still hands the send path its face')
check(clientSource.includes('if (key === \'new-task\' && loose.actions) return loose.actions'), 'the unnamed bucket sends through the loose composer')
check(clientSource.includes("postJson('/reassign', { from: NEW_TASK_KEY, to: sid })"), 'the unnamed bucket is re-homed once the task gets a real id')
check(clientSource.includes('function fillEditable(items)'), 'the hero composer is driven through its editor')
check(clientSource.includes("document.execCommand('insertText', false, text)"), 'the markers are typed like a keystroke, so the editor keeps them')
check(clientSource.includes("why: 'dom-fill'"), 'the DOM fallback reports itself')
check(clientSource.includes("actions.setDraft(cards + (typed ? CARD_BREAK + typed : ''))"), 'nothing is typed on the user’s behalf')
check(!clientSource.includes('defaultLead'), 'the auto-written prompt is gone')
check(!clientSource.includes('按这条批注改'), 'the canned sentence is gone')
check(clientSource.includes('async function discardItem'), 'a chip can be dropped on its own')
check(clientSource.includes("'data-element-ref': 'dock-kill'"), 'the chip shows a × on hover')
check(clientSource.includes("title: '取消这次修改'"), 'the × says what it does')

// --- the composer seat is a hidden marker; the chip row is the visible surface ---------
const actions = {
  captureInsertion: () => ({ draftRev: 3 }),
  insertText() { return true },
}
const bridge = bodies.find((row) => row.definition.name === 'conversation.composer.dock').Body
const bridgeNode = await mount(bridge, { sessionId: 's1', inputActions: actions })
check(
  bridgeNode !== null && bridgeNode.props && bridgeNode.props['data-element-ref'] === 'seat',
  'the composer seat leaves a hidden marker naming its conversation',
)
check(
  bridgeNode !== null && bridgeNode.props && bridgeNode.props['data-session'] === 's1',
  'the marker carries the session id the send path reads',
)

// --- prompt assembly, the only thing a send can produce -------------------------------
const { buildPrompt, buildFinalPrompt } = plugin.__test
const oneText = buildPrompt(items[0], false)
check(oneText.includes('#plan-pro > button.cta'), 'scoped request names the selector')
check(oneText.includes('只修改下面这一个元素'), 'scoped request limits the blast radius')
check(oneText.includes('<button class="cta">Go Pro</button>'), 'scoped request carries the element snapshot')
check(oneText.includes('src/components/Pricing.tsx:42:9'), 'scoped request carries the source clue')
check(oneText.trimEnd().endsWith('修改要求：'), 'request leaves a place for the user requirement')

const styleOnly = buildPrompt(items[0], true)
check(styleOnly.includes('只调整下面这个元素的视觉样式'), 'style-only variant')

// --- several annotations travel as one ordered request --------------------------------
items[0].order = 1
items.push({
  ref: 'el-2',
  order: 2,
  page: 'http://localhost:5173/pricing',
  pageTitle: 'Pricing',
  selector: 'section.plans > h1',
  tag: 'h1',
  text: '价格',
  order: 2,
  requirement: '标题再大一点',
  adjustments: { 字号: '64px', 文本颜色: '#111111' },
  pickedAt: '2026-11-07T14:00:05.000Z',
})
const batchOrdered = items.slice().sort((a, b) => a.order - b.order)
const batch = buildPrompt(batchOrdered, false)
check(batch.includes('只修改下面这几处元素'), 'batch request says several places')
check(batch.indexOf('【第 1 处】') < batch.indexOf('【第 2 处】'), 'sections follow annotation order')
check(batch.includes('要改成：') && batch.includes('字号：64px'), 'style adjustments travel with the request')
check(batch.includes('我的要求：标题再大一点'), 'each annotation keeps its own comment')

// Deleting the copy reads as an instruction, not as an empty row.
const cleared = buildPrompt([{ ...items[0], adjustments: { 文本: '' } }], false)
check(cleared.includes('文本：清空'), 'a cleared copy is spelled out in the request')

const typed = buildFinalPrompt(batchOrdered, '顺便把间距收一收')
check(typed.startsWith(batch), 'typed text rides behind the chips, never inside them')
check(typed.trimEnd().endsWith('顺便把间距收一收'), 'typed text closes the message')

// --- a page draft carries its intent in `comment`, not `requirement` -------------------
const savedItems = items.slice()
items.length = 0
items.push({
  ref: 'draft-d1',
  draftId: 'd1',
  draft: true,
  order: 1,
  page: 'https://kanxue.netlify.app/',
  pageTitle: 'Elia — 个人作品集',
  selector: '#hero-name',
  tag: 'h1',
  text: 'Elia',
  comment: '变大',
  adjustments: {},
})
const draftItem = {
  ref: 'draft-d1',
  draftId: 'd1',
  draft: true,
  order: 1,
  page: 'https://kanxue.netlify.app/',
  pageTitle: 'Elia — 个人作品集',
  selector: '#hero-name',
  tag: 'h1',
  text: 'Elia',
  comment: '变大',
  adjustments: {},
}
const draftText = buildPrompt(draftItem, false)
check(draftText.includes('我的要求：变大'), 'a half-written annotation still reaches the request', draftText.slice(-80))
check(!source.includes("'页面里'"), 'the half-written badge left with the chip panel')
items.length = 0
for (const row of savedItems) items.push(row)

// --- the picker itself offers the annotation UI ---------------------------------------
const pickerSource = await readFile(new URL('../lib/picker.js', import.meta.url), 'utf8')
check(!pickerSource.includes('正在批注'), 'the picker has no floating bar: sending lives in the composer only')
check(!pickerSource.includes("className = 'bar'"), 'the old bottom pill is gone')
check(!pickerSource.includes('这一处怎么改'), 'picker no longer uses the single-pick card')
for (const label of ['文本', '文本颜色', '背景', 'Opacity', '字体', '字号', '字重', '边框圆角', '边框颜色', '边框宽度', '宽度', '高度', '内边距', '外边距']) {
  check(pickerSource.includes(`'${label}'`), `style field: ${label}`)
}
check(pickerSource.includes('order: mark.order'), 'the picker tags every annotation with its order')
check(pickerSource.includes('adjustments: mark.adjustments'), 'the picker reports the style adjustments')
check(pickerSource.includes('comment: mark.comment'), 'the picker reports the comment')

// A session with no captured composer must not touch anyone else's draft.
check(source.includes('inputs.get(sessionId)'), 'insertion only targets a session the dock has captured')

// --- picking from the sidebar browser's address row -----------------------------------
let injected = null
let injectCount = 0
let destroyed = 0
const page = { armed: false }
const frames = [{
  getBoundingClientRect: () => ({ width: 900, height: 700, top: 40, left: 0, right: 1200 }),
  executeJavaScript(source) {
    // Every probe asks whether the page still holds a live picker, in one of two shapes: the
    // one-liner used before, or the ARMED_PROBE function that also understands older pickers.
    // The veto flag is poked before every injection; it is not an install.
    if (source.indexOf('__DSH_ELEMENT_REF_OFF__') !== -1) return Promise.resolve(true)
    if (source.indexOf('!!') === 0) return Promise.resolve(page.armed)
    if (source.indexOf('typeof h.destroy') !== -1) return Promise.resolve(page.armed)
    if (source.indexOf('__DSH_ELEMENT_REF__.destroy') !== -1 || source.indexOf('h&&typeof h.destroy') !== -1) {
      destroyed += 1
      page.armed = false
      return Promise.resolve(source.indexOf('"destroyed"') !== -1 ? 'destroyed' : true)
    }
    injected = source
    injectCount += 1
    page.armed = true
    return Promise.resolve(true)
  },
  addEventListener() {},
}]

function fakeElement(tag) {
  const handlers = {}
  const attrs = {}
  const element = {
    tagName: tag,
    style: {},
    children: [],
    parentNode: null,
    setAttribute(name, value) { attrs[name] = String(value) },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null },
    appendChild(child) {
      element.children.push(child)
      child.parentNode = element
      return child
    },
    insertBefore(child, ref) {
      const index = ref ? element.children.indexOf(ref) : -1
      if (index === -1) element.children.unshift(child)
      else element.children.splice(index, 0, child)
      child.parentNode = element
      return child
    },
    removeChild(child) {
      element.children = element.children.filter((row) => row !== child)
      child.parentNode = null
    },
    addEventListener(type, handler) { handlers[type] = handler },
    removeEventListener() {},
    click() { if (handlers.click) handlers.click({ preventDefault() {} }) },
    getBoundingClientRect: () => ({ width: 300, height: 300, top: 40, left: 900, right: 1200 }),
  }
  Object.defineProperty(element, 'nextElementSibling', {
    get() {
      const parent = element.parentNode
      if (!parent) return null
      const at = parent.children.indexOf(element)
      if (at === -1) return null
      return parent.children[at + 1] || null
    },
  })
  Object.defineProperty(element, 'previousSibling', {
    get() {
      const parent = element.parentNode
      if (!parent) return null
      const at = parent.children.indexOf(element)
      if (at <= 0) return null
      return parent.children[at - 1] || null
    },
  })
  return element
}

const bodyElement = fakeElement('body')
const composerCard = fakeElement('div')

// The address row the plugin docks into: [back][addressBox > input][external]
const toolbarRow = fakeElement('div')
const addressBox = fakeElement('div')
const addressInput = fakeElement('input')
const externalTool = fakeElement('button')
toolbarRow.appendChild(fakeElement('button'))
toolbarRow.appendChild(addressBox)
addressBox.appendChild(addressInput)
toolbarRow.appendChild(externalTool)
toolbarRow.querySelector = (selector) => (String(selector).indexOf('input') !== -1 ? addressInput : null)

globalThis.document = {
  body: bodyElement,
  createElement: (tag) => fakeElement(tag),
  createElementNS: (_namespace, tag) => fakeElement(tag),
  querySelectorAll: (selector) => {
    const text = String(selector)
    if (text.indexOf('toolbar') !== -1) return [toolbarRow]
    // The chip row asks which composer is on screen; one card is mounted here.
    if (text.indexOf('data-composer-card') !== -1) return [composerCard]
    if (text.indexOf('data-element-ref="seat"') !== -1) return []
    return frames
  },
  querySelector: (selector) => {
    const text = String(selector)
    if (text.indexOf('data-composer-card') !== -1) return composerCard
    if (text.indexOf('data-element-ref="seat"') !== -1) return null
    return null
  },
}
globalThis.setInterval = () => 0
globalThis.clearInterval = () => {}

// apply() mounts the toolbar icon; a second ctx object drives that path on purpose.
plugin.apply({
  effect(factory) { return factory() },
  slots: ctx.slots,
  sidebarRight: ctx.sidebarRight,
  sidebarRightTabs: ctx.sidebarRightTabs,
})

const pickButton = toolbarRow.children.find(
  (node) => node.tagName === 'button' && node.getAttribute('data-element-ref') === 'toolbar',
)
check(pickButton !== undefined, 'toolbar icon mounts inside the address row')
check(
  pickButton !== undefined && pickButton.parentNode === toolbarRow,
  'toolbar icon is a child of the row, not a body overlay',
)
check(
  pickButton !== undefined && toolbarRow.children.indexOf(pickButton) === toolbarRow.children.indexOf(addressBox) + 1,
  'toolbar icon sits right after the address field',
)
check(
  pickButton !== undefined && bodyElement.children.indexOf(pickButton) === -1,
  'toolbar icon never floats on the body',
)

// Chips must live inside the composer card, as the first row above the text field.
check(renderedPortals.length === 1, 'chip row mounts once', String(renderedPortals.length))
const held = renderedPortals[0]
if (held) {
  check(held.node.parentNode === composerCard, 'chip row sits inside the composer card')
  check(composerCard.children[0] === held.node, 'chip row leads the card, above the input')
  const chipNodes = walk(await mount(held.el.type, held.el.props))
  const chipText = chipNodes.map((node) => textOf(node)).join(' ')
  const rowStyle = (chipNodes[0] && chipNodes[0].props && chipNodes[0].props.style) || {}
  check(String(rowStyle.transition).includes('max-height'), 'the chip row animates its height instead of jumping', String(rowStyle.transition))
  check(rowStyle.maxHeight === 96, 'the row starts collapsed to one line', String(rowStyle.maxHeight))
check(rowStyle.overflow === 'visible', 'the row lets the hover × sit outside the pill', String(rowStyle.overflow))
  check(chipText.includes(`<${items[0].tag}>`) || chipText.includes('button'), 'chip row lists the annotations', JSON.stringify(chipText))
}
const toolbarButton = pickButton
check(toolbarButton !== undefined && typeof toolbarButton.click === 'function', 'toolbar icon renders a button')
check(toolbarButton && toolbarButton.style.cursor === 'pointer', 'toolbar icon looks clickable')
check(toolbarButton && toolbarButton.style.flex === 'none', 'toolbar icon never shrinks the row')

toolbarButton.click()
for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setImmediate(resolve))
check(typeof injected === 'string' && injected.includes('/* picker source */'), 'toolbar icon injects the picker', String(injected).slice(0, 40))
check(injectCount === 1 && page.armed, 'toolbar icon arms picking once', `inject=${injectCount} armed=${page.armed}`)
check(toolbarButton.getAttribute('aria-pressed') === 'true', 'armed icon is pressed for assistive tech')
check(toolbarButton.style.background === '#1890ff', 'armed icon turns accent blue', toolbarButton.style.background)

// Pressing it again must leave pick mode rather than stacking a second picker.
toolbarButton.click()
for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setImmediate(resolve))
check(destroyed === 1 && injectCount === 1, 'toolbar icon toggles picking off', `destroyed=${destroyed} inject=${injectCount}`)
check(page.armed === false, 'picking off leaves the page unarmed')
check(toolbarButton.getAttribute('aria-pressed') === 'false', 'disarmed icon drops the pressed state')

// The page can still be picking while our flag says off (a probe raced a reload). A press on the
// grey icon then means "stop"; injecting is exactly what used to start it again.
page.armed = true
injectCount = 0
destroyed = 0
toolbarButton.click()
for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setImmediate(resolve))
check(
  destroyed === 1 && injectCount === 0 && page.armed === false,
  'a grey icon pressed on a still-armed page stops it instead of starting it',
  `destroyed=${destroyed} inject=${injectCount} armed=${page.armed}`,
)

// Nothing open yet: pressing the icon brings the browser page up instead of failing.
frames.length = 0
toolbarButton.click()
for (let i = 0; i < 3; i += 1) await new Promise((resolve) => setImmediate(resolve))
check(registrations.some((row) => row.opened === 'browser'), 'toolbar icon opens the sidebar browser when none is open', JSON.stringify(registrations.filter((row) => row.opened)))

process.stdout.write(failures === 0 ? '\ninterface half: all checks passed\n' : `\ninterface half: ${failures} check(s) failed\n`)
process.exitCode = failures === 0 ? 0 : 1
