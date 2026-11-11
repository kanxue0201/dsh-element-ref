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
      node.attributes[name] = String(value)
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(node.attributes, name) ? node.attributes[name] : null
    },
    removeAttribute(name) {
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
async function fakeFetch(url, options = {}) {
  if (String(url).includes('/collect')) {
    posts.push(JSON.parse(options.body))
    return { ok: true, status: 200, json: async () => ({ ok: true, ref: 'el-' + posts.length }) }
  }
  return { ok: true, status: 200, json: async () => ({ ok: true }) }
}

const timers = []
const source = await readFile(new URL('../lib/picker.js', import.meta.url), 'utf8')

const run = new Function(
  'window', 'document', 'fetch', 'getComputedStyle', 'setInterval', 'clearInterval', 'setTimeout', 'location', 'console',
  source,
)
run(
  fakeWindow,
  documentNode,
  fakeFetch,
  getComputedStyle,
  (fn) => { timers.push(fn); return timers.length },
  () => {},
  () => 0,
  { href: 'http://127.0.0.1:3210/' },
  { log() {} },
)

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
const paragraph = makeNode('p')
paragraph.textContent = '软件工程本科在读。做过一个已经跑在本地的小工具。'
paragraph._rect = { left: 300, top: 200, right: 700, bottom: 260, width: 400, height: 60, x: 300, y: 200 }
pageClick(paragraph)

const markers = () => byClass('mark')
check(markers().length === 1, 'clicking an element pins it', String(markers().length))
check(markers()[0] && markers()[0].textContent === '1', 'the pin carries its order')
const bubble = () => byClass('pill')[0]
check(bubble() && bubble().style.display === 'flex', 'the comment pill opens under the pin')
check(!!byText('正在批注 · 1')[0], 'the bar counts the annotations')

const commentInput = byClass('cinput')[0]
check(!!commentInput, 'the pill has a comment field')
commentInput.value = '这几行字再大一点'
fire(commentInput, 'input', { target: commentInput })
const okButton = byClass('ok')[0]
check(okButton && okButton.className.includes('ready'), 'the confirm button lights up when the comment has text')
fire(okButton, 'click')
check(bubble().style.display === 'none', 'confirming closes the pill')

// --- a second element keeps counting ------------------------------------------------
const heading = makeNode('h1')
heading.textContent = 'Elia'
heading._rect = { left: 300, top: 100, right: 520, bottom: 170, width: 220, height: 70, x: 300, y: 100 }
pageClick(heading)
check(markers().length === 2, 'a second pick adds a second pin', String(markers().length))
check(markers()[1].textContent === '2', 'the second pin is numbered 2')

// --- style panel: open on the first pin, change a colour, save ----------------------
pageClick(paragraph)
const tweak = byClass('iconBtn')[0]
check(!!tweak, 'the pill has the adjust button')
fire(tweak, 'click')
const panel = byClass('panel')[0]
check(panel && panel.style.display === 'flex', 'the adjust button opens the style panel')
const rows = nodes().filter((node) => String(node.className || '') === 'row')
check(rows.length === 14, 'the panel lists every basic control', String(rows.length))
const labels = rows.map((row) => row.children[0].textContent)
for (const label of ['文本', '文本颜色', '背景', 'Opacity', '字体', '字号', '字重', '边框圆角', '边框颜色', '边框宽度', '宽度', '高度', '内边距', '外边距']) {
  check(labels.includes(label), `panel row: ${label}`)
}

const colorRow = rows.find((row) => row.children[0].textContent === '文本颜色')
const colorInput = colorRow.children[1].children[0]
console.log('DEBUG ctl children', colorRow.children.length, colorRow.children[1].children.length, colorInput.tagName, colorInput.className, JSON.stringify(Object.keys(colorInput.listeners)))
colorInput.value = '#ff0000'
fire(colorInput, 'input', { target: colorInput })
console.log('DEBUG store2', JSON.stringify(paragraph.style._store), 'value', colorInput.value)
check(paragraph.style._store.color === '#ff0000', 'a panel edit previews on the page', paragraph.style._store.color)

const radiusRow = rows.find((row) => row.children[0].textContent === '边框圆角')
const radiusInput = radiusRow.children[1].children[0]
radiusInput.value = '12'
fire(radiusInput, 'input', { target: radiusInput })
check(paragraph.style._store['border-radius'] === '12px', 'length edits get px', paragraph.style._store['border-radius'])

fire(byText('保存')[0], 'click')
check(panel.style.display === 'none', 'saving closes the panel')
check(bubble().style.display === 'flex', 'saving returns to the comment pill')

// --- send every annotation, in order ------------------------------------------------
fire(byClass('send')[0], 'click')
await new Promise((resolve) => setImmediate(resolve))
check(posts.length === 2, 'both annotations are posted', String(posts.length))
check(posts[0].order === 1 && posts[0].orderTotal === 2, 'the first post carries its order', JSON.stringify({ order: posts[0].order }))
check(posts[0].requirement === '这几行字再大一点', 'the first post carries its comment', posts[0].requirement)
check(posts[0].adjustments && posts[0].adjustments['文本颜色'] === '#ff0000', 'the first post carries the colour edit', JSON.stringify(posts[0].adjustments))
check(posts[0].selector && posts[0].tag === 'p', 'the first post describes the element', JSON.stringify({ selector: posts[0].selector }))
check(posts[1].order === 2 && posts[1].tag === 'h1', 'the second post keeps its order', JSON.stringify({ order: posts[1].order, tag: posts[1].tag }))
check(markers().length === 0, 'sending clears the pins')

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
