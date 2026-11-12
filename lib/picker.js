/*
 * Element-reference picker — runs inside the page being developed.
 *
 * Two ways in:
 *   - injected straight into DSH's own right-sidebar browser (the normal path: no script tag),
 *   - loaded by the page itself: <script src="http://127.0.0.1:<port>/element-ref/picker.js"></script>
 *     (bookmarklet or console line for any other browser).
 *
 * Annotation mode: click an element and it gets a numbered pin. A pill under the pin takes a
 * one-line comment; its sliders button opens a compact style panel (text, colours, opacity,
 * font, weight, radius, border, size, padding, margin) that previews live on the page. Every
 * pin is mirrored to the right sidebar as a draft, in click order, and the sidebar's composer
 * is the only way to send them: this script has no send button and no floating bar.
 */
(function () {
  var API = '%%ENDPOINT%%'
  var KEY = '__DSH_ELEMENT_REF__'

  var previous = window[KEY]
  if (previous && typeof previous.destroy === 'function') {
    try { previous.destroy() } catch (error) { /* a stale instance is not worth keeping */ }
  }
  // A shutdown that failed halfway can leave its overlay behind; two hosts would fight over the
  // same clicks, so anything older than this instance goes away first.
  try {
    var strays = document.querySelectorAll('[data-dsh-element-ref]')
    for (var stray = 0; stray < strays.length; stray += 1) {
      if (strays[stray].parentNode) strays[stray].parentNode.removeChild(strays[stray])
    }
  } catch (error) { /* ignore */ }
  if (window[KEY]) {
    try { delete window[KEY] } catch (error) { /* ignore */ }
  }

  /**
   * Only install when the address bar asked for it, just now.
   *
   * A module copy left over from a hot update keeps its own timer and re-injects this script on
   * every page load, while the sidebar believes picking is off — boxes appear with nothing
   * pressed. Such a copy cannot be reached from the outside, so the proof travels with the
   * script: our injector puts a one-shot marker in front of the source, and anything injected
   * without it (the stale copy) leaves the page untouched.
   */
  if (window.__DSH_ELEMENT_REF_GO__ !== true) return
  try { delete window.__DSH_ELEMENT_REF_GO__ } catch (error) { /* ignore */ }

  var UI_FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"PingFang SC","Microsoft YaHei",sans-serif'
  var MONO_FONT = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'

  var host = document.createElement('div')
  host.setAttribute('data-dsh-element-ref', '')
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;'
  var shadow = host.attachShadow({ mode: 'open' })
  document.documentElement.appendChild(host)

  var style = document.createElement('style')
  style.textContent = [
    ':host{all:initial}',
    /* One set of tokens for every floating surface, so nothing drifts apart again. */
    ':host,.dsh-root{',
    '--dsh-r-xl:18px;--dsh-r-lg:16px;--dsh-r-md:12px;--dsh-r-sm:10px;--dsh-r-xs:8px;--dsh-r-pill:999px;',
    '--dsh-shadow-panel:0 28px 60px -20px rgba(15,23,42,.45),0 4px 12px rgba(15,23,42,.06),0 0 0 1px #fff inset;',
    '--dsh-shadow-pop:0 22px 44px -18px rgba(15,23,42,.4),0 2px 8px rgba(15,23,42,.08),0 0 0 1px rgba(17,24,39,.05);',
    '--dsh-shadow-soft:0 1px 2px rgba(15,23,42,.06);',
    '--dsh-line:rgba(17,24,39,.06);--dsh-fill:#f6f7f9;--dsh-fill-2:#f3f4f6;',
    '--dsh-ink:#111827;--dsh-ink-2:#4b5563;--dsh-ink-3:#9aa1ac;--dsh-accent:#2f6bff;',
    '--dsh-ease:cubic-bezier(.2,.8,.2,1);--dsh-dur:.16s}',
    '*{box-sizing:border-box}',
    /* 直角描边：圆角会把页面自己的圆角设计盖住，看起来像我们改了边框。 */
    '.outline{position:fixed;border:2px solid #2f6bff;background:rgba(47,107,255,.08);border-radius:0;',
    'box-shadow:0 0 0 1px rgba(255,255,255,.6) inset,0 0 0 3px rgba(47,107,255,.1);pointer-events:none}',
    '.tag{position:fixed;max-width:60vw;padding:5px 11px;border-radius:999px;background:#2f6bff;color:#fff;',
    'font:500 12.5px/17px ' + MONO_FONT + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
    'box-shadow:0 8px 22px -6px rgba(47,107,255,.85);pointer-events:none}',
    '.toasts{position:fixed;left:50%;top:14px;transform:translateX(-50%);display:flex;flex-direction:column;',
    'gap:6px;align-items:center;pointer-events:none}',
    '.toast{padding:7px 14px;border-radius:999px;background:rgba(17,24,39,.9);color:#f9fafb;',
    'font:500 12px/18px ' + UI_FONT + ';box-shadow:0 12px 28px -12px rgba(15,23,42,.9);max-width:70vw;',
    'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.toast.bad{background:rgba(185,28,28,.95)}',

    '.mark{position:fixed;display:none;place-items:center;width:28px;height:28px;border-radius:999px;',
    'background:#2f6bff;color:#fff;border:2.5px solid #fff;padding:0;margin:0;pointer-events:auto;',
    'cursor:pointer;user-select:none;box-shadow:0 4px 10px rgba(15,23,42,.32),0 0 0 1px rgba(47,107,255,.2);',
    'font:700 13px/1 ' + UI_FONT + ';transition:transform .14s cubic-bezier(.2,.8,.2,1)}',
    '.mark:hover{transform:scale(1.08)}',
    '.mark.on{box-shadow:0 4px 10px rgba(15,23,42,.32),0 0 0 2px rgba(47,107,255,.35)}',
    /* Only used when the pinned element has no box left to click (text cleared): the badge then
       becomes the way back into that annotation. */
    '.mark.reopen{pointer-events:auto;cursor:pointer}',

    '.pill{position:fixed;display:none;align-items:center;gap:6px;width:min(380px,86vw);padding:5px;',
    'border-radius:999px;background:#fff;border:1px solid rgba(17,24,39,.06);pointer-events:auto;',
    'box-shadow:0 20px 44px -14px rgba(15,23,42,.4),0 2px 6px rgba(15,23,42,.06)}',
    '.iconBtn{flex:none;display:grid;place-items:center;width:30px;height:30px;padding:0;border:none;',
    'border-radius:999px;background:#f4f5f7;color:#111827;cursor:pointer;',
    'transition:background .15s ease,transform .12s ease}',
    '.iconBtn:hover{background:#eceef2}',
    '.iconBtn:active{transform:scale(.94)}',
    '.cinput{flex:1;min-width:0;border:none;outline:none;background:transparent;color:#111827;',
    'font:400 13px/20px ' + UI_FONT + ';padding:0 6px}',
    '.cinput::placeholder{color:#9aa1ac}',
    '.ok{flex:none;display:grid;place-items:center;width:30px;height:30px;padding:0;border:none;border-radius:999px;',
    'background:#e3e5ea;color:#fff;cursor:pointer;transition:background .15s ease,box-shadow .15s ease,transform .12s ease}',
    '.ok.ready{background:#2f6bff;box-shadow:0 8px 18px -8px rgba(47,107,255,.9)}',
    '.ok.ready:active{transform:scale(.94)}',

    '.panel{position:fixed;display:none;flex-direction:column;width:min(300px,86vw);max-height:min(56vh,420px);',
    'border-radius:var(--dsh-r-xl);background:#fff;color:#111827;pointer-events:auto;overflow:hidden;cursor:grab;',
    'border:1px solid var(--dsh-line);font:13px/20px ' + UI_FONT + ';',
    'box-shadow:var(--dsh-shadow-panel)}',
    '.panel.dragging{cursor:grabbing}',
    '.panel .phead,.panel .pscroll,.panel .pfoot,.panel .pcsection{cursor:auto}',
    '.pcsection{padding:10px 14px 12px;border-bottom:1px solid rgba(17,24,39,.05);background:#fcfcfd}',
    '.pcomment{display:block;width:100%;max-height:76px;resize:none;border:1px solid rgba(17,24,39,.08);',
    'border-radius:12px;background:#f6f7f9;color:#111827;padding:8px 10px;font:400 12.5px/18px ' + UI_FONT + ';',
    'outline:none;cursor:text;transition:border-color .15s ease,box-shadow .15s ease,background .15s ease}',
    '.pcomment:focus{border-color:rgba(47,107,255,.45);background:#fff;box-shadow:0 0 0 3px rgba(47,107,255,.12)}',
    '.pcomment::placeholder{color:#9aa1ac}',
    '.phead{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid rgba(17,24,39,.05)}',
    '.pnum{flex:none;display:grid;place-items:center;width:22px;height:22px;border-radius:999px;background:#2f6bff;',
    'color:#fff;font:600 11px/1 ' + UI_FONT + ';box-shadow:0 6px 14px -8px rgba(47,107,255,.9)}',
    '.ptag{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#6b7280;',
    'font:500 11px/16px ' + MONO_FONT + '}',
    '.pscroll{overflow-y:auto;overflow-x:hidden;padding:8px 0 6px;scrollbar-width:thin;scrollbar-color:rgba(17,24,39,.16) transparent}',
    '.pscroll::-webkit-scrollbar{width:10px}',
    '.pscroll::-webkit-scrollbar-track{background:transparent}',
    '.pscroll::-webkit-scrollbar-thumb{background:rgba(17,24,39,.16);border-radius:999px;',
    'border:3px solid transparent;background-clip:content-box}',
    '.pscroll::-webkit-scrollbar-thumb:hover{background:rgba(17,24,39,.28);background-clip:content-box}',
    '.row{display:grid;grid-template-columns:84px 1fr;gap:10px;align-items:center;padding:5px 14px}',
    '.row.sep{position:relative;padding-top:15px;margin-top:8px}',
    '.row.sep::before{content:\'\';position:absolute;left:14px;right:14px;top:0;height:1px;background:rgba(17,24,39,.07)}',
    '.lbl{color:#4b5563;font-size:12.5px;line-height:18px}',
    '.undoBtn{flex:none;display:none;width:16px;height:16px;border:0;border-radius:50%;background:transparent;color:#a3aab6;cursor:pointer;padding:0;line-height:0}',
    '.undoBtn:hover{color:#2f6bff;background:#eef4ff}',
    '.ctl{position:relative;display:flex;align-items:center;gap:6px;min-width:0}',
    '.numBox{position:relative}',
    '.undoBtn{position:absolute;right:calc(100% + 2px);top:50%;transform:translateY(-50%);display:none;width:16px;height:16px;border:0;border-radius:50%;background:transparent;color:#a3aab6;cursor:pointer;padding:0;line-height:0}',
    '.undoBtn:hover{color:#2f6bff;background:#eef4ff}',
    '.inp{width:100%;min-width:0;border:1px solid rgba(17,24,39,.08);border-radius:10px;background:#f6f7f9;color:#111827;',
    'padding:6px 10px;font:400 12.5px/18px ' + UI_FONT + ';outline:none;',
    'transition:border-color .15s ease,box-shadow .15s ease,background .15s ease}',
    '.inp:focus{border-color:rgba(47,107,255,.45);background:#fff;box-shadow:0 0 0 3px rgba(47,107,255,.12)}',
    '.swatch{flex:none;display:grid;place-items:center;width:34px;height:28px;padding:0;border:1px solid rgba(17,24,39,.1);',
    'border-radius:10px;background:#fff;cursor:pointer;box-shadow:0 1px 2px rgba(15,23,42,.06);transition:transform .12s ease}',
    '.swatch:active{transform:scale(.96)}',
    '.swatchdot{display:block;width:22px;height:18px;border-radius:6px;box-shadow:0 0 0 1px rgba(17,24,39,.14) inset}',
    '.swatchdot.empty{background-image:linear-gradient(45deg,#e3e5ea 25%,transparent 25%,transparent 75%,#e3e5ea 75%),',
    'linear-gradient(45deg,#e3e5ea 25%,#fff 25%,#fff 75%,#e3e5ea 75%);background-size:8px 8px;background-position:0 0,4px 4px}',
    '.unit{flex:none;color:#9aa1ac;font-size:11px}',
    /* The box-model groups: one row per side, so the numbers have room for the browser's own
       spin arrows and never sit under them. */
    '.sidesGroup{padding:2px 14px 4px}',
    '.sidesHead{display:flex;align-items:center;gap:6px;width:84px;flex:none;padding:4px 0;color:#374151;',
    'font:500 12.5px/18px ' + UI_FONT + ';cursor:pointer;user-select:none}',
    '.sidesHead svg{flex:none;color:#9aa1ac;transition:transform var(--dsh-dur) var(--dsh-ease)}',
    '.sidesGroup.closed .sidesHead>svg{transform:rotate(-90deg)}',
    '.sidesGroup.closed .sidesBody{display:none}',
    'border:0;border-radius:6px;background:transparent;color:#9aa1ac;cursor:pointer;padding:0;line-height:0}',
    '.sidesBody{display:flex;flex-direction:column;padding:2px 0 4px}',
    '.sidesBody > .sidePair + .sidePair{margin-top:12px}',
    '.panel,.panel *,.cp,.cp *,.menu,.menu *{box-sizing:border-box}',
    '.sidePair{display:flex;align-items:center;gap:8px}',
    '.sidePair .names{flex:none;width:30px;display:flex;flex-direction:column;gap:12px;justify-content:center;text-align:right}',
    '.sidePair .names span{flex:none;height:30px;line-height:30px;font-size:11px;color:#9aa1ac}',
    '.sidePair .glyphCol{flex:none;width:44px;position:relative;align-self:stretch;display:flex;align-items:center;justify-content:center;',
    'justify-content:center;color:#c8d1dc}',
    '.sideLock{position:absolute;top:50%;left:31px;transform:translate(-50%,-50%);width:15px;height:15px;border-radius:50%;',
    'border:0;border-radius:5px;background:#fff;color:#b6bfcc;display:flex;align-items:center;justify-content:center;',
    'cursor:pointer;padding:0;line-height:0;background:#fff;box-shadow:0 1px 3px rgba(15,23,42,.14)}',
    '.sideLock:hover{color:#5b6472;box-shadow:0 2px 6px rgba(15,23,42,.18)}',
    '.sideLock.on{color:#2f6bff;background:#eef4ff;box-shadow:0 0 0 1px rgba(47,107,255,.28)}',
    '.sidePair .fields{flex:none;width:104px;margin-left:auto;display:flex;flex-direction:column;gap:12px}',
    '.sidePair .fields .inp{height:30px}',
    '.numBox{position:relative;display:flex;align-items:center;width:100%;min-width:0}',
    '.numBox .inp{padding-right:26px}',
    '.unitIn{position:absolute;right:9px;color:#9aa1ac;font-size:11px;pointer-events:none}',
    '.row>.ctl.short{width:104px;max-width:104px;flex:none;justify-self:end}',
    '.row>.ctl.short.wide{width:134px;max-width:134px}',
    '.colorBox{position:relative;display:flex;align-items:center;width:100%;min-width:0}',
    '.colorBox input.inp{padding-left:38px}',
    '.colorBox .swatch{position:absolute;left:5px;top:50%;transform:translateY(-50%);width:22px;height:22px;border-radius:7px}',
    '.sidesLine{display:flex;align-items:center;gap:10px}',
    '.sidesCollapsed{display:none;flex:1;min-width:0}',
    '.sidesGroup.closed .sidesCollapsed{display:block}',
    '.sideCells{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid rgba(17,24,39,.1);border-radius:11px;overflow:hidden;background:#f8f9fb}',
    '.sideCell{display:flex;align-items:center;border-left:1px solid rgba(17,24,39,.07);min-width:0}',
    '.sideCell:first-child{border-left:0}',
    '.sideCell .inp{width:100%;height:32px;border:0;background:transparent;box-shadow:none;border-radius:0;text-align:center;padding:0 4px}',
    '.pfoot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 14px;',
    'border-top:1px solid rgba(17,24,39,.05);background:#fcfcfd}',
    '.btn{border:1px solid rgba(17,24,39,.06);background:#f4f5f7;color:#111827;border-radius:999px;padding:7px 16px;',
    'font:500 12px/18px ' + UI_FONT + ';cursor:pointer;transition:background .15s ease,transform .12s ease}',
    '.btn:hover{background:#eceef2}',
    '.btn:active{transform:scale(.97)}',
    '.btn.dark{border-color:transparent;background:#111827;color:#fff;box-shadow:0 10px 20px -10px rgba(15,23,42,.9)}',
    '.btn.dark:hover{background:#000}',

    /* Colour popover: our own picker, so the panel never hands the page the OS colour dialog. */
    '.cp{position:fixed;z-index:2147483000;width:240px;box-sizing:border-box;padding:12px;border-radius:var(--dsh-r-xl);',
    'background:#fff;color:#111827;border:1px solid var(--dsh-line);font:13px/20px ' + UI_FONT + ';pointer-events:auto;',
    'box-shadow:var(--dsh-shadow-pop);cursor:auto}',
    '.cp-tabs{display:flex;gap:2px;padding:3px;border-radius:999px;background:#f3f4f6}',
    '.cp-tab{flex:1;padding:5px 0;border-radius:999px;text-align:center;font-size:12px;color:#6b7280;cursor:pointer;',
    'transition:background .15s ease,color .15s ease}',
    '.cp-tab.on{background:#fff;color:#111827;box-shadow:0 1px 2px rgba(15,23,42,.12)}',
    '.cp-sv{position:relative;height:128px;margin-top:10px;border-radius:12px;overflow:hidden;cursor:crosshair;',
    'background-image:linear-gradient(to top,#000,rgba(0,0,0,0)),linear-gradient(to right,#fff,rgba(255,255,255,0))}',
    '.cp-knob{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:2px solid #fff;',
    'box-shadow:0 1px 4px rgba(15,23,42,.45);pointer-events:none}',
    '.cp-hue{position:relative;height:12px;margin-top:12px;border-radius:999px;cursor:pointer;',
    'background:linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)}',
    '.cp-hk{position:absolute;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:#fff;',
    'border:1px solid rgba(17,24,39,.14);box-shadow:0 1px 3px rgba(15,23,42,.28);pointer-events:none}',
    '.cp-row{display:flex;align-items:center;gap:8px;margin-top:10px}',
    '.cp-hex{flex:1;min-width:0;border:1px solid rgba(17,24,39,.08);border-radius:10px;background:#f6f7f9;color:#111827;',
    'padding:6px 10px;font:400 12px/18px ' + MONO_FONT + ';outline:none}',
    '.cp-hex:focus{border-color:rgba(47,107,255,.45);background:#fff;box-shadow:0 0 0 3px rgba(47,107,255,.12)}',
    '.cp-eye{flex:none;display:grid;place-items:center;width:32px;height:32px;padding:0;border:1px solid rgba(17,24,39,.08);',
    'border-radius:10px;background:#f6f7f9;color:#4b5563;cursor:pointer;transition:background .15s ease}',
    '.cp-eye:hover{background:#eef0f4}',
    '.cp-sec{margin-top:12px}',
    '.cp-secname{margin-bottom:6px;color:#9aa1ac;font-size:11px;line-height:14px}',
    '.cp-grid{gap:4px;display:grid;grid-template-columns:repeat(10,1fr)}',
    '.cp-grid.g6{grid-template-columns:repeat(6,1fr)}',
    '.cp-grid.base{grid-template-columns:repeat(2,30px);gap:6px}',
    /* the two one-click answers: drop the custom colour, or paint it away */
    '.cp-cell.none{background:#fff}',
    '.cp-cell.none::after{content:"";position:absolute;left:50%;top:50%;width:64%;height:2px;border-radius:2px;',
    'background:linear-gradient(90deg,rgba(229,72,77,.55),#e5484d,rgba(229,72,77,.55));',
    'box-shadow:0 0 0 .5px rgba(255,255,255,.9);transform:translate(-50%,-50%) rotate(-45deg)}',
    '.cp-cell.trans{background-color:#fff;background-image:linear-gradient(45deg,#eceef2 25%,transparent 25%,transparent 75%,#eceef2 75%),',
    'linear-gradient(45deg,#eceef2 25%,transparent 25%,transparent 75%,#eceef2 75%);background-size:6px 6px;background-position:0 0,3px 3px}',
    '.cp-cell{position:relative;aspect-ratio:1/1;padding:0;border:1px solid rgba(17,24,39,.08);border-radius:6px;cursor:pointer;',
    'transition:transform var(--dsh-dur) var(--dsh-ease),box-shadow var(--dsh-dur) var(--dsh-ease)}',
    /* JS drives the hover state too: a shadow-DOM cell can miss :hover when the host owns the pointer. */
    '.cp-cell.hot,.cp-cell:hover{transform:scale(1.14);box-shadow:0 0 0 2px #fff,0 0 0 3px rgba(17,24,39,.22),0 8px 16px -8px rgba(15,23,42,.45);z-index:2}',
    '.cp-cell.on{box-shadow:0 0 0 2px #fff,0 0 0 3.5px #2f6bff}',
    '.cp-cell.on.hot,.cp-cell.on:hover{box-shadow:0 0 0 2px #fff,0 0 0 3.5px #2f6bff,0 8px 16px -8px rgba(47,107,255,.5)}',

    /* Dropdown: the native <select> popup is the one surface we cannot round, so the panel
       draws its own list — a field that looks like the rest and a menu on the same tokens. */
    '.inp.pick{display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;cursor:pointer;',
    'color:var(--dsh-ink);font:400 12.5px/18px ' + UI_FONT + ';border:1px solid var(--dsh-line);background:var(--dsh-fill);',
    'border-radius:var(--dsh-r-sm);padding:6px 10px;transition:background var(--dsh-dur) var(--dsh-ease),box-shadow var(--dsh-dur) var(--dsh-ease)}',
    '.inp.pick:hover{background:var(--dsh-fill-2)}',
    '.inp.pick:focus-visible{outline:none;background:#fff;box-shadow:0 0 0 3px rgba(47,107,255,.12)}',
    '.pick-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.pick-caret{flex:none;display:grid;place-items:center;color:var(--dsh-ink-3);',
    'transition:transform var(--dsh-dur) var(--dsh-ease)}',
    '.inp.pick.open .pick-caret{transform:rotate(180deg)}',
    '.swatch.open{border-color:rgba(47,107,255,.45);box-shadow:0 0 0 3px rgba(47,107,255,.16)}',
    '.menu{position:fixed;z-index:2147483001;min-width:180px;max-width:min(320px,80vw);max-height:min(300px,60vh);',
    'overflow:auto;padding:6px;border-radius:var(--dsh-r-lg);background:#fff;color:var(--dsh-ink);pointer-events:auto;',
    'border:1px solid var(--dsh-line);box-shadow:var(--dsh-shadow-pop);font:400 12.5px/18px ' + UI_FONT + '}',
    '.menu-item{display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;border:0;background:transparent;',
    'border-radius:var(--dsh-r-sm);color:var(--dsh-ink-2);font:inherit;text-align:left;cursor:pointer;',
    'transition:background var(--dsh-dur) var(--dsh-ease),color var(--dsh-dur) var(--dsh-ease)}',
    '.menu-item:hover{background:var(--dsh-fill-2);color:var(--dsh-ink)}',
    '.menu-item.on{background:rgba(47,107,255,.08);color:var(--dsh-accent)}',
    '.menu-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.menu-tick{flex:none;display:grid;place-items:center;color:var(--dsh-accent)}',
    '.menu-sep{height:1px;margin:4px 8px;background:var(--dsh-line)}',
  ].join('')
  shadow.appendChild(style)

  /* 面板打开时把高亮框收起来：它会压住元素自己的边框，看不清改成了什么样。 */
  var suppressOutline = false

  var outline = document.createElement('div')
  outline.className = 'outline'
  outline.style.display = 'none'
  var tagEl = document.createElement('div')
  tagEl.className = 'tag'
  tagEl.style.display = 'none'
  var toasts = document.createElement('div')
  toasts.className = 'toasts'
  var pins = document.createElement('div')
  shadow.appendChild(outline)
  shadow.appendChild(tagEl)
  shadow.appendChild(pins)
  shadow.appendChild(toasts)

  function icon(paths, extra) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('width', '16')
    svg.setAttribute('height', '16')
    svg.setAttribute('fill', 'none')
    svg.setAttribute('stroke', 'currentColor')
    svg.setAttribute('stroke-width', extra && extra.width ? extra.width : '1.8')
    svg.setAttribute('stroke-linecap', 'round')
    svg.setAttribute('stroke-linejoin', 'round')
    for (var i = 0; i < paths.length; i += 1) {
      var parts = paths[i]
      var node = document.createElementNS('http://www.w3.org/2000/svg', parts.circle ? 'circle' : 'path')
      if (parts.circle) {
        node.setAttribute('cx', parts.circle[0])
        node.setAttribute('cy', parts.circle[1])
        node.setAttribute('r', parts.circle[2])
      } else {
        node.setAttribute('d', parts.d)
      }
      svg.appendChild(node)
    }
    return svg
  }

  // ---------------------------------------------------------------- state

  var active = true
  var hovered = null
  var marks = []
  var kept = []
  var activeMark = null
  var panelOpen = false
  var layoutTimer = null
  /** Where the user dragged the panel to; null means "next to the element". */
  var panelPos = null
  /** Sent annotations by server ref, so the right sidebar can address them later. */
  var sent = {}
  var pollSince = 0
  var pollTimer = null
  /**
   * The page is usually on another origin (and often on https), so it cannot always reach
   * the DSH server itself. Everything destined for the host goes through this outbox: the
   * host renderer drains it over executeJavaScript and posts on the page's behalf.
   */
  var outbox = []
  var hostMode = false
  var flushTimer = null
  /**
   * Breadcrumbs for the sidebar. Every hop of the draft pipeline (queued → drained → posted /
   * skipped) leaves a mark here, so when a chip fails to show up we can read back why instead of
   * guessing from the DOM.
   */
  var trace = []
  function note(tag, detail) {
    try {
      trace.push(tag + (detail === undefined ? '' : ':' + detail))
      if (trace.length > 24) trace.shift()
    } catch (error) {
      /* tracing must never break the picker */
    }
  }
  /** How long this script survives without hearing from the sidebar (see useHost). */
  var ORPHAN_MS = 6000

  function queue(entry) {
    outbox.push(entry)
    note('q', entry.kind)
    if (hostMode) return
    // Stand-alone usage (script tag in a normal browser): post directly after all.
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = setTimeout(function () {
      flushTimer = null
      if (hostMode) return
      var pending = outbox.splice(0)
      for (var i = 0; i < pending.length; i += 1) {
        if (pending[i].kind === 'draft') directDraft(pending[i].body)
        else if (pending[i].kind === 'collect') directCollect(pending[i].body)
      }
    }, 1500)
  }

  function drain() {
    var pending = outbox.splice(0)
    if (pending.length) {
      var kinds = []
      for (var i = 0; i < pending.length; i += 1) kinds.push(pending[i].kind)
      note('drain', kinds.join(','))
    }
    return JSON.stringify(pending)
  }

  // ---------------------------------------------------------------- shell bits

  var bubble = document.createElement('div')
  bubble.className = 'pill'
  var tweakButton = document.createElement('button')
  tweakButton.className = 'iconBtn'
  tweakButton.title = '调节样式'
  tweakButton.appendChild(icon([
    { d: 'M4 8h9M17 8h3M4 16h3M11 16h9' },
    { circle: ['15', '8', '2.1'] },
    { circle: ['9', '16', '2.1'] },
  ]))
  var commentInput = document.createElement('input')
  commentInput.className = 'cinput'
  commentInput.type = 'text'
  commentInput.placeholder = '添加评论…'
  var okButton = document.createElement('button')
  okButton.className = 'ok'
  okButton.disabled = true
  okButton.style.cursor = 'default'
  okButton.title = '确认这条注释'
  okButton.appendChild(icon([{ d: 'M5 12.5l4.4 4.4L19 7.2' }], { width: '2' }))
  bubble.appendChild(tweakButton)
  bubble.appendChild(commentInput)
  bubble.appendChild(okButton)
  shadow.appendChild(bubble)

  var panel = document.createElement('div')
  panel.className = 'panel'
  var panelHead = document.createElement('div')
  panelHead.className = 'phead'
  var panelNum = document.createElement('span')
  panelNum.className = 'pnum'
  var panelTag = document.createElement('span')
  panelTag.className = 'ptag'
  panelHead.appendChild(panelNum)
  panelHead.appendChild(panelTag)
  var panelScroll = document.createElement('div')
  panelScroll.className = 'pscroll'
  // The annotation text lives here too: typing in the panel and typing in the pill are the same field.
  var panelCommentWrap = document.createElement('div')
  panelCommentWrap.className = 'pcsection'
  var panelComment = document.createElement('textarea')
  panelComment.className = 'pcomment'
  panelComment.rows = 1
  panelComment.placeholder = '描述这一处要改什么…'
  panelCommentWrap.appendChild(panelComment)
  var panelFoot = document.createElement('div')
  panelFoot.className = 'pfoot'
  var cancelPanelButton = document.createElement('button')
  cancelPanelButton.className = 'btn'
  cancelPanelButton.textContent = '取消'
  var savePanelButton = document.createElement('button')
  savePanelButton.className = 'btn dark'
  savePanelButton.textContent = '保存'
  panelFoot.appendChild(cancelPanelButton)
  panelFoot.appendChild(savePanelButton)
  panel.appendChild(panelHead)
  panel.appendChild(panelCommentWrap)
  panel.appendChild(panelScroll)
  panel.appendChild(panelFoot)
  shadow.appendChild(panel)

  // ---------------------------------------------------------------- helpers

  function inOverlay(event) {
    if (typeof event.composedPath === 'function') return event.composedPath().indexOf(host) !== -1
    return event.target === host
  }

  function toast(text, bad) {
    var node = document.createElement('div')
    node.className = bad ? 'toast bad' : 'toast'
    node.textContent = text
    toasts.appendChild(node)
    setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node)
    }, bad ? 4200 : 2600)
  }

  function esc(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value)
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&')
  }

  function selectorFor(el) {
    if (!el || el.nodeType !== 1) return ''
    if (el.id) {
      var byId = '#' + esc(el.id)
      try {
        if (document.querySelectorAll(byId).length === 1) return byId
      } catch (error) { /* an id with odd characters still falls through to the path */ }
    }
    var parts = []
    var node = el
    while (node && node.nodeType === 1 && parts.length < 7) {
      var piece = node.tagName.toLowerCase()
      var classes = Array.prototype.slice.call(node.classList || []).filter(function (name) {
        return name.length < 40 && !/^(is-|has-|active$|open$|hover)/.test(name)
      }).slice(0, 2)
      if (classes.length > 0) piece += classes.map(function (name) { return '.' + esc(name) }).join('')
      if (node.id) {
        piece = '#' + esc(node.id)
        parts.unshift(piece)
        break
      }
      var parent = node.parentElement
      if (parent) {
        var same = Array.prototype.filter.call(parent.children, function (child) {
          return child.tagName === node.tagName
        })
        if (same.length > 1) piece += ':nth-of-type(' + (same.indexOf(node) + 1) + ')'
      }
      parts.unshift(piece)
      if (!parent || parent === document.body || parent === document.documentElement) {
        parts.unshift('body')
        break
      }
      node = parent
    }
    return parts.join(' > ')
  }

  function sourceHint(el) {
    var hints = []
    var attributes = ['data-source', 'data-inspector-relative-path', 'data-file', 'data-loc', 'data-component', 'data-testid']
    for (var i = 0; i < attributes.length; i += 1) {
      var value = el.getAttribute && el.getAttribute(attributes[i])
      if (value) hints.push(attributes[i] + '=' + value)
    }
    try {
      var fiberKey = Object.keys(el).filter(function (key) { return key.indexOf('__reactFiber$') === 0 })[0]
      if (fiberKey) {
        var fiber = el[fiberKey]
        var hops = 0
        var names = []
        while (fiber && hops < 40) {
          var source = fiber._debugSource
          if (source && source.fileName) {
            hints.push('react ' + source.fileName + ':' + source.lineNumber + ':' + source.columnNumber)
            break
          }
          var owner = fiber._debugOwner
          if (owner && owner.type && typeof owner.type.name === 'string' && names.length < 3) names.push(owner.type.name)
          fiber = fiber.return
          hops += 1
        }
        if (names.length > 0) hints.push('react-comp ' + names.join(' < '))
      }
    } catch (error) { /* production React has no dev source */ }
    try {
      var vue = el.__vueParentComponent
      if (vue && vue.type && vue.type.__file) hints.push('vue ' + vue.type.__file + (vue.type.__name ? ' (' + vue.type.__name + ')' : ''))
    } catch (error) { /* not a Vue app */ }
    try {
      var svelteKey = Object.keys(el).filter(function (key) { return /__svelte_meta|__svelte/.test(key) })[0]
      if (svelteKey) {
        var meta = el[svelteKey]
        if (meta && meta.loc && meta.loc.file) hints.push('svelte ' + meta.loc.file + ':' + meta.loc.line)
      }
    } catch (error) { /* not a Svelte app */ }
    return hints.join(' | ')
  }

  function ancestorChain(el) {
    var chain = []
    var node = el.parentElement
    while (node && node.nodeType === 1 && chain.length < 4) {
      var piece = node.tagName.toLowerCase()
      if (node.id) piece += '#' + node.id
      var cls = Array.prototype.slice.call(node.classList || []).slice(0, 3)
      if (cls.length > 0) piece += '.' + cls.join('.')
      chain.push(piece)
      node = node.parentElement
    }
    return chain.reverse().join(' > ')
  }

  function describe(el) {
    var rect = el.getBoundingClientRect()
    var computed = window.getComputedStyle(el)
    var wanted = ['display', 'position', 'color', 'background-color', 'background-image', 'font-size',
      'font-weight', 'line-height', 'letter-spacing', 'padding', 'margin', 'border', 'border-radius',
      'box-shadow', 'width', 'height', 'gap', 'flex-direction', 'grid-template-columns', 'opacity', 'text-align']
    var styles = {}
    for (var i = 0; i < wanted.length; i += 1) {
      var value = computed.getPropertyValue(wanted[i])
      if (value && value !== 'none' && value !== 'normal' && value !== 'auto' && value !== '0px' && value !== 'rgba(0, 0, 0, 0)') {
        styles[wanted[i]] = value
      }
    }
    var text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 240)
    return {
      page: location.href,
      pageTitle: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      selector: selectorFor(el),
      tag: el.tagName.toLowerCase(),
      id: el.id || '',
      classes: Array.prototype.slice.call(el.classList || []).join(' '),
      role: el.getAttribute ? el.getAttribute('role') || '' : '',
      text: text,
      outerHTML: String(el.outerHTML || '').slice(0, 2000),
      styles: styles,
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      source: sourceHint(el),
      ancestors: ancestorChain(el),
      pickedAt: new Date().toISOString(),
    }
  }

  function paint(el) {
    if (!el || el === host || !el.isConnected || suppressOutline) {
      outline.style.display = 'none'
      tagEl.style.display = 'none'
      return
    }
    var rect = el.getBoundingClientRect()
    outline.style.display = 'block'
    /* 2px 的框画在元素外面：元素自己画的 border 一点都不会被盖住。 */
    outline.style.left = rect.left - 2 + 'px'
    outline.style.top = rect.top - 2 + 'px'
    outline.style.width = Math.max(rect.width, 0) + 4 + 'px'
    outline.style.height = Math.max(rect.height, 0) + 4 + 'px'
    var label = el.tagName.toLowerCase()
    if (el.id) label += '#' + el.id
    var cls = Array.prototype.slice.call(el.classList || []).slice(0, 2)
    if (cls.length > 0) label += '.' + cls.join('.')
    tagEl.style.display = 'block'
    tagEl.textContent = label
    var top = rect.top - 22
    if (top < 2) top = rect.top + rect.height + 2
    tagEl.style.left = Math.max(2, rect.left) + 'px'
    tagEl.style.top = top + 'px'
    tagEl.style.maxWidth = Math.max(120, window.innerWidth - rect.left - 12) + 'px'
  }

  function pickTarget(event) {
    var target = event.target
    if (!target || target === host || target.nodeType !== 1) return null
    if (event.shiftKey && target.parentElement) target = target.parentElement
    return target
  }

  function clamp(value, min, max) {
    if (max < min) return min
    return Math.min(Math.max(value, min), max)
  }

  // ---------------------------------------------------------------- style fields

  function toHex(color) {
    var match = /^rgba?\(([^)]+)\)$/.exec(String(color || '').replace(/\s+/g, ' '))
    if (!match) return /^#[0-9a-f]{3,8}$/i.test(String(color || '')) ? color : '#000000'
    var parts = match[1].split(',')
    var r = parseInt(parts[0], 10)
    var g = parseInt(parts[1], 10)
    var b = parseInt(parts[2], 10)
    var a = parts.length > 3 ? parseFloat(parts[3]) : 1
    if (a === 0) return '#ffffff'
    function hex(value) {
      var out = Math.max(0, Math.min(255, value)).toString(16)
      return out.length === 1 ? '0' + out : out
    }
    return '#' + hex(r) + hex(g) + hex(b)
  }

  function cssName(prop) {
    return String(prop).replace(/[A-Z]/g, function (letter) { return '-' + letter.toLowerCase() })
  }

  /* ---------------------------------------------------------------------------
   * Runtime stylesheet.
   *
   * Writing `el.style` loses on pages whose framework owns the style attribute:
   * React/Vue re-render replaces the whole attribute and our declaration is gone,
   * which reads back as "the site locked this edge". So we stop touching the
   * element's own style and keep our declarations in a <style> keyed by a pin
   * attribute (frameworks do not remove attributes they never set).
   * ------------------------------------------------------------------------- */

  var RULE_STYLE_ID = 'element-ref-rules'
  var pinSeq = 0

  function pinOf(mark) {
    if (!mark.pin) {
      pinSeq += 1
      mark.pin = 'p' + pinSeq
    }
    return mark.pin
  }

  function ruleSheet() {
    var node = document.getElementById(RULE_STYLE_ID)
    if (!node) {
      node = document.createElement('style')
      node.id = RULE_STYLE_ID
      var host = document.head || document.documentElement
      if (host) host.appendChild(node)
    }
    return node
  }

  /**
   * Specificity has to beat whatever the page wrote, including `#id ... !important`
   * rules, so the selector repeats a pin attribute and stacks `:not(#x)` four times
   * (that contributes four ID weights without matching anything extra).
   */
  function ruleSelector(mark) {
    var base = '[data-element-ref-pin="' + pinOf(mark) + '"]'
    var boosted = ':not(#dsh-none):not(#dsh-none):not(#dsh-none):not(#dsh-none)' + base + base + base + base
    return boosted
  }

  function renderRules() {
    var lines = []
    for (var i = 0; i < marks.length; i += 1) {
      var mark = marks[i]
      if (!mark.rules) continue
      var names = Object.keys(mark.rules)
      if (!names.length) continue
      var body = ''
      for (var j = 0; j < names.length; j += 1) {
        body += names[j] + ':' + mark.rules[names[j]] + ' !important;'
      }
      lines.push(ruleSelector(mark) + '{' + body + '}')
    }
    var node = ruleSheet()
    if (node) node.textContent = lines.join('\n')
  }

  function writeRule(mark, name, value) {
    if (!mark) return
    if (!mark.rules) mark.rules = {}
    if (value === '' || value == null) delete mark.rules[name]
    else mark.rules[name] = String(value)
    if (Object.keys(mark.rules).length) {
      try { mark.el.setAttribute('data-element-ref-pin', pinOf(mark)) } catch (error) { /* ignore */ }
    } else {
      try { mark.el.removeAttribute('data-element-ref-pin') } catch (error) { /* ignore */ }
    }
    renderRules()
  }

  function dropRules(mark) {
    if (!mark) return
    mark.rules = {}
    try { mark.el.removeAttribute('data-element-ref-pin') } catch (error) { /* ignore */ }
    renderRules()
  }

  /**
   * Write one inline declaration, remembering what the page itself had there first.
   *
   * "默认" means "回到页面原本的样子", and the page's original may be an inline value we are about
   * to overwrite (a hero title with `font-size:64px` written inline, say). Deleting the property
   * would be wrong there: it would drop to the stylesheet instead of the value the page chose.
   */
  function writeStyle(mark, prop, value) {
    writeRule(mark, cssName(prop), value)
  }

  /* 逐边写入：某些站点用 border-top: 0 !important 把单边锁死，
     写 shorthand 会被顶回来，所以四条边各写一次，写完再回读确认。 */
  function writeBorderSide(mark, side, prop, value) {
    writeRule(mark, cssName('border' + side + prop), value)
  }

  var SIDES = ['Top', 'Right', 'Bottom', 'Left']

  /** Undo every border declaration we forced, shorthands included. */
  function clearBorder(mark) {
    if (!mark) return
    if (!mark.rules) mark.rules = {}
    for (var i = 0; i < SIDES.length; i += 1) {
      var side = SIDES[i]
      delete mark.rules['border-' + side.toLowerCase() + '-width']
      delete mark.rules['border-' + side.toLowerCase() + '-style']
      delete mark.rules['border-' + side.toLowerCase() + '-color']
      delete mark.rules['border-' + side.toLowerCase()]
    }
    delete mark.rules['position']
    delete mark.rules['z-index']
    if (!Object.keys(mark.rules).length) {
      try { mark.el.removeAttribute('data-element-ref-pin') } catch (error) { /* ignore */ }
    }
    renderRules()
    mark.__lockWarned = 0
  }

  function forceBorder(mark, width, style, colour) {
    for (var i = 0; i < SIDES.length; i += 1) {
      if (width !== undefined) writeBorderSide(mark, SIDES[i], 'Width', width)
      if (style !== undefined) writeBorderSide(mark, SIDES[i], 'Style', style)
      if (colour !== undefined) writeBorderSide(mark, SIDES[i], 'Color', colour)
    }
    // Longhands alone are not always enough: a reset that sets the per-side shorthand
    // (`border-top: 0 !important`) keeps winning on some sites, so write that too.
    if (width !== undefined && style !== undefined) {
      var paint = colour === undefined ? '' : String(colour)
      for (var j = 0; j < SIDES.length; j += 1) {
        var shortName = 'border' + SIDES[j]
        writeRule(mark, cssName(shortName), width + ' ' + style + (paint ? ' ' + paint : ''))
      }
      /* Banner images usually carry a gradient overlay on top of them, so their border is
         painted but the top edge stays hidden. Lifting the element above its siblings is
         the only way to see it; both declarations go away with the rules. */
      writeRule(mark, 'position', 'relative')
      writeRule(mark, 'z-index', '5')
    }
    // Verify on the next frame, not synchronously: a site that rewrites the style attribute in
    // its own render pass would otherwise look fine here and still be 0 px on screen.
    if (width) {
      var want = pxOf(width)
      var target = mark.el
      var check = function () {
        if (!target || !target.isConnected) return
        var applied = ''
        var appliedStyle = ''
        try {
          var cs = window.getComputedStyle(target)
          applied = cs.borderTopWidth
          appliedStyle = cs.borderTopStyle
        } catch (error) {
          applied = ''
        }
        var got = pxOf(applied)
        if (want > 0 && got === 0) {
          note('border-locked', {
            want: String(width),
            applied: String(applied),
            style: String(appliedStyle),
            tail: String(target.getAttribute('style') || '').slice(-90),
          })
          if (mark.__lockWarned !== want) {
            mark.__lockWarned = want
            toast('这个元素的顶边被页面样式锁住了，其余三条边已生效')
          }
        } else {
          mark.__lockWarned = 0
        }
      }
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(check)
      else setTimeout(check, 16)
    }
  }

  function pxOf(value) {
    var number = parseFloat(value)
    return Number.isFinite(number) ? number : 0
  }

  // ---------------------------------------------------------------- colour popover
  // The panel owns its colour UI: the OS dialog behind `<input type=color>` looks nothing like the
  // rest of this thing, and it cannot show presets next to a live saturation field.

  function byteOf(value) {
    var number = parseInt(value, 10)
    if (!Number.isFinite(number)) return 0
    return Math.min(255, Math.max(0, number))
  }

  function parseToRgb(value) {
    var raw = String(value == null ? '' : value).trim()
    if (!raw) return null
    var hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(raw)
    if (hex) {
      var body = hex[1]
      if (body.length === 3) body = body[0] + body[0] + body[1] + body[1] + body[2] + body[2]
      var alpha = body.length === 8 ? parseInt(body.slice(6, 8), 16) / 255 : 1
      return {
        r: parseInt(body.slice(0, 2), 16),
        g: parseInt(body.slice(2, 4), 16),
        b: parseInt(body.slice(4, 6), 16),
        a: Math.round(alpha * 1000) / 1000,
      }
    }
    var rgb = /^rgba?\(([^)]+)\)$/i.exec(raw.replace(/\s+/g, ' '))
    if (!rgb) return null
    var parts = rgb[1].split(/[ ,/]+/)
    var kept = []
    for (var i = 0; i < parts.length; i += 1) if (parts[i] !== '') kept.push(parts[i])
    if (kept.length < 3) return null
    var rawAlpha = kept.length > 3 ? parseFloat(kept[3]) : 1
    return {
      r: byteOf(kept[0]),
      g: byteOf(kept[1]),
      b: byteOf(kept[2]),
      a: Number.isFinite(rawAlpha) ? Math.min(1, Math.max(0, rawAlpha)) : 1,
    }
  }

  function hexOf(rgb) {
    function two(value) {
      var out = byteOf(value).toString(16)
      return out.length === 1 ? '0' + out : out
    }
    return '#' + two(rgb.r) + two(rgb.g) + two(rgb.b)
  }

  function hsvOf(rgb) {
    var r = rgb.r / 255
    var g = rgb.g / 255
    var b = rgb.b / 255
    var max = Math.max(r, g, b)
    var min = Math.min(r, g, b)
    var span = max - min
    var hue = 0
    if (span !== 0) {
      if (max === r) hue = ((g - b) / span) % 6
      else if (max === g) hue = (b - r) / span + 2
      else hue = (r - g) / span + 4
      hue *= 60
      if (hue < 0) hue += 360
    }
    return { h: hue, s: max === 0 ? 0 : span / max, v: max }
  }

  function rgbOf(hsv) {
    var hue = ((hsv.h % 360) + 360) % 360
    var s = Math.min(1, Math.max(0, hsv.s))
    var v = Math.min(1, Math.max(0, hsv.v))
    var chroma = v * s
    var part = chroma * (1 - Math.abs(((hue / 60) % 2) - 1))
    var mid = v - chroma
    var out
    if (hue < 60) out = [chroma, part, 0]
    else if (hue < 120) out = [part, chroma, 0]
    else if (hue < 180) out = [0, chroma, part]
    else if (hue < 240) out = [0, part, chroma]
    else if (hue < 300) out = [part, 0, chroma]
    else out = [chroma, 0, part]
    return {
      r: Math.round((out[0] + mid) * 255),
      g: Math.round((out[1] + mid) * 255),
      b: Math.round((out[2] + mid) * 255),
    }
  }

  function alphaText(value) {
    var rgb = parseToRgb(value)
    return rgb ? rgb.a : 1
  }

  /* One notation for every colour we print: opaque colours read as rgb(...) exactly like
     getComputedStyle does, translucent ones as rgba(...). Mixing hex and rgb in the same
     field made the value look like it changed format after a pick. */
  function colorText(rgb, alpha) {
    var a = alpha == null ? 1 : alpha
    if (!(a >= 0 && a < 0.999)) return 'rgb(' + Math.round(rgb.r) + ', ' + Math.round(rgb.g) + ', ' + Math.round(rgb.b) + ')'
    return 'rgba(' + Math.round(rgb.r) + ', ' + Math.round(rgb.g) + ', ' + Math.round(rgb.b) + ', ' + (Math.round(a * 1000) / 1000) + ')'
  }

  var CP_GRAYS = [
    '#ffffff', '#f7f7f8', '#efeff1', '#e6e7ea', '#d8dade', '#c6c9cf',
    '#a9aeb6', '#8b9099', '#6b7079', '#4c5057', '#2f3237', '#111827',
  ]
  var CP_ROWS = [
    { s: 0.26, v: 0.99 },
    { s: 0.44, v: 0.97 },
    { s: 0.62, v: 0.94 },
    { s: 0.78, v: 0.86 },
    { s: 0.92, v: 0.72 },
    { s: 1, v: 0.55 },
  ]
  var killColor = null
  var colorAnchor = null

  function closeColorPopover() {
    if (colorAnchor && colorAnchor.classList) colorAnchor.classList.remove('open')
    colorAnchor = null
    if (!killColor) return
    var done = killColor
    killColor = null
    done()
  }

  /** Put a floating node next to its trigger, flipping up when there is no room below. */
  function placeNear(node, anchor, gap) {
    var box = anchor && typeof anchor.getBoundingClientRect === 'function' ? anchor.getBoundingClientRect() : null
    if (!box) return
    var width = node.offsetWidth || 240
    var height = node.offsetHeight || 260
    var space = gap || 8
    var left = Math.min(Math.max(8, box.left), Math.max(8, window.innerWidth - width - 8))
    var top = box.bottom + space
    if (top + height > window.innerHeight - 8) top = Math.max(8, box.top - height - space)
    node.style.left = Math.round(left) + 'px'
    node.style.top = Math.round(top) + 'px'
  }

  /** Click outside or Esc closes any floating surface; returns the unbind. */
  function bindDismiss(root, anchor, close) {
    function onDown(event) {
      var path = event.composedPath ? event.composedPath() : []
      if (path.indexOf(root) !== -1) return
      if (path.indexOf(anchor) !== -1) return
      close()
    }
    function onKey(event) {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      close()
    }
    function bind() {
      document.addEventListener('pointerdown', onDown, true)
      document.addEventListener('keydown', onKey, true)
    }
    if (typeof setTimeout === 'function') setTimeout(bind, 0)
    else bind()
    return function () {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }

  var killMenu = null
  var menuAnchor = null

  function closeMenu() {
    if (menuAnchor && menuAnchor.classList) menuAnchor.classList.remove('open')
    menuAnchor = null
    if (!killMenu) return
    var done = killMenu
    killMenu = null
    done()
  }

  /**
   * The dropdown. `<select>` hands its list to the OS, which is the one popup we cannot round, so
   * the field and the list are drawn here — same tokens, same easing as everything else.
   */
  function openMenu(anchor, items, currentValue, onPick) {
    /* pressing the field again folds the list away */
    if (killMenu && menuAnchor === anchor) {
      closeMenu()
      return
    }
    closeMenu()
    if (!anchor || !shadow) return
    menuAnchor = anchor
    if (anchor.classList) anchor.classList.add('open')
    var root = document.createElement('div')
    root.className = 'menu'
    root.setAttribute('data-dsher', 'menu')
    var current = String(currentValue == null ? '' : currentValue)
    for (var i = 0; i < items.length; i += 1) {
      var item = items[i]
      var line = document.createElement('button')
      line.type = 'button'
      line.className = 'menu-item' + (item.value === current ? ' on' : '')
      var text = document.createElement('span')
      text.className = 'menu-text'
      text.textContent = item.label
      line.appendChild(text)
      if (item.value === current) {
        var tick = document.createElement('span')
        tick.className = 'menu-tick'
        tick.appendChild(icon([{ d: 'M5 12.5l4.5 4.5L19 7.5' }], { width: '2.2' }))
        line.appendChild(tick)
      }
      // 一定要用闭包把 value 固定住：`var item` 在循环里是同一个变量，
      // 否则每一行都会提交最后一行（表现成"选过一次之后就点不动了"）。
      ;(function (value) {
        line.addEventListener('click', function (event) {
          event.preventDefault()
          event.stopPropagation()
          closeMenu()
          onPick(value)
        })
      })(item.value)
      root.appendChild(line)
    }
    shadow.appendChild(root)
    placeNear(root, anchor, 6)
    var unbind = bindDismiss(root, anchor, closeMenu)
    killMenu = function () {
      unbind()
      if (root.parentNode) root.parentNode.removeChild(root)
    }
  }

  /**
   * One popover for every colour field: presets first (that is what people reach for), and a
   * saturation field + hue rail + hex box for the rest.
   */
  function openColorPopover(anchor, value, onPick) {
    /* pressing the same swatch again puts it away */
    if (killColor && colorAnchor === anchor) {
      closeColorPopover()
      return
    }
    closeColorPopover()
    if (!anchor || !shadow) return
    colorAnchor = anchor
    if (anchor.classList) anchor.classList.add('open')

    var start = parseToRgb(value) || { r: 17, g: 24, b: 39, a: 1 }
    var hueState = hsvOf(start)
    /* Opening the popover must not rewrite the field: a fully transparent value stays
       rgba(0, 0, 0, 0) until the user actually picks something, at which point it turns
       opaque (otherwise the pick would be invisible). */
    var alphaNow = start.a
    var picked = colorText(start, alphaNow)

    var root = document.createElement('div')
    root.className = 'cp'
    root.setAttribute('data-dsher', 'color')

    var tabs = document.createElement('div')
    tabs.className = 'cp-tabs'
    var tabPreset = document.createElement('div')
    tabPreset.className = 'cp-tab on'
    tabPreset.textContent = '预设'
    var tabCustom = document.createElement('div')
    tabCustom.className = 'cp-tab'
    tabCustom.textContent = '自定义'
    tabs.appendChild(tabPreset)
    tabs.appendChild(tabCustom)

    // ---- custom pane
    var custom = document.createElement('div')
    var sv = document.createElement('div')
    sv.className = 'cp-sv'
    var knob = document.createElement('div')
    knob.className = 'cp-knob'
    sv.appendChild(knob)
    var hueRail = document.createElement('div')
    hueRail.className = 'cp-hue'
    var hueKnob = document.createElement('div')
    hueKnob.className = 'cp-hk'
    hueRail.appendChild(hueKnob)
    var hexInput = document.createElement('input')
    hexInput.className = 'cp-hex'
    hexInput.setAttribute('spellcheck', 'false')
    hexInput.title = '颜色值：rgb()、rgba() 或 #hex 都认'
    hexInput.placeholder = 'rgb(255, 255, 255)'
    var eye = document.createElement('button')
    eye.type = 'button'
    eye.className = 'cp-eye'
    eye.title = '从屏幕上取色'
    eye.appendChild(icon([{ d: 'M4 20l4.5-1 9-9a2.1 2.1 0 0 0-3-3l-9 9L4 20Z' }, { d: 'M13.5 6.5l4 4' }]))
    var hexRow = document.createElement('div')
    hexRow.className = 'cp-row'
    hexRow.appendChild(hexInput)
    hexRow.appendChild(eye)
    custom.appendChild(sv)
    custom.appendChild(hueRail)
    custom.appendChild(hexRow)
    custom.style.display = 'none'

    // ---- presets pane
    var presets = document.createElement('div')
    function section(name) {
      var block = document.createElement('div')
      block.className = 'cp-sec'
      var title = document.createElement('div')
      title.className = 'cp-secname'
      title.textContent = name
      block.appendChild(title)
      return block
    }
    // "Default" and "no background" are one click, above the neutrals: they are not colours, so
    // they never belong in the grid — the panel simply drops the override or paints it away.
    var baseBlock = section('基础')
    var baseGrid = document.createElement('div')
    baseGrid.className = 'cp-grid base'
    function baseCell(className, title, value) {
      var cell = document.createElement('button')
      cell.type = 'button'
      cell.className = 'cp-cell ' + className
      cell.title = title
      cell.setAttribute('aria-label', title)
      cell.addEventListener('mouseenter', function () { cell.classList.add('hot') })
      cell.addEventListener('mouseleave', function () { cell.classList.remove('hot') })
      cell.addEventListener('click', function () {
        onPick(value)
        closeColorPopover()
      })
      baseGrid.appendChild(cell)
      return cell
    }
    baseCell('none', '默认（去掉这处的颜色设置）', '')
    baseCell('trans', '纯透明 / 无背景', 'rgba(0, 0, 0, 0)')
    baseBlock.appendChild(baseGrid)

    var grayBlock = section('中性')
    var grayGrid = document.createElement('div')
    grayGrid.className = 'cp-grid g6'
    grayBlock.appendChild(grayGrid)
    var paletteBlock = section('色板')
    var paletteGrid = document.createElement('div')
    paletteGrid.className = 'cp-grid'
    paletteBlock.appendChild(paletteGrid)
    presets.appendChild(baseBlock)
    presets.appendChild(grayBlock)
    presets.appendChild(paletteBlock)

    var cells = []
    function addCell(grid, color) {
      var cell = document.createElement('button')
      cell.type = 'button'
      cell.className = 'cp-cell'
      cell.title = color
      cell.style.background = color
      cell.setAttribute('data-color', color)
      cell.addEventListener('mouseenter', function () { cell.classList.add('hot') })
      cell.addEventListener('mouseleave', function () { cell.classList.remove('hot') })
      cell.addEventListener('click', function () {
        var rgb = parseToRgb(color)
        if (!rgb) return
        hueState = hsvOf(rgb)
        paint()
      })
      grid.appendChild(cell)
      cells.push(cell)
      return cell
    }
    for (var g = 0; g < CP_GRAYS.length; g += 1) addCell(grayGrid, CP_GRAYS[g])
    for (var r = 0; r < CP_ROWS.length; r += 1) {
      for (var c = 0; c < 10; c += 1) {
        var hueStep = (c / 10) * 360
        addCell(paletteGrid, hexOf(rgbOf({ h: hueStep, s: CP_ROWS[r].s, v: CP_ROWS[r].v })))
      }
    }

    root.appendChild(tabs)
    root.appendChild(presets)
    root.appendChild(custom)
    shadow.appendChild(root)

    var skipHexEvent = false
    var editingColor = false

    function paint(commit) {
      if (commit !== false && !(alphaNow > 0)) alphaNow = 1
      var rgb = rgbOf(hueState)
      picked = colorText(rgb, alphaNow)
      sv.style.backgroundColor = 'hsl(' + Math.round(((hueState.h % 360) + 360) % 360) + ', 100%, 50%)'
      knob.style.left = (hueState.s * 100) + '%'
      knob.style.top = ((1 - hueState.v) * 100) + '%'
      hueKnob.style.left = (hueState.h / 360 * 100) + '%'
      /* While the user is typing we leave their text alone; it snaps to the canonical
         notation on blur or Enter. */
      if (!editingColor) {
        skipHexEvent = true
        hexInput.value = picked
        skipHexEvent = false
      }
      var current = hexOf(rgb).toLowerCase()
      for (var i = 0; i < cells.length; i += 1) {
        var same = String(cells[i].getAttribute('data-color') || '').toLowerCase() === current
        cells[i].classList.toggle('on', same)
      }
      if (commit !== false) onPick(picked)
    }

    function trackDrag(el, handler) {
      el.addEventListener('pointerdown', function (event) {
        event.preventDefault()
        event.stopPropagation()
        try { el.setPointerCapture(event.pointerId) } catch (error) { /* older engines */ }
        function run(moveEvent) {
          var box = el.getBoundingClientRect()
          if (!box || !box.width || !box.height) return
          var x = Math.min(1, Math.max(0, (moveEvent.clientX - box.left) / box.width))
          var y = Math.min(1, Math.max(0, (moveEvent.clientY - box.top) / box.height))
          handler(x, y)
        }
        run(event)
        function move(moveEvent) { run(moveEvent) }
        function stop() {
          el.removeEventListener('pointermove', move)
          el.removeEventListener('pointerup', stop)
          el.removeEventListener('pointercancel', stop)
        }
        el.addEventListener('pointermove', move)
        el.addEventListener('pointerup', stop)
        el.addEventListener('pointercancel', stop)
      })
    }

    trackDrag(sv, function (x, y) {
      hueState.s = x
      hueState.v = 1 - y
      paint()
    })
    trackDrag(hueRail, function (x) {
      hueState.h = x * 360
      paint()
    })

    hexInput.addEventListener('input', function () {
      if (skipHexEvent) return
      var rgb = parseToRgb(hexInput.value)
      if (!rgb) return
      editingColor = true
      hueState = hsvOf(rgb)
      paint()
    })

    function settleColorText() {
      editingColor = false
      hexInput.value = picked
    }
    hexInput.addEventListener('blur', settleColorText)
    hexInput.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') return
      event.preventDefault()
      event.stopPropagation()
      settleColorText()
      hexInput.blur()
    })

    eye.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      var Picker = window.EyeDropper
      if (typeof Picker !== 'function') {
        toast('这个浏览器不支持屏幕取色', true)
        return
      }
      var opener = new Picker()
      var done = opener.open()
      if (!done || typeof done.then !== 'function') return
      done.then(function (result) {
        var rgb = parseToRgb(result && result.sRGBHex)
        if (!rgb) return
        hueState = hsvOf(rgb)
        paint()
      }).catch(function () { /* the user pressed Esc */ })
    })

    function showPane(which) {
      var isCustom = which === 'custom'
      tabCustom.className = isCustom ? 'cp-tab on' : 'cp-tab'
      tabPreset.className = isCustom ? 'cp-tab' : 'cp-tab on'
      custom.style.display = isCustom ? '' : 'none'
      presets.style.display = isCustom ? 'none' : ''
    }
    tabPreset.addEventListener('click', function () { showPane('preset') })
    tabCustom.addEventListener('click', function () { showPane('custom') })

    // ---- position next to the swatch, flipping up when the panel is near the bottom
    placeNear(root, anchor, 8)
    var unbind = bindDismiss(root, anchor, closeColorPopover)

    killColor = function () {
      unbind()
      if (root.parentNode) root.parentNode.removeChild(root)
    }

    paint(false)
  }

  function sidesOf(value) {
    var parts = String(value || '').trim().split(/\s+/)
    if (parts.length === 1) return [parts[0], parts[0], parts[0], parts[0]]
    if (parts.length === 2) return [parts[0], parts[1], parts[0], parts[1]]
    if (parts.length === 3) return [parts[0], parts[1], parts[2], parts[1]]
    if (parts.length >= 4) return [parts[0], parts[1], parts[2], parts[3]]
    return ['0px', '0px', '0px', '0px']
  }

  var FONTS = [
    ['system-ui', '系统默认'],
    ['-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif', '无衬线 UI'],
    ['"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif', '中文黑体'],
    ['"Songti SC", SimSun, serif', '衬线'],
    ['"SFMono-Regular", Menlo, Consolas, monospace', '等宽'],
    ['Georgia, "Times New Roman", serif', 'Georgia'],
    ['Inter, "Helvetica Neue", Arial, sans-serif', 'Inter'],
  ]

  var WEIGHTS = [['300', '300 细'], ['400', '400 常规'], ['500', '500 中等'], ['600', '600 半粗'], ['700', '700 粗'], ['800', '800 特粗']]

  function makeInput(type, value, attrs) {
    var input = document.createElement('input')
    input.className = 'inp'
    input.type = type
    if (value !== undefined && value !== null) input.value = String(value)
    if (attrs) for (var key in attrs) if (Object.prototype.hasOwnProperty.call(attrs, key)) input.setAttribute(key, attrs[key])
    return input
  }

  function row(label, control) {
    var wrap = document.createElement('div')
    wrap.className = 'row'
    var lbl = document.createElement('span')
    lbl.className = 'lbl'
    lbl.textContent = label
    // Fields that need their own 宽度/grid hand over a ready `.ctl`; everything else gets one.
    var ctl = control && String(control.className || '').indexOf('ctl') !== -1 ? control : document.createElement('div')
    if (ctl !== control) {
      ctl.className = 'ctl'
      if (control) ctl.appendChild(control)
    }
    wrap.appendChild(lbl)
    wrap.appendChild(ctl)
    // 只有真的在改边框/圆角时才把高亮框收起来（它会压住元素自己的边框），
    // 鼠标划过不算——平时一律常亮。
    if (/^(边框|圆角)/.test(String(label))) {
      wrap.addEventListener('input', peekWhileEditing, true)
    }
    return wrap
  }

  /* 改过一次边框之后就一直收着高亮，直到保存/收起面板——中途不再自己弹回来。 */
  function peekWhileEditing() {
    hideOutlineForPeek()
  }

  function hideOutlineForPeek() {
    suppressOutline = true
    outline.style.display = 'none'
    tagEl.style.display = 'none'
  }

  function showOutlineAfterPeek() {
    suppressOutline = false
    if (activeMark) paint(activeMark.el)
  }

  /* One undo button per row. It hangs just left of the control so the row keeps its
     two-column grid, and it only shows up once that field actually changed. */
  function attachUndo(wrap, mark, label, revert) {
    var ctl = wrap && wrap.children && wrap.children[1]
    if (!ctl) return
    var btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'undoBtn'
    btn.title = '撤销这一处修改'
    btn.setAttribute('aria-label', label + ' 撤销')
    btn.appendChild(icon([{ d: 'M4 10a8 8 0 1 1 2 6M4 4v6h6' }], { width: '2' }))
    ctl.appendChild(btn)
    if (!mark.__undo) mark.__undo = []
    mark.__undo.push({ btn: btn, label: label })
    btn.addEventListener('click', function (event) {
      try { event.preventDefault() } catch (error) { /* ignore */ }
      try { event.stopPropagation() } catch (error) { /* ignore */ }
      revert()
      layout()
      syncSaveButton()
      refreshUndo(mark)
    })
  }

  function refreshUndo(mark) {
    var list = (mark && mark.__undo) || []
    for (var i = 0; i < list.length; i += 1) {
      var item = list[i]
      var dirty = Object.prototype.hasOwnProperty.call(mark.adjustments || {}, item.label)
      item.btn.style.display = dirty ? 'flex' : 'none'
    }
  }

  /* 每个属性第一次出现时的页面原值。保存后再打开面板时 computed 已经是我们改过的值，
     撤销必须回到这里记下的原值，否则"撤销"看起来像没反应。 */
  function seedOf(mark, prop, computed) {
    if (!mark.seed) mark.seed = {}
    if (!(prop in mark.seed)) mark.seed[prop] = String(computed == null ? '' : computed).trim()
    return mark.seed[prop]
  }

  function lengthField(mark, label, prop, computedValue, opts) {
    var box = document.createElement('div')
    box.className = 'numBox'
    var input = makeInput('number', Math.round(pxOf(computedValue)), { step: '1', min: '0' })
    var unit = document.createElement('span')
    unit.className = 'unitIn'
    unit.textContent = 'px'
    box.appendChild(input)
    box.appendChild(unit)
    var ctl = document.createElement('div')
    ctl.className = 'ctl short'
    ctl.appendChild(box)
    input.addEventListener('input', function () {
      var raw = input.value.trim()
      if (raw === '') {
        writeStyle(mark, prop, '')
        /* A border with no width is no border: drop everything we forced on. */
        if (opts && opts.solid) clearBorder(mark)
        delete mark.adjustments[label]
      } else {
        var next = raw + 'px'
        /* border-width alone paints nothing while border-style is still none. */
        if (opts && opts.solid) forceBorder(mark, next, 'solid')
        else writeStyle(mark, prop, next)
        mark.adjustments[label] = next
      }
      layout()
    })
    var wrap = row(label, ctl)
    wrap._ctl = input
    var original = Math.round(pxOf(seedOf(mark, prop, computedValue)))
    attachUndo(wrap, mark, label, function () {
      input.value = String(original)
      writeStyle(mark, prop, '')
      if (opts && opts.solid) clearBorder(mark)
      delete mark.adjustments[label]
    })
    return wrap
  }

  function colorField(mark, label, prop, computedValue) {
    var seedRgb = parseToRgb(computedValue)
    var text = makeInput('text', seedRgb ? colorText(seedRgb, seedRgb.a) : String(computedValue || '').trim())
    var swatch = document.createElement('button')
    swatch.type = 'button'
    swatch.className = 'swatch'
    swatch.title = '取色'
    var dot = document.createElement('span')
    dot.className = 'swatchdot'
    swatch.appendChild(dot)
    var box = document.createElement('div')
    box.className = 'colorBox'
    box.appendChild(swatch)
    box.appendChild(text)
    var ctl = document.createElement('div')
    ctl.className = 'ctl short wide'
    ctl.appendChild(box)

    function paintSwatch() {
      var rgb = parseToRgb(text.value)
      if (!rgb || rgb.a === 0) {
        dot.className = 'swatchdot empty'
        dot.style.background = ''
        return
      }
      dot.className = 'swatchdot'
      dot.style.background = colorText(rgb, rgb.a)
    }

    function apply(value) {
      var next = String(value || '').trim()
      if (next === '') {
        writeStyle(mark, prop, '')
        if (prop === 'borderColor') writeStyle(mark, 'borderStyle', '')
        delete mark.adjustments[label]
      } else {
        /* A border colour is invisible while border-style is still none. */
        if (prop === 'borderColor') forceBorder(mark, undefined, 'solid', next)
        else writeStyle(mark, prop, next)
        mark.adjustments[label] = next
      }
      if (prop === 'borderColor') peekWhileEditing()
      paintSwatch()
      layout()
    }

    text.addEventListener('input', function () { apply(text.value) })
    swatch.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      openColorPopover(swatch, text.value, function (next) {
        text.value = next
        apply(next)
      })
    })

    var wrap = row(label, ctl)
    wrap._ctl = text
    paintSwatch()
    var seedText = String(text.value || '')
    attachUndo(wrap, mark, label, function () {
      text.value = seedText
      paintSwatch()
      writeStyle(mark, prop, '')
      if (prop === 'borderColor') writeStyle(mark, 'borderStyle', '')
      delete mark.adjustments[label]
    })
    return wrap
  }

  var SIDE_NAMES = ['上', '底部', '左', '右']

  /* Bracket glyph for a pair of sides: 上/底部 share the vertical one, 左/右 the horizontal. */
  function pairGlyph(vertical) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 44 58')
    svg.setAttribute('width', '44')
    svg.setAttribute('height', '58')
    svg.setAttribute('preserveAspectRatio', 'none')
    svg.setAttribute('fill', 'none')
    svg.setAttribute('stroke-linecap', 'round')
    svg.setAttribute('stroke-linejoin', 'round')
    /* One continuous spine with an arm at each end, like the reference: a ] for the
       vertical pair, a [ for the horizontal pair. The chain badge sits on the spine. */
    /* Both pairs use the same shape; only the labels change. */
    var spine = 'M31 3V55'
    var arms = ['M31 3H8', 'M31 55H8']
    var paths = [spine].concat(arms)
    for (var i = 0; i < paths.length; i += 1) {
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', paths[i])
      path.setAttribute('stroke', '#b9c3d0')
      path.setAttribute('stroke-width', '2')
      svg.appendChild(path)
    }
    return svg
  }

  /* The little chain in the middle of a pair: editing one side also moves the other. */
  function lockButton(title) {
    var btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'sideLock'
    btn.title = title
    btn.setAttribute('aria-label', title)
    btn.setAttribute('aria-pressed', 'false')
    var glyph = icon([{ d: 'M9.2 14.8l5.6-5.6M8.4 11.6l-1.1 1.1a3.4 3.4 0 0 0 4.8 4.8l1.1-1.1M15.6 12.4l1.1-1.1a3.4 3.4 0 0 0-4.8-4.8l-1.1 1.1' }], {
      width: '2.6',
    })
    glyph.setAttribute('width', '11')
    glyph.setAttribute('height', '11')
    btn.appendChild(glyph)
    return btn
  }

  function sidesField(mark, label, prop, computedValue, startClosed) {
    /* seed 记的是页面原值（撤销要回到这里），values 显示的是当前值。 */
    var seed = sidesOf(seedOf(mark, prop, computedValue))
    var shown = sidesOf(computedValue)
    var values = [0, 1, 2, 3].map(function (index) {
      return String(Math.round(pxOf(shown[index])))
    })
    var group = document.createElement('div')
    group.className = 'sidesGroup' + (startClosed ? ' closed' : '')

    var head = document.createElement('div')
    head.className = 'sidesHead'
    var name = document.createElement('span')
    name.textContent = label
    var caret = icon([{ d: 'M7 10l5 5 5-5' }], { width: '2' })
    caret.setAttribute('width', '14')
    caret.setAttribute('height', '14')
    head.appendChild(name)
    head.appendChild(caret)

    var body = document.createElement('div')
    body.className = 'sidesBody'
    var collapsed = document.createElement('div')
    collapsed.className = 'sidesCollapsed'

    var inputs = []
    var minis = []
    var sideUndos = []

    function pair(from, to, vertical) {
      var wrap = document.createElement('div')
      wrap.className = 'sidePair'
      var names = document.createElement('div')
      names.className = 'names'
      var fields = document.createElement('div')
      fields.className = 'fields'
      for (var rowIndex = 0; rowIndex < 2; rowIndex += 1) {
        var index = rowIndex === 0 ? from : to
        var sideName = document.createElement('span')
        sideName.textContent = SIDE_NAMES[index]
        names.appendChild(sideName)

        var numBox = document.createElement('div')
        numBox.className = 'numBox'
        var input = makeInput('number', values[index], { step: '1', min: '0' })
        input.setAttribute('data-side', String(index))
        numBox.appendChild(input)
        var unit = document.createElement('span')
        unit.className = 'unitIn'
        unit.textContent = 'px'
        numBox.appendChild(unit)
        fields.appendChild(numBox)
        inputs.push(input)
        var undo = document.createElement('button')
        undo.type = 'button'
        undo.className = 'undoBtn'
        undo.title = '撤销这一处修改'
        undo.setAttribute('aria-label', label + ' ' + SIDE_NAMES[index] + ' 撤销')
        undo.appendChild(icon([{ d: 'M4 10a8 8 0 1 1 2 6M4 4v6h6' }], { width: '2' }))
        numBox.appendChild(undo)
        undo.style.display = 'none'
        ;(function (side) {
          undo.addEventListener('click', function (event) {
            try { event.preventDefault() } catch (error) { /* ignore */ }
            try { event.stopPropagation() } catch (error) { /* ignore */ }
            values[side] = String(Math.round(pxOf(seed[side])))
            write()
            paint()
            layout()
            syncSaveButton()
          })
        })(index)
        sideUndos.push({ btn: undo, index: index })
      }
      var glyphCol = document.createElement('div')
      glyphCol.className = 'glyphCol'
      glyphCol.appendChild(pairGlyph(vertical))
      var lock = lockButton('锁定' + label + (vertical ? '垂直值' : '水平值'))
      glyphCol.appendChild(lock)
      wrap.appendChild(names)
      wrap.appendChild(glyphCol)
      wrap.appendChild(fields)
      return { wrap: wrap, lock: lock, from: from, to: to }
    }

    var verticalPair = pair(0, 1, true)
    var horizontalPair = pair(2, 3, false)
    body.appendChild(verticalPair.wrap)
    body.appendChild(horizontalPair.wrap)

    var cells = document.createElement('div')
    cells.className = 'sideCells'
    for (var miniIndex = 0; miniIndex < 4; miniIndex += 1) {
      var cell = document.createElement('div')
      cell.className = 'sideCell'
      var mini = makeInput('number', values[miniIndex], { step: '1', min: '0' })
      mini.setAttribute('data-side', String(miniIndex))
      cell.appendChild(mini)
      cells.appendChild(cell)
      minis.push(mini)
    }
    collapsed.appendChild(cells)

    function paint() {
      for (var index = 0; index < 4; index += 1) {
        if (inputs[index].value !== values[index]) inputs[index].value = values[index]
        if (minis[index].value !== values[index]) minis[index].value = values[index]
      }
      for (var u = 0; u < sideUndos.length; u += 1) {
        var item = sideUndos[u]
        var original = String(Math.round(pxOf(seed[item.index])))
        item.btn.style.display = values[item.index] === original ? 'none' : 'flex'
      }
    }

    function write() {
      var filled = values.some(function (value) {
        return value !== ''
      })
      // 四个值都回到页面原本的数值时，这一处等于没改：把 shorthand 整个去掉，
      // 而不是写回一个 "0px 0px 0px 0px"。
      var backToPage = true
      for (var probe = 0; probe < 4; probe += 1) {
        if (String(Math.round(pxOf(seed[probe]))) !== String(values[probe])) {
          backToPage = false
          break
        }
      }
      if (!filled || backToPage) {
        writeStyle(mark, prop, '')
        delete mark.adjustments[label]
      } else {
        var text = values
          .map(function (value) {
            return (value === '' ? '0' : value) + 'px'
          })
          .join(' ')
        writeStyle(mark, prop, text)
        mark.adjustments[label] = text
      }
      mark.touched = true
      syncSaveButton()
      layout()
    }

    function bind(list) {
      for (var index = 0; index < list.length; index += 1) {
        list[index].addEventListener('input', function (event) {
          var input = event.target
          var slot = Number(input.getAttribute('data-side'))
          values[slot] = input.value.trim()
          var partner = -1
          if (verticalPair.lock.getAttribute('aria-pressed') === 'true' && (slot === 0 || slot === 1)) {
            partner = slot === 0 ? 1 : 0
          }
          if (horizontalPair.lock.getAttribute('aria-pressed') === 'true' && (slot === 2 || slot === 3)) {
            partner = slot === 2 ? 3 : 2
          }
          if (partner !== -1) values[partner] = values[slot]
          paint()
          write()
        })
      }
    }
    bind(inputs)
    bind(minis)

    function toggleLock(target) {
      var next = target.lock.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'
      target.lock.setAttribute('aria-pressed', next)
      target.lock.className = next === 'true' ? 'sideLock on' : 'sideLock'
      if (next === 'true') {
        values[target.to] = values[target.from]
        paint()
        write()
      }
    }
    verticalPair.lock.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      toggleLock(verticalPair)
    })
    horizontalPair.lock.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      toggleLock(horizontalPair)
    })

    head.addEventListener('click', function () {
      group.className = group.className.indexOf('closed') === -1 ? 'sidesGroup closed' : 'sidesGroup'
    })

    var line = document.createElement('div')
    line.className = 'sidesLine'
    line.appendChild(head)
    line.appendChild(collapsed)

    group.appendChild(line)
    group.appendChild(body)
    group._ctl = inputs[0]
    return group
  }

  function textField(mark, label) {
    var el = mark.el
    var form = !!FORM_TAGS[String(el.tagName || '').toLowerCase()]
    var hasChildren = el.children.length > 0
    var seed = form
      ? String(el.value == null ? '' : el.value)
      : hasChildren
        ? ''
        : String(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200)
    var input = makeInput('text', seed)
    if (hasChildren && !form) {
      input.disabled = true
      input.placeholder = '含子元素，请在源码里改'
      input.title = '这个元素里还有子元素，直接改文本会拆掉结构'
    }
    input.addEventListener('input', function () {
      if (hasChildren && !form) return
      var raw = input.value
      if (form) el.value = raw
      else el.textContent = raw
      // Clearing the copy is a real edit ("把这句话删掉"), so it must survive as an adjustment even
      // though the value is empty. Only a return to the original wording drops the key again.
      if (typeof mark.originText === 'string' && raw === mark.originText) delete mark.adjustments[label]
      else mark.adjustments[label] = raw
      syncSaveButton()
      layout()
    })
    var wrap = row(label, input)
    wrap._ctl = input
    attachUndo(wrap, mark, label, function () {
      input.value = seed
      if (hasChildren && !form) return
      if (form) el.value = seed
      else el.textContent = seed
      delete mark.adjustments[label]
    })
    return wrap
  }

  function selectField(mark, label, prop, computedValue, options, unitText, narrow) {
    var current = String(computedValue || '').trim()
    var items = []
    var known = false
    for (var i = 0; i < options.length; i += 1) {
      items.push({ value: options[i][0], label: options[i][1] + (unitText ? ' ' + unitText(options[i][0]) : '') })
      if (options[i][0] === current) known = true
    }
    if (!known && current) items.push({ value: current, label: '当前（' + current + '）' })

    var trigger = document.createElement('button')
    trigger.type = 'button'
    trigger.className = 'inp pick'
    var text = document.createElement('span')
    text.className = 'pick-text'
    var caret = document.createElement('span')
    caret.className = 'pick-caret'
    caret.appendChild(icon([{ d: 'M7 10l5 5 5-5' }], { width: '2' }))
    trigger.appendChild(text)
    trigger.appendChild(caret)

    var chosen = current || options[0][0] || ''
    function labelOf(value) {
      for (var j = 0; j < items.length; j += 1) if (items[j].value === value) return items[j].label
      return value || '默认'
    }
    function paint() { text.textContent = labelOf(chosen) }
    paint()

    function commit(next) {
      chosen = next
      paint()
      if (!next) {
        writeStyle(mark, prop, '')
        delete mark.adjustments[label]
      } else {
        writeStyle(mark, prop, next)
        mark.adjustments[label] = next
      }
      layout()
    }

    trigger.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      openMenu(trigger, items, chosen, commit)
    })

    var ctl = document.createElement('div')
    ctl.className = narrow ? 'ctl short pickShort' : 'ctl'
    ctl.appendChild(trigger)
    var wrap = row(label, ctl)
    wrap._ctl = trigger
    attachUndo(wrap, mark, label, function () {
      chosen = current || options[0][0] || ''
      paint()
      writeStyle(mark, prop, '')
      delete mark.adjustments[label]
    })
    return wrap
  }

  function opacityField(mark, label, prop, computedValue) {
    var input = makeInput('number', Math.round(pxOf(computedValue) * 100) / 100, { step: '0.05', min: '0', max: '1' })
    input.addEventListener('input', function () {
      var raw = input.value.trim()
      if (raw === '') {
        writeStyle(mark, prop, '')
        delete mark.adjustments[label]
      } else {
        var next = String(Math.max(0, Math.min(1, parseFloat(raw))))
        writeStyle(mark, prop, next)
        mark.adjustments[label] = next
      }
      layout()
    })
    var ctl = document.createElement('div')
    ctl.className = 'ctl short'
    ctl.appendChild(input)
    var wrap = row(label, ctl)
    wrap._ctl = input
    var original = Math.round(pxOf(computedValue))
    attachUndo(wrap, mark, label, function () {
      input.value = String(original)
      writeStyle(mark, prop, '')
      if (opts && opts.solid) writeStyle(mark, 'borderStyle', '')
      delete mark.adjustments[label]
    })
    return wrap
  }

  function radiusField(mark, label, prop, computedValue) {
    var first = String(computedValue || '').trim().split(/\s+/)[0] || '0px'
    return lengthField(mark, label, prop, first)
  }

  /** Elements whose content is not text: nothing in the type panel can be edited. */
  var MEDIA_TAGS = { img: 1, svg: 1, canvas: 1, video: 1, picture: 1, iframe: 1, embed: 1, object: 1 }
  // 表单控件的文字住在 value 里，读 textContent 永远是空 —— textarea 那种「有字却改不了」就是这么来的。
  var FORM_TAGS = { input: 1, textarea: 1 }
  /** Tags that read as a run of type even before the DOM is asked. */
  var TEXT_TAGS = {
    h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1, p: 1, span: 1, a: 1, li: 1, dt: 1, dd: 1,
    strong: 1, em: 1, b: 1, i: 1, u: 1, s: 1, small: 1, mark: 1, label: 1, button: 1,
    td: 1, th: 1, caption: 1, blockquote: 1, figcaption: 1, code: 1, pre: 1, time: 1,
  }

  /**
   * What this element can honestly be edited as.
   *
   * A picture has no copy, so offering 文本 / 文本颜色 / 字号 there is noise the user has to skip
   * past every time; a container that only holds other nodes has no text of its own either. The
   * panel shows the box fields everywhere and narrows the type ones to elements that carry text.
   */
  function elementProfile(el) {
    var tag = String((el && el.tagName) || '').toLowerCase()
    var media = !!MEDIA_TAGS[tag]
    var form = !!FORM_TAGS[tag]
    var hasChildren = !!(el && el.children && el.children.length > 0)
    // 表单控件的文字在 value 里，不在 textContent 里 —— 少了这一步，textarea 永远被判成「没有文字」。
    var content = form
      ? String((el && el.value) == null ? '' : el.value).trim()
      : String((el && el.textContent) || '').trim()
    var hasText = content !== ''
    return {
      media: media,
      form: form,
      // 文本：表单控件改 value；普通元素只给「自己就是一段文字」的（无子元素、有字）
      text: form ? !media : !media && !hasChildren && hasText,
      // 字体类：媒体元素不给；有字的容器（如 p 里套 span）仍可整体调字体
      type: !media && (form || hasText || !!TEXT_TAGS[tag]),
    }
  }

  function renderFields(mark) {
    var computed = window.getComputedStyle(mark.el)
    var profile = elementProfile(mark.el)
    while (panelScroll.firstChild) panelScroll.removeChild(panelScroll.firstChild)
    var groups = []
    function group() {
      var list = []
      groups.push(list)
      return list
    }
    var gText = group()
    if (profile.text) gText.push(textField(mark, '文本'))
    var gPaint = group()
    if (profile.type) gPaint.push(colorField(mark, '文本颜色', 'color', computed.color))
    gPaint.push(colorField(mark, '背景', 'backgroundColor', computed.backgroundColor))
    gPaint.push(opacityField(mark, 'Opacity', 'opacity', computed.opacity))
    var gType = group()
    if (profile.type) {
      gType.push(selectField(mark, '字体', 'fontFamily', computed.fontFamily, FONTS))
      gType.push(lengthField(mark, '字号', 'fontSize', computed.fontSize))
      gType.push(selectField(mark, '字重', 'fontWeight', computed.fontWeight, WEIGHTS, null, true))
    }
    var gEdge = group()
    gEdge.push(radiusField(mark, '边框圆角', 'borderRadius', computed.borderRadius))
    gEdge.push(colorField(mark, '边框颜色', 'borderColor', computed.borderTopColor))
    gEdge.push(lengthField(mark, '边框宽度', 'borderWidth', computed.borderTopWidth, { solid: true }))
    var gBox = group()
    gBox.push(lengthField(mark, '宽度', 'width', computed.width))
    gBox.push(lengthField(mark, '高度', 'height', computed.height))
    gBox.push(sidesField(mark, '内边距', 'padding', computed.padding))
    gBox.push(sidesField(mark, '外边距', 'margin', computed.margin, true))
    var fields = []
    for (var gi = 0; gi < groups.length; gi += 1) {
      for (var fi = 0; fi < groups[gi].length; fi += 1) {
        var node = groups[gi][fi]
        // One hairline per section: 文本 | 颜色 | 字体 | 边框 | 盒子
        if (fi === 0 && fields.length > 0) node.className = node.className + ' sep'
        fields.push(node)
      }
    }
    for (var i = 0; i < fields.length; i += 1) panelScroll.appendChild(fields[i])
    return fields
  }

  // ---------------------------------------------------------------- marks

  function renumber() {
    for (var i = 0; i < marks.length; i += 1) {
      marks[i].order = i + 1
      marks[i].marker.textContent = String(i + 1)
      marks[i].marker.title = '第 ' + (i + 1) + ' 处' + (marks[i].saved ? '（已保存）' : '')
    }
    if (activeMark) {
      panelNum.textContent = String(activeMark.order)
    }
  }

  /** Pins are display-only: one colour, never clickable, saved or not. */
  function setSaved(mark, on) {
    if (!mark) return
    mark.saved = !!on
    // Saving is what publishes this annotation to the composer; reopening it for edits does not
    // take the row away again, so only ever set the flag, never clear it here.
    if (on) mark.committed = true
    if (!mark.marker) return
    mark.marker.className = 'mark'
    mark.marker.title = '第 ' + mark.order + ' 处' + (on ? '（已保存）' : '')
  }

  function addMark(el) {
    for (var i = 0; i < marks.length; i += 1) {
      if (marks[i].el === el) {
        openEditor(marks[i])
        return marks[i]
      }
    }
    var mark = {
      el: el,
      order: marks.length + 1,
      comment: '',
      adjustments: {},
      baseline: el.getAttribute('style') || '',
      origin: el.getAttribute('style') || '',
      panelBaseline: '',
      // The wording this element had before anyone touched it: the only copy worth restoring to,
      // so it is captured once when the pin is created and never re-read afterwards.
      originText: originalCopy(el),
    }
    var marker = document.createElement('div')
    marker.className = 'mark'
    marker.textContent = String(mark.order)
    marker.title = '第 ' + mark.order + ' 处'
    mark.marker = marker
    pins.appendChild(marker)
    marks.push(mark)
    renumber()
    openEditor(mark)
    layout()
    maybeSyncDrafts()
    return mark
  }

  function openEditor(mark) {
    // Keep whatever was half-typed on the previous pin instead of dropping it.
    if (activeMark && activeMark !== mark && bubble.style.display !== 'none') {
      activeMark.comment = commentInput.value.replace(/\s+$/, '')
    }
    activeMark = mark
    setSaved(mark, false)
    panelOpen = false
    panel.style.display = 'none'
    bubble.style.display = 'flex'
    commentInput.value = mark.comment
    syncSaveButton()
    positionBubble(mark)
    paint(mark.el)
    try { commentInput.focus() } catch (error) { /* focus is best effort */ }
    try { commentInput.setSelectionRange(mark.comment.length, mark.comment.length) } catch (error) { /* ignore */ }
  }

  /* 点保存前的样式改动只是预览：再次点标号收起面板时把它们退回去。 */
  function restorePreview(mark) {
    if (!mark || mark.committed === true) return
    if (!mark.adjustments || !Object.keys(mark.adjustments).length) return
    /* Every preview lives in our own stylesheet now, so folding is just "drop the rules". */
    dropRules(mark)
    mark.originInline = {}
    mark.adjustments = {}
    mark.touched = false
  }

  function closeEditor() {
    suppressOutline = false
    activeMark = null
    panelOpen = false
    bubble.style.display = 'none'
    panel.style.display = 'none'
    paint(null)
  }

  function commitComment(mark) {
    mark.comment = commentInput.value.replace(/\s+$/, '')
    panelComment.value = mark.comment
    setSaved(mark, !isEmptyMark(mark))
    syncSaveButton()
    closeEditor()
    // ✓ publishes the annotation, so the composer picks it up right now.
    maybeSyncDrafts()
  }

  /**
   * Confirming only makes sense for a touched annotation: the ✓ and 保存 stay grey/hidden
   * while nothing has been written or restyled, and light up again whenever you reopen a
   * pin that already carries a comment or a style change.
   */
  function syncSaveButton() {
    var dirty = !!activeMark && (activeMark.touched === true || !isEmptyMark(activeMark))
    savePanelButton.style.display = dirty ? '' : 'none'
    okButton.className = 'ok' + (dirty ? ' ready' : '')
    okButton.disabled = !dirty
    okButton.style.cursor = dirty ? 'pointer' : 'default'
  }

  function openPanel(mark) {
    if (!mark) return
    activeMark = mark
    panelOpen = true
    // A freshly opened panel is not "edited yet": the comment and the adjustments it shows are
    // whatever this pin already carried, so 保存 only appears once you actually change something.
    mark.touched = false
    bubble.style.display = 'none'
    mark.panelBaseline = mark.el.getAttribute('style') || ''
    panelNum.textContent = String(mark.order)
    panelTag.textContent = mark.el.tagName.toLowerCase() + ' · ' + selectorFor(mark.el)
    panelComment.value = mark.comment || ''
    renderFields(mark)
    panel.style.display = 'flex'
    panel.style.visibility = 'hidden'
    positionPanel(mark)
    panel.style.visibility = 'visible'
    paint(mark.el)
    syncSaveButton()
    layout()
  }

  function savePanel(mark) {
    if (!mark) return
    // Nothing written and nothing restyled: there is no annotation to publish, so the composer
    // would get no chip. Say so instead of silently closing on an empty save.
    if (isEmptyMark(mark)) {
      toast('这一处还没有内容：写句注释或调个样式再保存')
      return
    }
    // 保存 already is the confirmation: keep the look, close both the panel and the pill.
    mark.baseline = mark.el.getAttribute('style') || ''
    panelOpen = false
    panel.style.display = 'none'
    setSaved(mark, true)
    closeEditor()
    maybeSyncDrafts()
    toast('已保存这一处（继续点下一个元素）')
  }

  function cancelPanel(mark) {
    if (!mark) return
    // 取消 means "throw this draft away": styles go back to the pick, the pin disappears
    // and the remaining pins close ranks — nothing half-done is left behind.
    removeMark(mark)
    toast('已丢弃这一处批注')
  }

  /**
   * The element's own copy, before we touch it. `null` means "this element is not a run of text"
   * (it holds children), so there is nothing to restore.
   */
  function originalCopy(el) {
    if (!el) return null
    var tag = String(el.tagName || '').toLowerCase()
    if (FORM_TAGS[tag]) return String(el.value == null ? '' : el.value)
    return el.children.length ? null : String(el.textContent || '')
  }

  /**
   * Undo a text edit. The panel writes straight into the live element, so dropping the pin has to
   * put the original wording back — otherwise "cancel" leaves the page permanently mutilated.
   */
  function restoreText(mark) {
    if (!mark || typeof mark.originText !== 'string') return
    var el = mark.el
    var form = !!FORM_TAGS[String(el.tagName || '').toLowerCase()]
    if (form) {
      if (String(el.value == null ? '' : el.value) !== mark.originText) el.value = mark.originText
      return
    }
    if (el.textContent === mark.originText) return
    el.textContent = mark.originText
  }

  function removeMark(mark) {
    if (!mark) return
    dropDraft(mark)
    restoreText(mark)
    dropRules(mark)
    if (mark.origin) mark.el.setAttribute('style', mark.origin)
    else mark.el.removeAttribute('style')
    if (mark.marker.parentNode) mark.marker.parentNode.removeChild(mark.marker)
    var index = marks.indexOf(mark)
    if (index !== -1) marks.splice(index, 1)
    if (activeMark === mark) closeEditor()
    renumber()
    layout()
  }

  function findElement(command) {
    if (!command) return null
    if (command.ref && sent[command.ref] && sent[command.ref].el && sent[command.ref].el.isConnected) {
      return sent[command.ref].el
    }
    if (command.ref) {
      for (var i = 0; i < marks.length; i += 1) {
        if (marks[i].ref === command.ref || 'draft-' + marks[i].draftId === command.ref) return marks[i].el
      }
    }
    if (command.selector) {
      try { return document.querySelector(command.selector) } catch (error) { return null }
    }
    return null
  }

  /** Commands come from the right sidebar: keep a comment in sync, or open one's panel. */
  function applyCommand(command) {
    if (!command || !command.type) return
    if (command.type === 'comment') {
      if (command.ref && sent[command.ref]) sent[command.ref].comment = command.text || ''
      for (var i = 0; i < marks.length; i += 1) {
        if (!command.ref) continue
        if (marks[i].ref !== command.ref && 'draft-' + marks[i].draftId !== command.ref) continue
        marks[i].comment = command.text || ''
        if (activeMark === marks[i]) {
          commentInput.value = marks[i].comment
          panelComment.value = marks[i].comment
        }
      }
      return
    }
    if (command.type === 'delete') {
      // 右栏某条 chip 上点了 ×：只撤这一处。标号连同它预览过的样式一起还原，
      // 其余标号重新编号，草稿也跟着撤掉。
      for (var d = 0; d < marks.length; d += 1) {
        var victim = marks[d]
        var sameRef = command.ref && victim.ref === command.ref
        var sameDraft = command.ref && victim.draftId && 'draft-' + victim.draftId === command.ref
        if (!sameRef && !sameDraft) continue
        removeMark(victim)
        return
      }
      return
    }
    if (command.type === 'cancel') {
      // 右栏点了 ×：这一轮整体作废。标记、批注、预览过的样式全部还原，
      // 页面回到用户没动过之前的样子。
      var droppedMarks = marks.length
      dropAllDrafts()
      clearMarks(false)
      // 没标号可撤就别弹提示：右栏已经直接清过一次，命令随后才会到。
      if (droppedMarks > 0) toast('已取消这次改动')
      return
    }
    if (command.type === 'focus') {
      var el = findElement(command)
      if (!el) {
        toast('页面上找不到这个元素了', true)
        return
      }
      var mark = null
      for (var j = 0; j < marks.length; j += 1) if (marks[j].el === el) mark = marks[j]
      if (!mark) mark = addMark(el)
      if (command.ref && !mark.ref) mark.ref = command.ref
      openPanel(mark)
    }
  }

  function pollCommands() {
    if (!active || hostMode) return
    fetch(API + '/commands?since=' + pollSince, { cache: 'no-store' })
      .then(function (response) { return response.json() })
      .then(function (data) {
        var list = (data && data.commands) || []
        for (var i = 0; i < list.length; i += 1) {
          pollSince = Math.max(pollSince, Number(list[i].id) || 0)
          applyCommand(list[i])
        }
      })
      .catch(function () { /* the host may be restarting */ })
  }

  function clearMarks(keepStyles) {    for (var i = 0; i < marks.length; i += 1) {
      var mark = marks[i]
      restoreText(mark)
      if (!keepStyles) {
        dropRules(mark)
        if (mark.origin) mark.el.setAttribute('style', mark.origin)
        else mark.el.removeAttribute('style')
      } else if (mark.origin !== (mark.el.getAttribute('style') || '')) {
        // The preview stays on screen after sending, but the page belongs to the user: destroy restores it.
        kept.push({ el: mark.el, baseline: mark.origin })
      }
      if (mark.marker.parentNode) mark.marker.parentNode.removeChild(mark.marker)
    }
    marks = []
    closeEditor()
    paint(null)
  }

  // ---------------------------------------------------------------- live drafts

  var draftSeq = 0
  var draftTimer = null
  var draftSignature = ''
  var warnedDraft = false
  // Draft ids are the host's row keys, so they must be unique across page loads and across
  // tabs: a recycled "d1" from a previous round collided with a spent row and the new chip
  // never showed up. A per-instance token fixes that.
  var draftToken = 'p' + Math.random().toString(36).slice(2, 7)

  function ensureDraftIds() {
    for (var i = 0; i < marks.length; i += 1) {
      if (!marks[i].draftId) {
        draftSeq += 1
        marks[i].draftId = draftToken + '-' + draftSeq
      }
    }
  }

  /** Which conversation is asking. The host writes this in before injecting the picker. */
  function sessionNow() {
    try {
      return String(window.__DSH_ELEMENT_REF_SESSION__ || '')
    } catch (error) {
      return ''
    }
  }

  /** One row per pin, so the composer can list the annotations while they are still drafted. */
  function draftPayload(mark) {
    var el = mark.el
    var tag = String(el.tagName || '').toLowerCase()
    // 输入框里的字在 value 里；textContent 是空的，模型会以为这一处没有文字。
    var copy = FORM_TAGS[tag]
      ? String(el.value == null ? '' : el.value)
      : String(el.textContent || '')
    return {
      draftId: mark.draftId,
      order: mark.order,
      page: location.href,
      pageTitle: document.title,
      selector: selectorFor(el),
      tag: tag,
      text: copy.replace(/\s+/g, ' ').trim().slice(0, 240),
      source: sourceHint(el),
      comment: mark.comment || '',
      adjustments: mark.adjustments,
      // The chip only shows up in the conversation the pick happened in.
      session: sessionNow(),
    }
  }

  function postDraft(body) {
    queue({ kind: 'draft', body: body })
    return null
  }

  /** Only used when the picker runs outside DSH (plain browser). */
  function directDraft(body) {
    return fetch(API + '/draft', {
      method: 'POST',
      mode: 'cors',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(body),
    }).then(function (response) {
      if (!response.ok && !warnedDraft) {
        warnedDraft = true
        toast('右栏没收到这条批注（' + response.status + '）', true)
      } else if (response.ok) {
        warnedDraft = false
      }
    }).catch(function () {
      if (!warnedDraft) {
        warnedDraft = true
        toast('连不上 DSH（批注只留在这个页面里）', true)
      }
    })
  }

  function directCollect(descriptor) {
    return fetch(API + '/collect', {
      method: 'POST',
      mode: 'cors',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(descriptor),
    }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status)
      return response.json()
    })
  }

  function flushDrafts() {
    draftTimer = null
    for (var i = 0; i < marks.length; i += 1) {
      var mark = marks[i]
      // The composer only lists annotations the user has actually saved: picking, typing and
      // restyling stay local until 保存/✓ says "this one is done".
      if (!mark.committed || isEmptyMark(mark)) {
        if (mark.posted) {
          mark.posted = false
          postDraft({ draftId: mark.draftId, remove: true })
        }
        continue
      }
      mark.posted = true
      postDraft(draftPayload(mark))
    }
  }

  /** Debounced: the composer should follow the page, not every keystroke. */
  function syncDrafts() {
    if (draftTimer) clearTimeout(draftTimer)
    draftTimer = setTimeout(flushDrafts, 300)
  }

  function signatureOf() {
    var parts = []
    for (var i = 0; i < marks.length; i += 1) {
      parts.push(
        marks[i].draftId + '|' + marks[i].order + '|' + (marks[i].comment || '') +
        '|' + JSON.stringify(marks[i].adjustments) + '|' + (marks[i].committed ? '1' : '0'),
      )
    }
    return parts.join(';')
  }

  /** Called from layout() and the pick paths: only talk to the host when something changed. */
  function maybeSyncDrafts() {
    ensureDraftIds()
    var next = signatureOf()
    if (next === draftSignature) return
    draftSignature = next
    syncDrafts()
  }

  function dropDraft(mark) {
    if (!mark || !mark.draftId) return
    draftSignature = ''
    mark.posted = false
    postDraft({ draftId: mark.draftId, remove: true })
  }

  function dropAllDrafts() {
    for (var i = 0; i < marks.length; i += 1) {
      if (marks[i].draftId) postDraft({ draftId: marks[i].draftId, remove: true })
      marks[i].posted = false
    }
    draftSignature = ''
  }

  // ---------------------------------------------------------------- layout

  function positionBubble(mark) {
    if (!mark) return
    var rect = mark.el.getBoundingClientRect()
    var width = bubble.offsetWidth || 380
    var height = bubble.offsetHeight || 44
    var left = clamp(rect.left, 8, Math.max(8, window.innerWidth - width - 8))
    // Sit right under the element it belongs to; hop above it only when the viewport runs out.
    var top = rect.bottom + 6
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 6)
    bubble.style.left = left + 'px'
    bubble.style.top = top + 'px'
  }

  function positionPanel(mark) {
    if (!mark) return
    var width = panel.offsetWidth || 300
    var height = panel.offsetHeight || 380
    if (panelPos) {
      panel.style.left = clamp(panelPos.left, 8, Math.max(8, window.innerWidth - width - 8)) + 'px'
      panel.style.top = clamp(panelPos.top, 8, Math.max(8, window.innerHeight - height - 8)) + 'px'
      return
    }
    // Same anchoring rule as the pill: attached to the element, not floating somewhere nearby.
    var rect = mark.el.getBoundingClientRect()
    var left = clamp(rect.left, 8, Math.max(8, window.innerWidth - width - 8))
    var top = rect.bottom + 10
    if (top + height > window.innerHeight - 8) top = rect.top - height - 10
    top = clamp(top, 8, Math.max(8, window.innerHeight - height - 8))
    panel.style.left = left + 'px'
    panel.style.top = top + 'px'
  }

  function layout() {
    /* Whether the save button is offered depends only on the annotation, not on whether the
       picker is still armed — editing a text value while the panel is open must reveal it. */
    syncSaveButton()
    /* Undo buttons follow the same rule: shown once that field has a value of its own. */
    if (activeMark) refreshUndo(activeMark)
    if (!active) return
    for (var i = 0; i < marks.length; i += 1) {
      var mark = marks[i]
      if (!mark.el.isConnected) {
        mark.marker.style.display = 'none'
        continue
      }
      var rect = mark.el.getBoundingClientRect()
      var stacked = 0
      for (var j = 0; j < i; j += 1) if (marks[j].el === mark.el) stacked += 1
      var left = clamp(rect.left - 11 + stacked * 24, 2, Math.max(2, window.innerWidth - 24))
      var top = clamp(rect.top - 11, 2, Math.max(2, window.innerHeight - 24))
      mark.marker.style.left = left + 'px'
      mark.marker.style.top = top + 'px'
      mark.marker.style.display = 'grid'
      // A pin whose element collapsed (its text was cleared, so it has no box left) becomes the
      // only handle on that element: let it take clicks, so the panel can be reopened.
      var openable = rect.width < 2 || rect.height < 2
      mark.marker.className = openable ? 'mark reopen' : 'mark'
      mark.marker.title = openable
        ? '第 ' + mark.order + ' 处（元素已无可见内容，点这里继续编辑）'
        : '第 ' + mark.order + ' 处'
    }
    if (activeMark) {
      paint(activeMark.el)
      if (panelOpen) positionPanel(activeMark)
      else positionBubble(activeMark)
    } else if (hovered) {
      paint(hovered)
    }
    maybeSyncDrafts()
  }

  // ---------------------------------------------------------------- events

  function onPointerDown(event) {
    if (inOverlay(event)) return
    event.preventDefault()
    event.stopPropagation()
  }

  function onMouseMove(event) {
    if (inOverlay(event)) return
    var target = document.elementFromPoint(event.clientX, event.clientY)
    if (!target || target === host) {
      hovered = null
      if (!activeMark) paint(null)
      return
    }
    hovered = target
    if (!activeMark) paint(target)
  }

  function isEmptyMark(mark) {
    return !!mark && !mark.comment && Object.keys(mark.adjustments).length === 0
  }

  function retarget(mark, el) {
    // An untouched pin is just a placeholder: it follows the next click instead of piling up.
    mark.el = el
    mark.origin = el.getAttribute('style') || ''
    mark.baseline = mark.origin
    mark.panelBaseline = ''
    mark.originText = originalCopy(el)
    mark.seed = null
    mark.adjustments = {}
    mark.comment = ''
    mark.committed = false
    commentInput.value = ''
    okButton.className = 'ok'
    okButton.disabled = true
    okButton.style.cursor = 'default'
    setSaved(mark, false)
    layout()
    openEditor(mark)
    maybeSyncDrafts()
  }

  /** The badge that was clicked, if any: emptied elements can only be reopened through it. */
  function badgeMark(event) {
    var path = []
    if (typeof event.composedPath === 'function') path = event.composedPath()
    else if (event.target) path = [event.target]
    for (var i = 0; i < path.length; i += 1) {
      var node = path[i]
      if (!node || node.nodeType !== 1) continue
      if (String(node.className || '').indexOf('mark') === -1) continue
      for (var j = 0; j < marks.length; j += 1) {
        if (marks[j].marker === node) return marks[j]
      }
    }
    return null
  }

  function onClick(event) {
    var badge = badgeMark(event)
    if (badge) {
      event.preventDefault()
      event.stopPropagation()
      // Same badge again = fold the panel away; another one = switch to it.
      if (panelOpen && activeMark === badge) {
        restorePreview(badge)
        closeEditor()
        return
      }
      if (activeMark && activeMark !== badge) restorePreview(activeMark)
      openEditor(badge)
      return
    }
    if (inOverlay(event)) return
    event.preventDefault()
    event.stopPropagation()
    var target = pickTarget(event)
    if (!target) return

    for (var i = 0; i < marks.length; i += 1) {
      if (marks[i].el === target) {
        // Clicking the very same element again (nothing written, nothing changed) = cancel it.
        if (isEmptyMark(marks[i]) && !commentInput.value.trim()) {
          removeMark(marks[i])
          toast('已取消这一处批注')
          return
        }
        openEditor(marks[i])
        return
      }
    }

    if (panelOpen) {
      toast('先保存或取消这一处的调节，再加下一个')
      return
    }

    if (activeMark && bubble.style.display !== 'none') {
      var typed = commentInput.value.trim()
      if (typed || activeMark.comment || Object.keys(activeMark.adjustments).length > 0) {
        toast('先点 ✓ 确认这一处，再加下一个')
        return
      }
      retarget(activeMark, target)
      return
    }

    var blank = null
    for (var j = 0; j < marks.length; j += 1) if (isEmptyMark(marks[j])) blank = marks[j]
    if (blank) {
      retarget(blank, target)
      return
    }

    addMark(target)
  }

  /**
   * Events from inside our Shadow DOM arrive retargeted at the host, so `event.target` is the host
   * element — never the field itself. Reading the composed path is the only way to tell which
   * input actually has focus.
   */
  function inNode(node, event) {
    if (!node || !event) return false
    if (event.target === node) return true
    var path = typeof event.composedPath === 'function' ? event.composedPath() : null
    if (path) for (var i = 0; i < path.length; i += 1) if (path[i] === node) return true
    return false
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (panelOpen && activeMark) savePanel(activeMark)
      else if (activeMark) commitComment(activeMark)
      else destroy()
      return
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !panelOpen && activeMark && inNode(commentInput, event)) {
      event.preventDefault()
      event.stopPropagation()
      commitComment(activeMark)
      return
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && panelOpen && activeMark) {
      event.preventDefault()
      event.stopPropagation()
      savePanel(activeMark)
    }
  }

  function onScroll() {
    layout()
  }

  commentInput.addEventListener('input', function () {
    if (activeMark && bubble.style.display !== 'none') {
      activeMark.comment = commentInput.value.replace(/\s+$/, '')
      maybeSyncDrafts()
    }
    syncSaveButton()
  })
  panelComment.addEventListener('input', function () {
    if (!activeMark) return
    // Same field, two places: the panel and the pill stay in step.
    activeMark.comment = panelComment.value.replace(/\s+$/, '')
    commentInput.value = panelComment.value
    maybeSyncDrafts()
    syncSaveButton()
  })

  // Drag the panel by its frame; inputs keep their own cursor and never start a drag.
  var dragOrigin = null

  function onPanelDown(event) {
    if (!panelOpen || !inOverlay(event)) return
    var tag = event.target && event.target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return
    var box = panel.getBoundingClientRect()
    dragOrigin = { x: event.clientX, y: event.clientY, left: box.left, top: box.top }
    panel.classList.add('dragging')
    event.preventDefault()
  }

  function onDragMove(event) {
    if (!dragOrigin) return
    var width = panel.offsetWidth || 300
    var height = panel.offsetHeight || 380
    panelPos = {
      left: clamp(dragOrigin.left + event.clientX - dragOrigin.x, 8, Math.max(8, window.innerWidth - width - 8)),
      top: clamp(dragOrigin.top + event.clientY - dragOrigin.y, 8, Math.max(8, window.innerHeight - height - 8)),
    }
    positionPanel(activeMark)
  }

  function onDragUp() {
    if (!dragOrigin) return
    dragOrigin = null
    panel.classList.remove('dragging')
  }

  panel.addEventListener('pointerdown', onPanelDown)
  okButton.addEventListener('click', function (event) {
    event.preventDefault()
    event.stopPropagation()
    if (activeMark && !isEmptyMark(activeMark)) commitComment(activeMark)
  })
  tweakButton.addEventListener('click', function (event) {
    event.preventDefault()
    event.stopPropagation()
    if (activeMark) openPanel(activeMark)
  })
  cancelPanelButton.addEventListener('click', function (event) {
    event.preventDefault()
    event.stopPropagation()
    if (activeMark) cancelPanel(activeMark)
  })
  savePanelButton.addEventListener('click', function (event) {
    event.preventDefault()
    event.stopPropagation()
    if (activeMark) savePanel(activeMark)
  })

  /**
   * Leave picking mode. Must be safe to call twice and must never stop halfway: it used to set
   * `active = false` first and then do the cleanup, so one throw left a picker that kept
   * highlighting while every later destroy() returned early — the page looked impossible to stop.
   */
  function destroy() {
    if (!active && !host.parentNode && !window[KEY]) return
    active = false
    var safe = function (step) { try { step() } catch (error) { /* one bad step must not stop the rest */ } }
    // Closing the picker withdraws whatever was still being drafted.
    safe(dropAllDrafts)
    safe(function () { if (draftTimer) clearTimeout(draftTimer) })
    safe(function () { window.removeEventListener('pointerdown', onPointerDown, true) })
    safe(function () { window.removeEventListener('mousemove', onMouseMove, true) })
    safe(function () { window.removeEventListener('pointermove', onDragMove, true) })
    safe(function () { window.removeEventListener('pointerup', onDragUp, true) })
    safe(function () { window.removeEventListener('click', onClick, true) })
    safe(function () { window.removeEventListener('keydown', onKeyDown, true) })
    safe(function () { window.removeEventListener('scroll', onScroll, true) })
    safe(function () { if (layoutTimer) clearInterval(layoutTimer) })
    safe(function () { if (pollTimer) clearInterval(pollTimer) })
    safe(function () { clearMarks(false) })
    safe(function () {
      for (var i = 0; i < kept.length; i += 1) {
        if (!kept[i].el.isConnected) continue
        if (kept[i].baseline) kept[i].el.setAttribute('style', kept[i].baseline)
        else kept[i].el.removeAttribute('style')
      }
      kept = []
    })
    safe(function () { if (host.parentNode) host.parentNode.removeChild(host) })
    safe(function () { if (window[KEY]) delete window[KEY] })
    safe(function () { console.log('[dsh-element-ref] picker closed') })
  }

  /* Any keystroke in any field counts as "touched": the save button has to appear even when the
     value ends up identical, or when that field keeps its value somewhere other than
     adjustments. One capture listener on the scrolling body covers every field type. */
  panelScroll.addEventListener('input', function (event) {
    if (!activeMark) return
    // A disabled field (文本 for elements that have children) cannot change anything: typing in it
    // must not pretend the annotation was edited, or 保存 would open a door to an empty save.
    if (event && event.target && event.target.disabled) return
    activeMark.touched = true
    syncSaveButton()
  }, true)

  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('mousemove', onMouseMove, true)
  window.addEventListener('pointermove', onDragMove, true)
  window.addEventListener('pointerup', onDragUp, true)
  window.addEventListener('click', onClick, true)
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('scroll', onScroll, true)

  layoutTimer = setInterval(layout, 300)
  pollTimer = setInterval(pollCommands, 900)
  pollCommands()
  /** The host renderer calls this right after injecting: no direct network from the page. */
  function useHost(flag) {
    hostMode = flag !== false
    if (hostMode) lastHostCall = Date.now()
    if (hostMode && flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    return hostMode
  }

  /**
   * Stay only while the sidebar keeps talking to us.
   *
   * The sidebar can reload (hot update, reopening the panel) and leave this script running with
   * nothing on the other end — the page then highlights elements for a session that no longer
   * exists, which reads as "picking switched itself on". The host pings on every bridge tick, so
   * a few seconds of silence is proof nobody is listening: pack up.
   */
  var lastHostCall = Date.now()
  var orphanTimer = setInterval(function () {
    if (!active) return
    if (Date.now() - lastHostCall < ORPHAN_MS) return
    try { destroy() } catch (error) { /* already gone */ }
  }, 1500)
  if (orphanTimer && typeof orphanTimer.unref === 'function') orphanTimer.unref()

  /** Host pulls the queue (a JSON string, so it survives executeJavaScript). */
  function drainPublic() {
    return drain()
  }

  /** Host pushes sidebar commands in (also JSON). */
  function applyCommands(json) {
    var list = []
    try { list = JSON.parse(json) } catch (error) { return 0 }
    if (!list || !list.length) return 0
    for (var i = 0; i < list.length; i += 1) {
      pollSince = Math.max(pollSince, Number(list[i].id) || 0)
      applyCommand(list[i])
    }
    return list.length
  }

  /**
   * Sidebar's ✕ / a finished send: throw the whole round away — pins, previews and drafts.
   * Clearing ends the round, so the picker also stands down: nothing stays highlighted, and
   * picking resumes only when the address-row button is pressed again.
   */
  function clearAllPublic() {
    var dropped = marks.length
    dropAllDrafts()
    clearMarks(false)
    if (!marks.length) standDown()
    return dropped
  }

  /**
   * Leave picking mode from the inside. The host may not know which frame holds the picker, so
   * a finished round has to be able to end itself here instead of waiting to be told.
   */
  function standDown() {
    try {
      destroy()
    } catch (error) {
      /* leaving is best effort; a reload always wins */
    }
  }

  /**
   * Where a pin's element sits on screen right now, in viewport pixels. The host needs this to
   * crop a screenshot of it: an <img>/<svg>/<canvas> carries no pixels of its own in the markup
   * we send, so the only honest way to show the model what it looks like is to photograph it.
   */
  /**
   * Which pin a host row means. The row's ref is minted by the host (`draft-<id>` while the note is
   * still being written), so an exact match is not enough: the draft id and the selector are the
   * other two names the same element travels under.
   */
  function markFor(ref, selector) {
    for (var i = 0; i < marks.length; i += 1) {
      var mark = marks[i]
      if (ref && mark.ref === ref) return mark
      if (ref && 'draft-' + mark.draftId === ref) return mark
    }
    if (selector) {
      for (var j = 0; j < marks.length; j += 1) {
        if (marks[j].el && selectorFor(marks[j].el) === selector) return marks[j]
      }
    }
    return null
  }

  /**
   * Hide our own decorations (pin badges, hover box, panel) while a screenshot is taken — an
   * element's portrait should not have our blue number baked into the corner. Resolves after two
   * frames, so the compositor has actually painted the version without them.
   */
  function overlayHidden(hidden) {
    host.style.visibility = hidden ? 'hidden' : ''
    if (!hidden) return Promise.resolve(true)
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { resolve(true) })
      })
    })
  }

  function rectOf(ref, selector) {
    var mark = markFor(ref, selector)
    if (!mark) return null
    var el = mark.el
    if (!el || !el.getBoundingClientRect) return null
    var rect = el.getBoundingClientRect()
    // A screenshot can only capture what is on screen: scroll a scrolled-away element back into
    // view first, otherwise the crop would photograph whatever happens to be there instead.
    var off = rect.bottom <= 0 || rect.right <= 0
      || rect.top >= window.innerHeight || rect.left >= window.innerWidth
    if (off && el.scrollIntoView) {
      try { el.scrollIntoView({ block: 'center', inline: 'center' }) } catch (error) { el.scrollIntoView() }
      rect = el.getBoundingClientRect()
    }
    if (rect.width < 1 || rect.height < 1) return null
    // Clamp to the viewport, so a half-visible element still yields a sane crop.
    var left = Math.max(0, Math.round(rect.left))
    var top = Math.max(0, Math.round(rect.top))
    var right = Math.min(window.innerWidth, Math.round(rect.right))
    var bottom = Math.min(window.innerHeight, Math.round(rect.bottom))
    if (right - left < 1 || bottom - top < 1) return null
    return {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
      tag: String(el.tagName || '').toLowerCase(),
    }
  }

  window[KEY] = {
    destroy: destroy,
    describe: describe,
    api: API,
    borderReport: function () {
      return marks.map(function (mark) {
        var cs = null
        try { cs = window.getComputedStyle(mark.el) } catch (error) { cs = null }
        var rect = null
        try { rect = mark.el.getBoundingClientRect() } catch (error) { rect = null }
        /* Whose pixels win two px below the top edge? If that is not our element, the
           border is painted but covered by a sibling overlay (Baidu does this on banners). */
        var onTop = ''
        var covered = null
        if (rect) {
          try {
            var hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 2)
            if (hit) {
              onTop = String(hit.tagName || '').toLowerCase() + '.' + String(hit.className || '').slice(0, 40)
              covered = hit !== mark.el && !mark.el.contains(hit)
            }
          } catch (error) { onTop = '' }
        }
        return {
          ref: mark.ref,
          tag: String(mark.el.tagName || '').toLowerCase(),
          width: String(mark.adjustments['边框宽度'] || ''),
          top: cs ? String(cs.borderTopWidth) : '',
          topStyle: cs ? String(cs.borderTopStyle) : '',
          bottom: cs ? String(cs.borderBottomWidth) : '',
          radius: cs ? String(cs.borderTopLeftRadius) : '',
          pos: cs ? String(cs.position) : '',
          z: cs ? String(cs.zIndex) : '',
          y: rect ? Math.round(rect.top) : null,
          h: rect ? Math.round(rect.height) : null,
          onTop: onTop,
          covered: covered,
          inline: String(mark.el.getAttribute('style') || '').slice(-120),
        }
      })
    },
    version: 88,
    // 面板按元素能力裁剪字段（图片没有文本类控件）；对外暴露一份，测试与排查不用点页面。
    profile: elementProfile,
    clearAll: clearAllPublic,
    rectOf: rectOf,
    overlayHidden: overlayHidden,
    state: function () {
      return {
        installed: active,
        marks: marks.length,
        active: !!activeMark,
        panel: panelOpen,
        saved: marks.filter(function (m) { return m.saved }).length,
        // Which host row each pin belongs to — the sidebar's × deletes by ref.
        refs: marks.map(function (m) { return m.ref || '' }),
      }
    },
    useHost: useHost,
    drain: drainPublic,
    applyCommands: applyCommands,
  }
  toast('点选已开启：点元素加批注（Shift+点击选父级），Esc 退出')
})()
