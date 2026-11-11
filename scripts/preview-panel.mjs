/**
 * Renders preview/panel.html from the CSS that lib/picker.js actually injects.
 *
 * The panel lives in a shadow root inside the page, so there is no way to open it
 * in a bare browser. This script lifts the stylesheet straight out of the bundle
 * and lays the same markup over a fake page, so a screenshot shows the real thing
 * instead of a hand-copied approximation that drifts.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const source = readFileSync(join(root, 'lib/picker.js'), 'utf8')

const start = source.indexOf('style.textContent = [')
const end = source.indexOf("].join('')", start)
if (start === -1 || end === -1) throw new Error('could not find the injected stylesheet')

const expression = source.slice(source.indexOf('[', start), end + 1)
const css = new Function(
  'MONO_FONT',
  'UI_FONT',
  'return ' + expression + ".join('')",
)(
  '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
)

// Same preset data and maths the picker uses, so the swatches are the real ones.
const GRAYS = [
  '#ffffff', '#f7f7f8', '#efeff1', '#e6e7ea', '#d8dade', '#c6c9cf',
  '#a9aeb6', '#8b9099', '#6b7079', '#4c5057', '#2f3237', '#111827',
]
const ROWS = [
  { s: 0.26, v: 0.99 },
  { s: 0.44, v: 0.97 },
  { s: 0.62, v: 0.94 },
  { s: 0.78, v: 0.86 },
  { s: 0.92, v: 0.72 },
  { s: 1, v: 0.55 },
]

function hexOf(hsv) {
  const hue = ((hsv.h % 360) + 360) % 360
  const s = Math.min(1, Math.max(0, hsv.s))
  const v = Math.min(1, Math.max(0, hsv.v))
  const chroma = v * s
  const part = chroma * (1 - Math.abs(((hue / 60) % 2) - 1))
  const mid = v - chroma
  let out
  if (hue < 60) out = [chroma, part, 0]
  else if (hue < 120) out = [part, chroma, 0]
  else if (hue < 180) out = [0, chroma, part]
  else if (hue < 240) out = [0, part, chroma]
  else if (hue < 300) out = [part, 0, chroma]
  else out = [chroma, 0, part]
  const bytes = out.map((n) => Math.round((n + mid) * 255))
  return '#' + bytes.map((n) => n.toString(16).padStart(2, '0')).join('')
}

const row = (label, control) => `<div class="row"><span class="lbl">${label}</span>${control}</div>`
const textCtl = (value) => `<div class="ctl"><input class="inp" value="${value}"></div>`
const lengthCtl = (value) =>
  `<div class="ctl short"><div class="numBox"><input class="inp" type="number" value="${value}"><span class="unitIn">px</span></div></div>`
const colorCtl = (value, color) =>
  `<div class="ctl short wide"><div class="colorBox"><button class="swatch"><span class="swatchdot" style="background:${color}"></span></button><input class="inp" value="${value}"></div></div>`
const colorCtlEmpty = (value) =>
  `<div class="ctl short wide"><div class="colorBox"><button class="swatch"><span class="swatchdot empty"></span></button><input class="inp" value="${value}"></div></div>`
const selectCtl = (value, open, narrow) =>
  `<div class="ctl${narrow ? ' short pickShort' : ''}"><button class="inp pick${open ? ' open' : ''}"><span class="pick-text">${value}</span><span class="pick-caret">` +
  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10l5 5 5-5"/></svg>` +
  `</span></button></div>`
const pairGlyph = (vertical) => {
  const paths = ['M31 3V55', 'M31 3H8', 'M31 55H8']
  return (
    `<svg viewBox="0 0 44 58" width="44" height="58" preserveAspectRatio="none" fill="none" stroke-linecap="round" stroke-linejoin="round">` +
    paths.map((d) => `<path d="${d}" stroke="#b9c3d0" stroke-width="2"/>`).join('') +
    '</svg>'
  )
}
const lockIcon =
  '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M9.2 14.8l5.6-5.6M8.4 11.6l-1.1 1.1a3.4 3.4 0 0 0 4.8 4.8l1.1-1.1M15.6 12.4l1.1-1.1a3.4 3.4 0 0 0-4.8-4.8l-1.1 1.1"/></svg>'
const sidePair = (names, values, vertical, on) => `
  <div class="sidePair">
    <div class="names">${names.map((name) => `<span>${name}</span>`).join('')}</div>
    <div class="glyphCol">${pairGlyph(vertical)}<button class="sideLock${on ? ' on' : ''}">${lockIcon}</button></div>
    <div class="fields">${values.map((value) => `<div class="numBox"><input class="inp" type="number" value="${value}"><span class="unitIn">px</span></div>`).join('')}</div>
    
  </div>`
const sidesGroup = (label, values, closed) => `
<div class="sidesGroup${closed ? ' closed' : ''}">
  <div class="sidesLine">
    <div class="sidesHead"><span>${label}</span>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10l5 5 5-5"/></svg>
    </div>
    <div class="sidesCollapsed"><div class="sideCells">${values.map((value) => `<div class="sideCell"><input class="inp" type="number" value="${value}"></div>`).join('')}</div></div>
  </div>
  <div class="sidesBody">
    ${sidePair(['上', '底部'], [values[0], values[1]], true, false)}
    ${sidePair(['左', '右'], [values[2], values[3]], false, true)}
  </div>
</div>`

const panel = `
<div class="panel shown">
  <div class="phead"><span class="pnum">1</span><span class="ptag">h1 · #hero-name</span></div>
  <div class="pcsection"><textarea class="pcomment" rows="1" placeholder="描述这一处要改什么…"></textarea></div>
  <div class="pscroll">
    ${row('文本', textCtl('Elia'))}
    ${row('文本颜色', colorCtl('rgb(0, 0, 0)', '#000000'))}
    ${row('背景', colorCtlEmpty('rgba(0, 0, 0, 0)'))}
    ${row('Opacity', `<div class="ctl short"><div class="numBox"><input class="inp" value="1"></div></div>`)}
    ${row('字体', selectCtl('当前（system-ui, -apple-system）', true))}
    ${row('字号', lengthCtl('52'))}
    ${row('字重', selectCtl('700 粗', false, true))}
    ${row('边框圆角', lengthCtl('0'))}
    ${row('边框颜色', colorCtl('rgb(0, 0, 0)', '#000000'))}
    ${row('边框宽度', lengthCtl('0'))}
    ${row('宽度', lengthCtl('auto'))}
    ${row('高度', lengthCtl('auto'))}
    ${sidesGroup('内边距', ['18', '0', '0', '0'])}
    ${sidesGroup('外边距', ['0', '0', '0', '0'], true)}
  </div>
  <div class="pfoot"><button class="btn">取消</button><button class="btn dark">保存</button></div>
</div>`

const pill = `
<div class="pill shown">
  <button class="iconBtn">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 8h10M4 16h7M9 4v8M6 12v4M17 7l4 4-4 4"/>
    </svg>
  </button>
  <input class="cinput" placeholder="写这条批注（和页面里的胶囊同步）" value="变大">
  <button class="ok ready">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
  </button>
</div>`

const grayCells = GRAYS.map((c, i) => `<button class="cp-cell${i === 4 ? ' hot' : ''}" style="background:${c}"></button>`).join('')
const paletteCells = ROWS.map((r) =>
  Array.from({ length: 10 }, (_, c) => `<button class="cp-cell${r.s === 1 && r.v === 0.9 && c === 3 ? ' hot' : ''}" style="background:${hexOf({ h: (c / 10) * 360, s: r.s, v: r.v })}"></button>`).join(''),
).join('')

const menuItems = ['系统默认', '无衬线 UI', '中文黑体', '衬线', '等宽', 'Georgia', 'Inter']
  .map((name, index) =>
    `<button class="menu-item${index === 1 ? ' on' : ''}"><span class="menu-text">${name}</span>` +
    (index === 1
      ? `<span class="menu-tick"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>`
      : '') +
    `</button>`,
  )
  .join('')

const menu = `<div class="menu shown">${menuItems}</div>`

const nativeSelect = `<div class="ctl"><select class="inp"><option>系统默认</option><option selected>无衬线 UI</option><option>中文黑体</option><option>衬线</option><option>等宽</option><option>Georgia</option><option>Inter</option></select></div>`

const popoverPresets = `
<div class="cp shown">
  <div class="cp-tabs"><div class="cp-tab on">预设</div><div class="cp-tab">自定义</div></div>
  <div class="cp-sec"><div class="cp-secname">基础</div><div class="cp-grid base"><button class="cp-cell none" title="默认（去掉这处的颜色设置）"></button><button class="cp-cell trans" title="纯透明 / 无背景"></button></div></div>
  <div class="cp-sec"><div class="cp-secname">中性</div><div class="cp-grid g6">${grayCells}</div></div>
  <div class="cp-sec"><div class="cp-secname">色板</div><div class="cp-grid">${paletteCells}</div></div>
</div>`

const popoverCustom = `
<div class="cp shown">
  <div class="cp-tabs"><div class="cp-tab">预设</div><div class="cp-tab on">自定义</div></div>
  <div class="cp-sv" style="background-color:hsl(214, 100%, 50%)">
    <div class="cp-knob" style="left:62%;top:22%"></div>
  </div>
  <div class="cp-hue"><div class="cp-hk" style="left:59.5%"></div></div>
  <div class="cp-row">
    <input class="cp-hex" value="rgb(63, 123, 246)">
    <button class="cp-eye">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 20l4.5-1 9-9a2.1 2.1 0 0 0-3-3l-9 9L4 20Z"/><path d="M13.5 6.5l4 4"/>
      </svg>
    </button>
  </div>
</div>`

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>批注面板 · 圆润化预览</title>
<style>
  .pscroll > .row:nth-child(2),
  .pscroll > .row:nth-child(5),
  .pscroll > .row:nth-child(8),
  .pscroll > .row:nth-child(11) { border-top: 1px solid rgba(17,24,39,.07); padding-top: 9px; margin-top: 2px; }
  .panel.shown { max-height: none; }
  .pscroll { overflow: visible; max-height: none; }
</style>
<style>
  html, body { margin: 0; background: #eef1f6; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    padding: 28px 32px 36px;
    background:
      radial-gradient(1200px 500px at 15% -10%, #dfe7f5 0%, rgba(223,231,245,0) 70%),
      #eef1f6;
  }
  .stage { position: relative; width: 900px; }
  .cols { display: flex; gap: 36px; align-items: flex-start; }
  .col { width: 420px; }
  .fake { color: #111827; }
  .fake h1 { font-size: 64px; line-height: 1.02; margin: 0 0 10px; letter-spacing: -0.02em; }
  .fake p { color: #4b5563; font-size: 15px; line-height: 1.7; margin: 0; }
  .caption { margin: 0 0 14px; font-size: 13px; color: #6b7280; }
  .note { margin: 22px 0 0; font-size: 12.5px; color: #6b7280; line-height: 1.7; }
  /* the injected sheet hides fixed layers; show them inline for the screenshot */
  ${css}
  .panel.shown { display: flex; position: relative; left: auto; top: auto; margin: 16px 0 0; }
  .pill.shown { display: flex; position: relative; left: auto; top: auto; margin: 18px 0 0; }
  .mark.shown { display: grid; position: relative; }
  .cp.shown { position: relative; left: auto !important; top: auto !important; margin: 0 0 22px; }
  .menu.shown { position: relative; left: auto !important; top: auto !important; margin: 0 0 22px; }
</style>
</head>
<body class="dsh-root">
<div class="stage">
  <p class="caption">批注面板（真实注入的 CSS，只是把 fixed 改成行内摆出来）</p>
  <div class="cols">
    <div class="col">
      <div class="fake">
        <div class="mark shown" style="float:left;margin:6px 8px 0 0">1</div>
        <h1>Elia</h1>
        <p>软件工程 · 本科在读 · 南京 · 中国</p>
      </div>
      ${panel}
      ${pill}
    </div>
    <div class="col">
      <p class="caption">颜色弹层 · 预设（中性 + 色板）</p>
      ${popoverPresets}
      <p class="caption">颜色弹层 · 自定义（饱和度方块 + 色相条 + 同一套 rgb 写法）</p>
      ${popoverCustom}
      <p class="caption">字体下拉 · 自绘菜单（不再交给系统 select）</p>
      ${menu}
    </div>
  </div>
  <p class="note">面板 20px 圆角 + 双层柔和投影；输入框 10px 圆角、浅灰底、聚焦时转白并带蓝色光圈；
  按钮改成胶囊形（取消=浅灰、保存=纯黑带投影）；色块按钮显示当前颜色（透明时是棋盘格），点开是自己的取色弹层，不再调用系统取色器。</p>
</div>
</body>
</html>`

writeFileSync(join(root, 'preview/panel.html'), html, 'utf8')

// ------------------------------------------------------------------ four-box rows close-up
const sidesPage = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>内边距 / 外边距 · 四格输入</title>
<style>
  html, body { margin: 0; background: #eef1f6; }
  body { padding: 24px 26px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
  .caption { margin: 0 0 10px; font-size: 13px; color: #6b7280; }
  .panel.shown { display: block; position: relative; left: auto; top: auto; width: 320px; max-height: none; }
  .pscroll { max-height: none; overflow: visible; }
  ${css}
</style>
</head>
<body class="dsh-root">
<p class="caption">内边距 / 外边距：一侧一行，四个数字各占一整行，浏览器自带的上下箭头有位置放；外边距默认折叠</p>
<div class="panel shown">
  <div class="phead"><span class="pnum">1</span><span class="ptag">h1 · #hero-name</span></div>
  <div class="pscroll" style="padding-top:10px">
    ${sidesGroup('内边距', ['18', '0', '0', '0'])}
    ${sidesGroup('外边距', ['0', '0', '0', '0'], true)}
    ${row('边框宽度', lengthCtl('0'))}
  </div>
</div>
</body>
</html>`

writeFileSync(join(root, 'preview/sides.html'), sidesPage, 'utf8')

// ------------------------------------------------------------------ before / after strip
const card = (fontCtl, tone) => `
<div class="panel shown ${tone}">
  <div class="phead"><span class="pnum">1</span><span class="ptag">h1 · #hero-name</span></div>
  <div class="pscroll" style="padding-top:10px">
    ${row('字体', fontCtl)}
    ${row('字重', tone === 'before' ? '<div class="ctl"><select class="inp"><option>700 粗</option><option>600 半粗</option><option>500 中</option></select></div>' : selectCtl('700 粗', false, true))}
    ${row('文本颜色', colorCtl('rgb(0, 0, 0)', '#000000'))}
  </div>
</div>`

const compare = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>下拉框 · 改前 / 改后</title>
<style>
  html, body { margin: 0; background: #eef1f6; }
  body { padding: 26px 30px 30px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
  .row2 { display: flex; gap: 40px; align-items: flex-start; }
  .cap { margin: 0 0 12px; font-size: 13px; color: #6b7280; }
  .cap b { color: #111827; }
  ${css}
  .panel.shown { display: flex; position: relative; left: auto; top: auto; width: 320px; }
  .menu.shown { position: relative; left: auto !important; top: auto !important; margin: 18px 0 0; width: 260px; }
  .before .inp:not(.pick) { border-radius: 2px; border: 1px solid #9aa1ac; background: #fff; }
  .before .panel { border-radius: 4px; box-shadow: 0 2px 6px rgba(15,23,42,.2); }
</style>
</head>
<body class="dsh-root">
<div class="row2">
  <div>
    <p class="cap"><b>改前</b>：原生 select，系统弹层，直角硬边</p>
    ${card(nativeSelect, 'before')}
  </div>
  <div>
    <p class="cap"><b>改后</b>：自绘字段 + 圆角菜单，同一套阴影/圆角变量</p>
    ${card(selectCtl('当前（system-ui, -apple-system）'), 'after')}
    ${menu}
  </div>
</div>
</body>
</html>`

writeFileSync(join(root, 'preview/compare.html'), compare, 'utf8')

console.log('preview/panel.html written,', css.length, 'chars of injected css')
