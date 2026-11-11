/**
 * Annotation picker smoke test.
 *
 * The picker runs inside the page under development, so there is no DOM library here: this file
 * builds the smallest DOM that the script actually touches (elements with style, attributes,
 * children, listeners, one shadow root) and drives a full annotation: pick → comment → style
 * panel → save → send → Esc.
 */
import { readFile } from 'node:fs/promises'

let failures = 0
function check(ok, label, detail) {
  if (ok) {
    process.stdout.write(`  ok   ${label}\n`)
    return
  }
  failures += 1
  process.stdout.write(`  FAIL ${label}${detail === undefined ? '' : ` - ${detail}`}\n`)
}

function makeStyle() {
  const store = {}
  const api = {
    setProperty(name, value) {
      store[name] = String(value)
    },
    removeProperty(name) {
      delete store[name]
    },
    getPropertyValue(name) {
      return store[name] === undefined ? '' : String(store[name])
    },
    _store: store,
  }
  return new Proxy(api, {
    get(target, prop) {
      if (prop in target) return target[prop]
      return store[prop] === undefined ? '' : store[prop]
    },
    set(target, prop, value) {
      store[prop] = value
      return true
    },
  })
}

function makeNode(tagName) {
  const node = {
    nodeType: 1,
    tagName: String(tagName || 'div').toUpperCase(),
    id: '',
    className: '',
    classList: [],
    children: [],
    attributes: {},
    listeners: {},
    style: makeStyle(),
    value: '',
    textContent: '',
    innerText: '',
    title: '',
    placeholder: '',
    disabled: false,
    type: '',
    isConnected: true,
    appendChild(child) {
      child.parentNode = node
      node.children.push(child)
      return child
    },
    removeChild(child) {
      const index = node.children.indexOf(child)
      if (index !== -1) node.children.splice(index, 1)
      child.parentNode = null
      return child
    },
    setAttribute(name, value) {
      if (name === 'style') {
        // A real element turns the style attribute into its inline CSS: keep the fake in step.
        const store = node.style._store
        for (const key of Object.keys(store)) delete store[key]
        for (const part of String(value).split(';')) {
          const index = part.indexOf(':')
          if (index > 0) store[part.slice(0, index).trim()] = part.slice(index + 1).trim()
        }
        node.attributes.style = String(value)
        return
      }
      node.attributes[name] = String(value)
    },
    getAttribute(name) {
      if (name === 'style') {
        return Object.entries(node.style._store)
          .map(([key, value]) => `${key}: ${value}`)
          .join('; ')
      }
      return Object.prototype.hasOwnProperty.call(node.attributes, name) ? node.attributes[name] : null
    },
    removeAttribute(name) {
      if (name === 'style') {
        const store = node.style._store
        for (const key of Object.keys(store)) delete store[key]
      }
      delete node.attributes[name]
    },
    addEventListener(type, handler) {
      node.listeners[type] = node.listeners[type] || []
      node.listeners[type].push(handler)
    },
    removeEventListener(type, handler) {
      const list = node.listeners[type] || []
      const index = list.indexOf(handler)
      if (index !== -1) list.splice(index, 1)
    },
    getBoundingClientRect() {
      return node._rect || { left: 40, top: 60, right: 240, bottom: 100, width: 200, height: 40, x: 40, y: 60 }
    },
    attachShadow() {
      const shadow = makeNode('shadow-root')
      node.shadowRoot = shadow
      return shadow
    },
    querySelectorAll() {
      return []
    },
    querySelector() {
      return null
    },
    focus() {},
    setSelectionRange() {},
    click() {
      const event = { preventDefault() {}, stopPropagation() {} }
      for (const handler of node.listeners.click || []) handler(event)
    },
  }
  Object.defineProperty(node, 'firstChild', { get: () => node.children[0] || null })
  Object.defineProperty(node, 'parentElement', { get: () => node.parentNode || null })
  Object.defineProperty(node, 'outerHTML', {
    get: () => `<${node.tagName.toLowerCase()}>${node.textContent}</${node.tagName.toLowerCase()}>`,
  })
  return node
}

const html = makeNode('html')
const body = makeNode('body')
html.appendChild(body)
const documentNode = makeNode('document')
documentNode.documentElement = html
documentNode.body = body
documentNode.title = 'Elia — 个人作品集'
documentNode.createElement = (tag) => makeNode(tag)
documentNode.createElementNS = (namespace, tag) => makeNode(tag)
documentNode.querySelectorAll = () => []
documentNode.querySelector = () => null
documentNode.elementFromPoint = () => null

const windowListeners = {}
const fakeWindow = {
  innerWidth: 1440,
  innerHeight: 900,
  CSS: { escape: (value) => String(value) },
  addEventListener(type, handler) {
    windowListeners[type] = windowListeners[type] || []
    windowListeners[type].push(handler)
  },
  removeEventListener(type, handler) {
    const list = windowListeners[type] || []
    const index = list.indexOf(handler)
    if (index !== -1) list.splice(index, 1)
  },
}

const COMPUTED = {
  color: 'rgb(17, 24, 39)',
  'background-color': 'rgba(0, 0, 0, 0)',
  opacity: '1',
  'font-family': 'system-ui',
  'font-size': '16px',
  'font-weight': '400',
  'border-radius': '0px',
  'border-top-color': 'rgb(0, 0, 0)',
  'border-top-width': '0px',
  width: '400px',
  height: '60px',
  padding: '0px',
  margin: '0px',
  display: 'block',
}

function dashOf(name) {
  return String(name).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

function getComputedStyle() {
  return new Proxy(COMPUTED, {
    get(target, prop) {
      if (prop === 'getPropertyValue') return (name) => target[name] ?? target[dashOf(name)] ?? ''
      if (typeof prop === 'string' && prop in target) return target[prop]
      return target[dashOf(prop)] ?? ''
    },
  })
}

fakeWindow.getComputedStyle = getComputedStyle

const posts = []
const drafts = []

/**
 * Plays the host renderer: drains the page outbox over executeJavaScript and posts for it.
 * That is how the real bundle talks to DSH when the site is on another origin.
 */
function pump() {
  const api = fakeWindow.__DSH_ELEMENT_REF__
  if (!api || typeof api.drain !== 'function') return
  const entries = JSON.parse(api.drain() || '[]')
  for (const entry of entries) {
    if (entry.kind === 'draft') drafts.push(entry.body)
    else if (entry.kind === 'collect') posts.push(entry.body)
  }
}
async function fakeFetch(url, options = {}) {
  if (String(url).includes('/draft')) {
    drafts.push(JSON.parse(options.body))
    return { ok: true, status: 200, json: async () => ({ ok: true, ref: 'draft-' + drafts.length }) }
  }
  if (String(url).includes('/collect')) {
    posts.push(JSON.parse(options.body))
    return { ok: true, status: 200, json: async () => ({ ok: true, ref: 'el-' + posts.length }) }
  }
  return { ok: true, status: 200, json: async () => ({ ok: true }) }
}

const timers = []
const source = await readFile(new URL('../lib/picker.js', import.meta.url), 'utf8')
// The picker only installs when the injector put its one-shot marker in front of the source.
fakeWindow.__DSH_ELEMENT_REF_GO__ = true

const run = new Function(
  'window', 'document', 'fetch', 'getComputedStyle', 'setInterval', 'clearInterval', 'setTimeout', 'location', 'console',
  source,
)
const boot = () => {
  fakeWindow.__DSH_ELEMENT_REF_GO__ = true
  run(
    fakeWindow,
    documentNode,
    fakeFetch,
    getComputedStyle,
    (fn) => { timers.push(fn); return timers.length },
    () => {},
    (fn, ms) => setTimeout(fn, Math.min(Number(ms) || 0, 5)),
    { href: 'http://127.0.0.1:3210/' },
    { log() {} },
  )
}

boot()

check(!!fakeWindow.__DSH_ELEMENT_REF__, 'picker installs its handle')
check(typeof fakeWindow.__DSH_ELEMENT_REF__.destroy === 'function', 'handle exposes destroy')

const host = html.children.find((child) => child.getAttribute('data-dsh-element-ref') !== null)
check(!!host && !!host.shadowRoot, 'picker mounts a shadow host')
const shadow = host.shadowRoot
function walk(node, out = []) {
  out.push(node)
  for (const child of node.children || []) walk(child, out)
  if (node.shadowRoot) walk(node.shadowRoot, out)
  return out
}
const nodes = () => walk(shadow)
const byClass = (name) => nodes().filter((node) => String(node.className || '').split(/\s+/).includes(name))
const byText = (text) => nodes().filter((node) => node.textContent === text)
const fire = (node, type, event = {}) => {
  for (const handler of node.listeners[type] || []) {
    handler({ preventDefault() {}, stopPropagation() {}, ...event })
  }
}
const pageClick = (target) => {
  for (const handler of windowListeners.click || []) {
    handler({ target, shiftKey: false, composedPath: () => [], preventDefault() {}, stopPropagation() {} })
  }
}

// --- pick a first element -----------------------------------------------------------
const root = makeNode('body')
const paragraph = makeNode('p')
paragraph.textContent = '软件工程本科在读。做过一个已经跑在本地的小工具。'
paragraph._rect = { left: 300, top: 200, right: 700, bottom: 260, width: 400, height: 60, x: 300, y: 200 }
root.appendChild(paragraph)
pageClick(paragraph)

const markers = () => byClass('mark')
check(markers().length === 1, 'clicking an element pins it', String(markers().length))
check(markers()[0] && markers()[0].textContent === '1', 'the pin carries its order')
const bubble = () => byClass('pill')[0]
check(bubble() && bubble().style.display === 'flex', 'the comment pill opens under the pin')
check(byText('正在批注 · 1').length === 0, 'no floating bar any more: the composer owns sending')

// --- an untouched pin is not an annotation yet: the composer stays empty ------------
await new Promise((resolve) => setTimeout(resolve, 400))
pump()
check(drafts.length === 0, 'a fresh pin is not listed in the composer yet', JSON.stringify(drafts.map((d) => d.draftId)))

// --- an untouched pin follows the next click ----------------------------------------
const heading = makeNode('h1')
heading.textContent = 'Elia'
heading._rect = { left: 300, top: 100, right: 520, bottom: 170, width: 220, height: 70, x: 300, y: 100 }
root.appendChild(heading)
const pinTop = () => Math.round(parseFloat(markers()[0].style.top))
pageClick(heading)
check(markers().length === 1, 'an untouched pin does not stack a second one', String(markers().length))
check(pinTop() === 89, 'the untouched pin moves onto the new element', String(pinTop()))
pageClick(paragraph)
check(pinTop() === 189, 'and follows the click back', String(pinTop()))

const commentInput = byClass('cinput')[0]
check(!!commentInput, 'the pill has a comment field')
commentInput.value = '这几行字再大一点'
fire(commentInput, 'input', { target: commentInput })
await new Promise((resolve) => setTimeout(resolve, 400))
pump()
const lastDraft = drafts[drafts.length - 1]
check(drafts.length === 0, 'typing a comment does not list it before saving', JSON.stringify(drafts.map((d) => d.draftId)))
pageClick(heading)
check(markers().length === 1, 'a written comment waits for the confirm', String(markers().length))
check(bubble().style.display === 'flex', 'the open comment stays open while it waits')
const okButton = byClass('ok')[0]
check(okButton && okButton.className.includes('ready'), 'the confirm button lights up when the comment has text')
fire(okButton, 'click')
check(bubble().style.display === 'none', 'confirming closes the pill')
await new Promise((resolve) => setTimeout(resolve, 400))
pump()
const savedDraft = drafts[drafts.length - 1]
check(
  drafts.length === 1 && savedDraft && savedDraft.comment === '这几行字再大一点',
  'saving publishes the annotation to the composer',
  JSON.stringify(drafts.map((d) => d.comment)),
)
check(savedDraft && savedDraft.selector && savedDraft.tag === 'p', 'the draft carries the element', JSON.stringify(savedDraft && savedDraft.selector))

// --- once confirmed, the next element gets its own pin -------------------------------
pageClick(heading)
check(markers().length === 2, 'a second pick adds a second pin', String(markers().length))
check(markers()[1].textContent === '2', 'the second pin is numbered 2')
const okIdle = byClass('ok')[0]
check(!okIdle.className.includes('ready'), 'an untouched pin cannot be confirmed')
fire(okIdle, 'click')
check(bubble().style.display === 'flex', 'confirming does nothing while nothing has changed')
commentInput.value = '标题再大一点'
fire(commentInput, 'input', { target: commentInput })
check(byClass('ok')[0].className.includes('ready'), 'the confirm lights up once this pin is written')
fire(byClass('ok')[0], 'click')
check(bubble().style.display === 'none', 'confirming the second pin clears the way')

// --- style panel: open on the first pin, change a colour, save ----------------------
pageClick(paragraph)
const tweak = byClass('iconBtn')[0]
check(!!tweak, 'the pill has the adjust button')
fire(tweak, 'click')
const panel = byClass('panel')[0]
check(panel && panel.style.display === 'flex', 'the adjust button opens the style panel')
const panelComment = byClass('pcomment')[0]
check(!!panelComment, 'the panel carries its own comment box')
check(panelComment.value === '这几行字再大一点', 'the panel comment mirrors the pill', String(panelComment.value))
panelComment.value = '这几行字再大一点，顺便换个颜色'
fire(panelComment, 'input', { target: panelComment })
check(commentInput.value === '这几行字再大一点，顺便换个颜色', 'editing in the panel writes back to the pill', String(commentInput.value))
const rows = nodes().filter((node) => String(node.className || '').indexOf('row') === 0)
check(rows.length === 12, 'the panel lists every basic control', String(rows.length))
const labels = rows.map((row) => row.children[0].textContent)
for (const label of ['文本', '文本颜色', '背景', 'Opacity', '字体', '字号', '字重', '边框圆角', '边框颜色', '边框宽度', '宽度', '高度']) {
  check(labels.includes(label), `panel row: ${label}`)
}

const colorRow = rows.find((row) => row.children[0].textContent === '文本颜色')
const colorInput = colorRow.children[1].children[0].children[1]
colorInput.value = '#ff0000'
fire(colorInput, 'input', { target: colorInput })
check(paragraph.style._store.color === '#ff0000', 'a panel edit previews on the page', paragraph.style._store.color)

const radiusRow = rows.find((row) => row.children[0].textContent === '边框圆角')
const radiusInput = radiusRow.children[1].children[0].children[0]
radiusInput.value = '12'
fire(radiusInput, 'input', { target: radiusInput })
check(paragraph.style._store['border-radius'] === '12px', 'length edits get px', paragraph.style._store['border-radius'])
// Undo: the row only grows a revert button after it changes, and pressing it puts the page's
// own value back instead of leaving a zero behind.
const radiusCtl = radiusRow.children[1]
const undoBtn = radiusCtl.children[radiusCtl.children.length - 1]
check(String(undoBtn.className) === 'undoBtn', 'each field ends with an undo button')
check(undoBtn.style.display === 'flex', 'undo shows up once the field changed', String(undoBtn.style.display))
fire(undoBtn, 'click')
check(paragraph.style._store['border-radius'] === undefined, 'undo puts the page value back', String(paragraph.style._store['border-radius']))
check(radiusInput.value === '0', 'undo restores the number too', radiusInput.value)
check(undoBtn.style.display === 'none', 'undo hides again after reverting', String(undoBtn.style.display))
// 内边距 / 外边距：四个框各带一个撤销，只在该边被改过时出现。
const padGroup = nodes().filter((node) => String(node.className || '').indexOf('sidesGroup') === 0)[0]
check(!!padGroup, 'the panel carries the padding group')
const padBody = padGroup.children[1]
const firstPair = padBody.children[0]
const padFields = firstPair.children[2]
const padBox = padFields.children[0]
const padUndo = padBox.children[padBox.children.length - 1]
check(String(padUndo.className) === 'undoBtn', 'each side box carries an undo button')
check(padUndo.style.display === 'none', 'an untouched side keeps it hidden', String(padUndo.style.display))
const padInput = padBox.children[0]
padInput.value = '24'
fire(padInput, 'input', { target: padInput })
check(paragraph.style._store.padding === '24px 0px 0px 0px', 'a side writes the shorthand', String(paragraph.style._store.padding))
check(padUndo.style.display === 'flex', 'a changed side shows its undo', String(padUndo.style.display))
fire(padUndo, 'click')
check(paragraph.style._store.padding === undefined, 'undoing a side clears the shorthand', String(paragraph.style._store.padding))
check(padUndo.style.display === 'none', 'the side undo hides again', String(padUndo.style.display))
check(source.indexOf('function restorePreview') !== -1, 'folding the panel rolls the preview back')
check(source.indexOf('restorePreview(badge)') !== -1, 'the badge folds with a rollback')

fire(byText('保存')[0], 'click')
check(panel.style.display === 'none', 'saving closes the panel')
check(bubble().style.display === 'none', 'saving is the confirmation: the pill closes too')
check(markers().length === 2, 'saving keeps both pins', String(markers().length))
check(markers().every((pin) => String(pin.className).indexOf('saved') === -1), 'pins never turn green', markers().map((pin) => pin.className).join(','))
check(String(markers()[0].tagName).toLowerCase() === 'div', 'pins are display-only, not buttons', String(markers()[0].tagName))
fire(markers()[0], 'click')
check(bubble().style.display === 'none', 'clicking a pin does nothing')

// --- every annotation is reported to the sidebar, newest state per pin ---------------
await new Promise((resolve) => setTimeout(resolve, 400))
pump()
const latestDrafts = new Map()
for (const d of drafts) {
  if (d.remove) latestDrafts.delete(d.draftId)
  else latestDrafts.set(d.draftId, d)
}
const reported = Array.from(latestDrafts.values()).sort((a, b) => Number(a.order) - Number(b.order))
check(reported.length === 2, 'both annotations are reported to the sidebar', String(reported.length))
const firstReport = reported[0]
check(firstReport && firstReport.order === 1, 'the first report carries its order', JSON.stringify({ order: firstReport && firstReport.order }))
check(firstReport && firstReport.comment === '这几行字再大一点，顺便换个颜色', 'the report carries the comment', firstReport && firstReport.comment)
check(firstReport && firstReport.adjustments && firstReport.adjustments['文本颜色'] === '#ff0000', 'the report carries the colour edit', JSON.stringify(firstReport && firstReport.adjustments))
check(firstReport && firstReport.selector && firstReport.tag === 'p', 'the report describes the element', JSON.stringify({ selector: firstReport && firstReport.selector }))
check(reported[1] && reported[1].tag === 'h1', 'the second report keeps its place', JSON.stringify({ tag: reported[1] && reported[1].tag }))
check(markers().length === 2, 'the pins stay put: the composer is the only way to send', String(markers().length))

// --- the composer panel's × rolls the whole round back -------------------------------
const scrap = makeNode('h2')
scrap.textContent = '要被撤掉的一处'
scrap.setAttribute('style', 'color: blue;')
scrap._rect = { left: 120, top: 520, right: 520, bottom: 560, width: 400, height: 40, x: 120, y: 520 }
root.appendChild(scrap)
pageClick(scrap)
const scrapComment = byClass('cinput')[0]
scrapComment.value = '这处不要了'
fire(scrapComment, 'input', { target: scrapComment })
check(markers().length === 3, 'the scrap pin joins the two already on the page', String(markers().length))

const handled = fakeWindow.__DSH_ELEMENT_REF__.applyCommands(JSON.stringify([{ id: 99, type: 'cancel' }]))
check(handled === 1, 'the page accepts a cancel command', String(handled))
check(markers().length === 0, 'cancel removes the pins', String(markers().length))
check(String(scrap.getAttribute('style') || '').indexOf('blue') !== -1, 'cancel puts the previewed style back', String(scrap.getAttribute('style')))
check(fakeWindow.__DSH_ELEMENT_REF__.state().marks === 0, 'cancel leaves nothing behind in the picker', JSON.stringify(fakeWindow.__DSH_ELEMENT_REF__.state()))

// --- second click on an untouched pin means "never mind" ----------------------------
const dummy = makeNode('div')
dummy.textContent = '临时元素'
dummy._rect = { left: 300, top: 400, right: 600, bottom: 440, width: 300, height: 40, x: 300, y: 400 }
root.appendChild(dummy)
pageClick(dummy)
check(markers().length === 1, 'a fresh pin waits for input', String(markers().length))
pageClick(dummy)
check(markers().length === 0, 'clicking the same untouched element cancels its pin', String(markers().length))
check(bubble().style.display === 'none', 'cancelling by element also closes the pill')
pageClick(dummy)
check(markers().length === 1, 'the element can be picked again afterwards', String(markers().length))
fire(markers()[0], 'click')
check(markers().length === 1, 'clicking a pin does not add or drop anything', String(markers().length))
pump()
check(drafts.some((entry) => entry.remove === true), 'the cancelled pin is withdrawn from the host')

// --- the panel foot is 取消 / 保存, with no way to delete the element -----------------
const second = makeNode('div')
second.textContent = '第二处'
second._rect = { left: 320, top: 520, right: 620, bottom: 560, width: 300, height: 40, x: 320, y: 520 }
root.appendChild(second)
pageClick(second)
check(markers().length === 1, 'the second element gets its own pin', String(markers().length))
fire(byClass('iconBtn')[0], 'click')
check(byClass('trash').length === 0, 'the panel has no remove button')
check(byText('保存')[0].style.display === 'none', 'save stays hidden while nothing has changed')
const footButtons = byClass('btn').map((node) => node.textContent).filter(Boolean)
check(footButtons.includes('取消') && footButtons.includes('保存'), 'the panel foot is cancel and save', JSON.stringify(footButtons))
const cancelRows = nodes().filter((node) => String(node.className || '').indexOf('row') === 0)
const cancelColor = cancelRows.filter((row) => row.children[0].textContent === '文本颜色').pop().children[1].children[0].children[1]
cancelColor.value = '#00ff00'
fire(cancelColor, 'input', { target: cancelColor })
check(byText('保存')[0].style.display !== 'none', 'save appears once a style has changed')

// Editing the text value is also a change: the save button has to come back without the
// picker having to be re-armed.
const textRows = nodes().filter((node) => String(node.className || '').indexOf('row') === 0)
const textInput = textRows.filter((row) => row.children[0].textContent === '文本').pop().children[1].children[0]
textInput.value = 'Elia 2'
fire(textInput, 'input', { target: textInput })
check(byText('保存')[0].style.display !== 'none', 'editing the text value also reveals save')
// Clearing the copy is an edit of its own: the row keeps its key (with an empty value) so the
// annotation can still be published instead of dissolving into "nothing changed".
textInput.value = ''
fire(textInput, 'input', { target: textInput })
check(byText('保存')[0].style.display !== 'none', 'clearing the text keeps save available')
check(source.includes('else mark.adjustments[label] = raw'), 'a cleared copy stays in the adjustments')
textInput.value = 'Elia 2'
fire(textInput, 'input', { target: textInput })
check(second.style._store.color === '#00ff00', 'the panel previews before cancelling', second.style._store.color)
const secondRemove = second.removeChild
let removedByPanel = false
second.removeChild = function patched(node) { removedByPanel = true; return secondRemove.call(this, node) }
fire(byClass('btn').find((node) => node.textContent === '取消'), 'click')
check(second.textContent === '第二处', 'cancel puts the original copy back', JSON.stringify(second.textContent))
check(!removedByPanel && second.parentNode === root, 'cancel never detaches the element')
check(second.style._store.color === undefined, 'cancel restores the page preview', String(second.style._store.color))
check(markers().length === 0, 'cancel drops the whole draft, leaving no empty pin', String(markers().length))
check(bubble().style.display === 'none' && byClass('panel')[0].style.display === 'none', 'cancel closes both the pill and the panel')
pump()
check(drafts.filter((entry) => entry.remove === true).length >= 2, 'the discarded draft is withdrawn from the host')
for (const handler of windowListeners.keydown || []) {
  handler({ key: 'Escape', preventDefault() {}, stopPropagation() {} })
}

// --- the chip's × deletes one pin (source contract) ----------------------------------
check(source.includes("command.type === 'delete'"), 'the page understands a delete command')
check(source.includes('refs: marks.map'), 'the picker reports which row each pin belongs to')

// --- opening the colour popover is read-only (source contract) -----------------------
check(source.includes('paint(false)'), 'opening the colour popover paints without committing')
check(source.includes('if (commit !== false) onPick(picked)'), 'only a real pick rewrites the colour field')
check(!source.includes('onPick(item.value)'), 'menu rows do not share one captured value')
check(source.includes('seedOf(mark, prop, computedValue)'), 'undo goes back to the page value seen on first open')
check(source.includes('mark.seed = null'), 're-targeting an element forgets the old page values')
check(source.includes('})(item.value)'), 'menu rows close over their own value')

// --- Escape leaves the page as it was -----------------------------------------------
const keyEscape = { key: 'Escape' }
for (const handler of windowListeners.keydown || []) {
  handler({ ...keyEscape, preventDefault() {}, stopPropagation() {} })
}
check(host.parentNode === null && !html.children.includes(host), 'Escape removes the overlay')
check(!fakeWindow.__DSH_ELEMENT_REF__, 'Escape clears the handle')
check(paragraph.style._store.color === undefined, 'unsent previews are rolled back', String(paragraph.style._store.color))

process.stdout.write(failures === 0 ? '\nannotation picker: all checks passed\n' : `\nannotation picker: ${failures} check(s) failed\n`)
if (failures > 0) process.exitCode = 1
