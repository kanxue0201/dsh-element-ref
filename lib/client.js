/**
 * Element-reference plugin — interface half.
 *
 * Adds one right-sidebar page type ("元素引用") plus a small header button that opens it.
 * The page lists every element picked in the browser, and inserts a scoped edit request into
 * the composer of the conversation it belongs to.
 */
window.__ModuleLoader__.load({
  id: 'dsh-element-ref',
  factory(require) {
    const React = require('react')
    let createRootRef = null
    /**
     * react-dom/client is a platform seed word, but keeping the require lazy means a
     * platform shuffle can only disable our chips, never fail the whole web boot.
     */
    const createRootOf = (node) => {
      if (!createRootRef) createRootRef = require('react-dom/client').createRoot
      return createRootRef(node)
    }
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState } = React

    const ID = 'dsh-element-ref'
    const API = '/element-ref'

    /**
     * Composers are owned by the conversation package and hand their action face to seat
     * components as a prop. The sidebar page lives in another tree, so a silent seat captures
     * the face here, keyed by session.
     *
     * The map lives on the shared object, not in this module: a hot update swaps the module while
     * the mounted seat components keep running the previous copy, and a module-private map would
     * look empty forever — the chip row still renders (it repaints from the store) but sending has
     * no composer face to talk to, which reads as "the send button does nothing".
     */
    const SHARED_ROOT = (() => {
      const scope = typeof window !== 'undefined' ? window : globalThis
      const key = '__DSH_ELEMENT_REF_SHARED__'
      if (!scope[key]) scope[key] = { pickWanted: false }
      return scope[key]
    })()
    if (!(SHARED_ROOT.inputs instanceof Map)) SHARED_ROOT.inputs = new Map()
    const inputs = SHARED_ROOT.inputs

    /**
     * A brand-new task has no conversation id until its first message is sent, so its seat marker
     * carries an empty `data-session`. That made the dock fall back to the previous conversation:
     * chips were filed under the old task and never showed up in the new one. The actions of such
     * a composer live here, and the seat gets a local key (`seat-1`, `seat-2`, …) that stands in
     * for the id until the real one exists.
     */
    if (!(SHARED_ROOT.loose instanceof Object)) SHARED_ROOT.loose = { actions: null }
    const loose = SHARED_ROOT.loose

    const COLORS = {
      border: 'rgba(127, 127, 127, 0.28)',
      soft: 'rgba(127, 127, 127, 0.10)',
      softer: 'rgba(127, 127, 127, 0.06)',
      muted: 'rgba(127, 127, 127, 0.85)',
      accent: '#2f6bff',
      accentSoft: 'rgba(47, 107, 255, 0.10)',
      danger: '#c0392b',
    }

    const S = {
      button: { border: `1px solid ${COLORS.border}`, background: 'transparent', color: 'inherit', borderRadius: 6, padding: '3px 8px', fontSize: 12, cursor: 'pointer', lineHeight: '18px' },
      ghost: { border: 'none', background: 'transparent', color: COLORS.muted, cursor: 'pointer', padding: '2px 4px', fontSize: 14, lineHeight: '16px' },
      card: { border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 6, background: COLORS.softer },
      cardHead: { display: 'flex', alignItems: 'center', gap: 6 },
      tag: { font: '600 11px/16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', padding: '0 5px', borderRadius: 4, background: COLORS.accentSoft, color: COLORS.accent },
      selector: { font: '11px/16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, color: COLORS.muted },
      text: { fontSize: 12, lineHeight: '18px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' },
      row: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
      meta: { fontSize: 11, color: COLORS.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      badge: { flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: COLORS.accent, color: '#fff', font: '600 11px/1 system-ui, sans-serif' },
      adjust: { display: 'flex', flexDirection: 'column', gap: 2, border: `1px dashed ${COLORS.border}`, borderRadius: 6, padding: '4px 6px' },
      adjustRow: { display: 'flex', gap: 6, fontSize: 12, lineHeight: '17px' },
      adjustKey: { color: COLORS.muted, flex: 'none' },
      adjustVal: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', font: '12px/17px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
      iconBtn: { border: 'none', background: 'transparent', color: COLORS.muted, cursor: 'pointer', padding: 3, borderRadius: 6, display: 'inline-flex', alignItems: 'center' },
      draftChip: { border: `1px solid ${COLORS.border}`, borderRadius: 999, padding: '0 6px', fontSize: 11, lineHeight: '16px', color: COLORS.muted },
      comment: { width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 28, maxHeight: 88, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: '4px 6px', font: '12px/18px inherit', color: 'inherit', background: 'transparent', outline: 'none' },
      dockWrap: { position: 'relative', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 2px 0', flex: 'none' },
      dockChip: { display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${COLORS.border}`, background: 'transparent', color: 'inherit', borderRadius: 999, padding: '3px 10px', fontSize: 12, cursor: 'default', userSelect: 'none', lineHeight: '18px' },
      // The wrapper owns the hover target so the × can sit on the corner without covering text.
      chipWrap: { position: 'relative', display: 'inline-flex', alignItems: 'center', flex: 'none' },
      // A real circle: square box + 50% radius + border-box, so the 1px border cannot push the
      // box out of proportion. 14px reads as a small dot on the corner, not a badge.
      chipKill: { position: 'absolute', top: -7, right: -7, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', width: 14, height: 14, padding: 0, borderRadius: '50%', border: `1px solid ${COLORS.border}`, background: 'var(--dsw-alias-bg-base, #fff)', color: COLORS.muted, fontSize: 10, lineHeight: '14px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(15,23,42,.14)' },
    }

    /**
     * One shared copy of the annotations for this window: the sidebar page and the composer dock
     * both read it, and a single poller keeps it fresh.
     */
    const store = {
      items: [],
      endpoint: API,
      subs: new Set(),
      timer: null,
      notify() {
        for (const sub of Array.from(this.subs)) {
          try { sub() } catch (error) { /* one broken subscriber must not stop the rest */ }
        }
      },
      async refresh() {
        try {
          const response = await fetch(API + '/items', { cache: 'no-store' })
          if (!response.ok) return
          const data = await response.json()
          if (typeof data.endpoint === 'string' && data.endpoint) this.endpoint = data.endpoint
          if (Array.isArray(data.items)) this.items = data.items
          this.notify()
          capturePending()
        } catch (error) { /* the interface may still be starting */ }
      },
      subscribe(fn) {
        this.subs.add(fn)
        if (!this.timer) {
          this.refresh()
          this.timer = setInterval(() => { this.refresh() }, 1200)
          // Node (the smoke harness) must not be kept alive by the poller.
          if (this.timer && typeof this.timer.unref === 'function') this.timer.unref()
        }
        return () => {
          this.subs.delete(fn)
          if (this.subs.size === 0 && this.timer) {
            clearInterval(this.timer)
            this.timer = null
          }
        }
      },
    }

    /**
     * Chips already spent in a sent message: they leave the composer row at once, and the host
     * marks those rows spent as well, so a reload cannot bring them back. The rows themselves
     * stay readable for the model (element_ref_details).
     */
    let spentRefs = new Set()

    /**
     * 一条标注属于哪个对话。拾取发生在某个对话里，就把那个会话 id 一起上报；于是 A 对话里点
     * 的元素只出现在 A 的输入框上方，切到 B 看不见。
     *
     * 老数据（加字段之前落的库）没有 session，按「无主」处理：在每个对话里都显示，直到被发出去
     * 或取消，免得升级一下就把用户手上没发完的批注藏没了。
     */
    /**
     * Which conversation an annotation belongs to. Records from before the tag existed carry no
     * session at all; they are pinned to the first conversation that displayed them instead of
     * every conversation, which used to make a chip from task A follow the window into task B.
     */
    let legacySession = ''

    function ownsSession(item, sessionId) {
      const owner = item && typeof item.session === 'string' ? item.session : ''
      const me = sessionId || ''
      if (owner === '') {
        // Untagged records belong to the conversation we first drew them in. If we never worked
        // out which one that was, they stay hidden rather than showing up in every task.
        return legacySession !== '' && me === legacySession
      }
      return owner === me
    }

    function visibleItems(sessionId) {
      return store.items.filter(
        (item) => !item.spent && !spentRefs.has(item.ref) && ownsSession(item, sessionId),
      )
    }

    function useStore() {
      const [, force] = useState(0)
      useEffect(() => store.subscribe(() => force((n) => n + 1)), [])
      return store
    }

    const postJson = (path, body) => fetch(API + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then((response) => response.json()).catch(() => ({}))

    /**
     * The renderer has no console we can read from the host, so the interesting
     * failures of the dock report themselves to /element-ref/debug.
     */
    const VERSION = '0.7.35'
    /** Diagnostics the sidebar page shows, so its state is visible without a devtools console. */
    const diag = { dock: 'no', seat: 'no', spot: 'no', script: '?', error: '' }
    const beacons = new Set()
    function beacon(stage, payload) {
      try {
        const body = { stage, version: VERSION, ...payload }
        const key = stage + ':' + JSON.stringify(payload)
        // Repeating the same state every poll is noise; report each change once.
        if (stage !== 'apply' && beacons.has(key)) return
        beacons.add(key)
        fetch(API + '/debug', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }).catch(() => {})
      } catch (error) { /* diagnostics must never break the interface */ }
    }

    /**
     * TEMP diagnostic (delete once the web-boot audit is understood): dump what the client module
     * loader thinks about this plugin, because the boot audit only prints a generic "import failed"
     * when no import error was recorded.
     */
    function readOf(target, name) {
      try {
        const direct = target ? target[name] : undefined
        if (direct !== undefined && direct !== null) return direct
      } catch (error) { /* Cordis refuses undeclared reads by throwing */ }
      try {
        const reflect = target && target.reflect
        const reflected = reflect && typeof reflect.get === 'function' ? reflect.get(name, false) : undefined
        if (reflected !== undefined && reflected !== null) return reflected
      } catch (error) { /* no reflect service */ }
      try {
        const get = target && target.get
        return typeof get === 'function' ? get.call(target, name) : undefined
      } catch (error) { return undefined }
    }

    function bootProbe(stage, ctx) {
      const describe = (error) => (error && error.message ? String(error.message) : String(error))
      try {
        const loader = readOf(ctx, 'loader')
        const modules = loader && loader.internal
        const list = loader && typeof loader.entries === 'function' ? loader.entries() : null
        // The loader hands back its own list type, not an Array: Array.from first, `filter` keeps that type.
        const entries = Array.from(list || [])
        const shape = (entry) => ({
          id: entry.id,
          name: entry.options && entry.options.name,
          inject: (entry.options && entry.options.inject) || null,
          phase: entry.fiber ? 'fiber:' + String(entry.fiber.state) : 'none',
        })
        const mine = entries.filter((entry) => entry.options && entry.options.name === 'dsh-element-ref').map(shape)
        let errors = null
        try {
          errors = modules && modules.importErrors
            ? Array.from(modules.importErrors).map(([key, value]) => [key, describe(value)])
            : null
        } catch (error) { errors = ['probe', describe(error)] }
        beacon('boot-' + stage, {
          total: entries.length,
          listType: list ? String(list.constructor && list.constructor.name) : 'none',
          loader: loader ? 'live' : 'none',
          mine,
          noFiber: entries.filter((entry) => entry.fiber === undefined).map(shape).slice(0, 12),
          errors,
          boot: !!window.__DSH_BOOT__,
        })
      } catch (error) {
        beacon('boot-probe-failed', { stage, message: describe(error) })
      }
    }

    /**
     * TEMP diagnostic: this runs the moment the bundle is materialized, before the plugin applies,
     * so a boot where the entry never gets a fiber still leaves a trace of what the page believed.
     */
    function factoryProbe() {
      try {
        const boot = window.__DSH_BOOT__
        const rows = boot && Array.isArray(boot.entries) ? boot.entries : []
        const mine = rows
          .filter((row) => row && row.id === 'dsh-element-ref')
          .map((row) => ({ id: row.id, rev: row.rev, url: row.url, inject: row.inject || null, immediately: row.immediately === true }))
        beacon('factory', {
          bootRev: boot && typeof boot.rev === 'string' ? boot.rev : null,
          rows: rows.length,
          mine,
          hasRow: mine.length > 0,
        })
      } catch (error) { /* diagnostics must never break the bundle */ }
    }
    factoryProbe()

    const byOrderly = (a, b) => Number(a.order || 1e9) - Number(b.order || 1e9)

    /** Pencil: open that annotation's style panel inside the page. */
    const openAdjust = (item) => postJson('/command', { type: 'focus', ref: item.ref, selector: item.selector })

    /**
     * 面板右上角的 ×：这一轮整体作废。
     * 先让宿主清空条目（chip 立刻消失），宿主再把 cancel 命令推给页面，
     * 由页面撤掉标号、还原预览过的样式——两边都回到「没动过」的状态。
     */
    async function cancelRound() {
      let ok = true
      try { await postJson('/clear', {}) } catch (error) { ok = false }
      await store.refresh()
      // Belt and braces: the command queue only covers pages whose bridge is
      // ticking. Clearing straight in the frame makes the ✕ work even when the
      // push is late or the page still runs a script without the cancel branch.
      const page = await clearPageMarks()
      beacon('cancel', { ok, page })
      return ok
    }

    /**
     * 单条 chip 上的 ×：只丢掉这一处修改。三件事一起做——宿主删行、页面撤标号、内存里藏掉，
     * 于是 chip 立刻消失、页面上的编号重新排。其余批注一动不动。
     */
    async function discardItem(item) {
      if (!item || !item.ref) return false
      const ref = item.ref
      spentRefs.add(ref)
      store.notify()
      let ok = false
      try {
        const response = await fetch(API + '/delete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ref }),
        })
        ok = response.ok
      } catch (error) {
        beacon('discard', { ok: false, why: String(error), ref })
      }
      // The pin lives in the page: ask it to drop that one mark (it restores the preview styles).
      await postJson('/command', { type: 'delete', ref, selector: item.selector || '', text: '' }).catch(() => {})
      await store.refresh()
      beacon('discard', { ok, ref })
      return ok
    }

    /**
     * 一轮发出去以后，这条消息把 chip 用掉了：输入框上方那排 chip 立刻消失，页面上的标号也撤掉。
     * 但宿主上的条目要留一会儿——模型收到消息后会去 /items 读选择器和 HTML 快照，
     * 立刻清空会让它读到空数组。所以这里只「藏」chip，真正的清空延后。
     */
    async function finishRound(items) {
      const refs = (items || []).map((item) => item.ref)
      spentRefs = new Set(refs)
      store.notify()
      const page = await clearPageMarks()
      // The host remembers which rows were sent. Keeping that only in memory meant every hot
      // reload resurrected the chips, as if a fresh pick had just landed.
      await postJson('/consume', { refs }).catch(() => {})
      await store.refresh()
      beacon('round-done', { page, kept: refs.length })
      return true
    }

    /**
     * Wipe the pins inside the sidebar browser immediately.
     * "cleared" = at least one page had a picker and let go of it (pins and previews dropped);
     * "absent"  = no picker anywhere, so nothing to do;
     * "stale"   = a picker older than clearAll: it is destroyed instead of replaced.
     */
    async function clearPageMarks() {
      // Clearing ends the round, so picking is switched off before the page is touched: an
      // armed picker (or one that has to be re-injected below) would otherwise keep
      // highlighting elements after a send, which reads as "picking turned itself back on".
      disarmAddressButton()
      // Every sidebar tab keeps its own <webview>/<iframe>, and the hidden ones still run a
      // live picker. Wiping only the frame the bridge happens to hold left the tab in front
      // armed — the page kept highlighting after a send. Clear them all.
      const frames = allBrowserFrames()
      if (bridgeFrame && frames.indexOf(bridgeFrame) < 0) frames.push(bridgeFrame)
      if (!frames.length) return 'no-frame'
      let cleared = 0
      let stale = null
      for (const frame of frames) {
        let answer = null
        try {
          answer = await frame.executeJavaScript(
            'window.__DSH_ELEMENT_REF__'
            + ' ? (typeof window.__DSH_ELEMENT_REF__.clearAll === "function"'
            + ' ? window.__DSH_ELEMENT_REF__.clearAll() : "stale")'
            + ' : "absent"',
          )
        } catch (error) {
          /* the guest may be navigating */
          continue
        }
        if (Number(answer) >= 0) {
          // Older pickers only clear their pins; ask the page to leave picking as well.
          await frame.executeJavaScript('window.__DSH_ELEMENT_REF__.destroy(); true').catch(() => {})
          cleared += 1
        } else if (answer === 'stale' && !stale) {
          stale = frame
        }
      }
      if (cleared) return 'cleared'
      // No picker anywhere means nothing to clear — injecting one here would silently arm
      // picking on a page the user just left.
      if (!stale) return 'absent'
      // A picker too old to know clearAll: destroying it is enough. Injecting a new one just to
      // destroy it flashed a live picker on the page, which read as "picking started itself".
      try {
        await stale.executeJavaScript(
          'window.__DSH_ELEMENT_REF__ && window.__DSH_ELEMENT_REF__.destroy ? '
          + '(window.__DSH_ELEMENT_REF__.destroy(), "destroyed") : "absent"',
        )
        return 'cleared'
      } catch (error) {
        return 'failed'
      }
    }

    async function editComment(item, text) {
      if ((item.requirement || '') === text) return
      await postJson('/update', { ref: item.ref, requirement: text })
      await store.refresh()
    }

    /** Both surfaces insert through the same captured composer face. */
    function actionsFor(key) {
      if (key && inputs.has(key)) return inputs.get(key)
      // An unnamed task ("new-task") has no entry in the map: its composer's actions were
      // captured without an id and kept aside.
      if (key === 'new-task' && loose.actions) return loose.actions
      // The floating dock has no session prop of its own: it talks to the newest composer.
      const known = Array.from(inputs.values())
      if (known.length) return known[known.length - 1]
      return loose.actions || undefined
    }

    /**
     * The dock's buttons live outside the editor, so the composer's own selection may be stale or
     * gone by the time we ask for a caret span — a span that no longer maps makes insertText report
     * false and the prompt silently lands on the clipboard instead of in the draft. Focusing the
     * editable first restores a live caret inside it.
     */
    function composerEditable(card) {
      if (typeof document === 'undefined') return null
      const scope = card || composerCard() || document
      return scope.querySelector('[contenteditable="true"]') || scope.querySelector('textarea')
    }

    function focusComposer() {
      try {
        const el = composerEditable()
        if (el) el.focus({ preventScroll: true })
        return !!el
      } catch (error) {
        return false
      }
    }

    function applyInsert(actions, text) {
      try {
        const span = typeof actions.captureInsertion === 'function' ? actions.captureInsertion() : undefined
        return actions.insertText(text, span) !== false
      } catch (error) {
        return false
      }
    }

    let sendSeq = 0

    function insertPrompt(sessionId, text) {
      // A named session that has no seat must not fall back to somebody else's draft.
      const actions = sessionId ? inputs.get(sessionId) : actionsFor(undefined)
      if (!actions) { beacon('insert', { ok: false, why: 'no-face', seq: ++sendSeq }); copyText(text); return false }
      focusComposer()
      if (applyInsert(actions, text)) { beacon('insert', { ok: true, seq: ++sendSeq }); return true }
      // Focus and selection settle asynchronously in the composer; one frame later the span maps.
      requestAnimationFrame(() => {
        if (applyInsert(actions, text)) { beacon('insert', { ok: true, why: 'retry', seq: ++sendSeq }); return }
        beacon('insert', { ok: false, why: 'span-missed', seq: ++sendSeq })
        copyText(text)
      })
      return false
    }

    /** What the user typed into the composer — it rides along as the trailing general instruction. */
    function readDraftText() {
      const el = composerEditable()
      if (!el) return ''
      const raw = el.tagName === 'TEXTAREA' ? String(el.value || '') : String(el.innerText || el.textContent || '')
      return raw.replace(/\u200b/g, '').replace(/\u00a0/g, ' ').trim()
    }

    /**
     * The hero composer of a brand-new task has no session yet, and the app only renders our
     * actions slot once one exists — so `setDraft` is unreachable there. The editor in front of
     * the user is still an ordinary editable, so the markers are typed into it and the app's own
     * submit carries them, creating the session in one go.
     */
    function fillEditable(items) {
      const card = onScreenCard()
      if (!card || typeof card.querySelector !== 'function') return false
      const el = card.querySelector('[contenteditable="true"]') || card.querySelector('textarea')
      if (!el) return false
      const list = Array.isArray(items) ? items : [items]
      if (list.length === 0) return false
      const typed = readDraftText()
      const many = list.length > 1
      const text = list.map((item, index) => cardMarkup(item, many, index)).join('')
        + (typed ? CARD_BREAK + typed : '')
      try { if (typeof el.focus === 'function') el.focus() } catch { /* focus is best effort */ }
      try {
        const selection = typeof window !== 'undefined' ? window.getSelection() : null
        if (selection && typeof document.createRange === 'function') {
          const range = document.createRange()
          range.selectNodeContents(el)
          selection.removeAllRanges()
          selection.addRange(range)
        }
      } catch { /* selection is best effort */ }
      let filled = false
      try {
        filled = document.execCommand('insertText', false, text) === true
      } catch { filled = false }
      if (!filled && el.tagName === 'TEXTAREA') {
        try {
          el.value = text
          el.dispatchEvent(new Event('input', { bubbles: true }))
          filled = true
        } catch { filled = false }
      }
      return filled
    }

    /**
     * The one message the bottom send button produces: every chip (element, HTML snapshot, intent,
     * and the CSS values set in the page panel), then whatever the user typed as a general ask.
     */
    function buildFinalPrompt(items, typed) {
      const list = Array.isArray(items) ? items : [items]
      if (list.length === 0) return ''
      const base = buildPrompt(list, false)
      const extra = String(typed || '').trim()
      return extra ? base + '\n' + extra + '\n' : base
    }

    /**
     * A style tweak in the words a reader uses: `文本颜色` is just `颜色`, and the shared prefix
     * `要改成 · ` is dropped — the label already says what the line is.
     */
    function shortAdjustLabel(label) {
      const text = String(label || '').trim()
      if (text === '文本颜色') return '颜色'
      // 文本 itself must keep its name: stripping the prefix would leave a bare "：" and the card
      // would read `<h1> → ：清空`, which says nothing about what is being changed.
      if (text === '文本') return text
      return text.replace(/^文本/, '')
    }

    function adjustSummary(item) {
      const rows = []
      for (const [label, value] of Object.entries(item.adjustments || {})) {
        // An empty value is not "nothing to say": clearing the copy is a change the model has to
        // carry out, so it reads as `文本：清空` instead of silently vanishing.
        if (value === undefined || value === null) continue
        rows.push(shortAdjustLabel(label) + '：' + (value === '' ? '清空' : value))
      }
      return rows
    }

    /**
     * One annotation as a composer card: the element line, then the ask. Style tweaks read as
     * `颜色：#a25757`, a written note as `标注：这是什么`. The label is deliberately neutral — the
     * same box carries "make it blue" and "what is this", and calling the second one a requirement
     * read like an edit order. The selector, HTML snapshot and current styles are not in the
     * message — the model reads them from the host tool.
     */
    function quoteTextFor(item, many, index) {
      const block = promptBlock(item, many, index)
      const headLine = block.find((line) => line.startsWith('元素：')) || ''
      const asks = adjustSummary(item)
      const typed = String(item.requirement || item.comment || '').replace(/\s+/g, ' ').trim()
      if (typed) asks.push('标注：' + typed)
      const first = (many ? '【第 ' + (item.order || index + 1) + ' 处】' : '') + headLine.replace(/^元素：/, '')
      return asks.length ? first + '\n' + asks.join(' · ') : first
    }

    /** Separates the element line from the ask inside one card label. */
    const CARD_SPLIT = ' → '

    /** Ends the pill row so the sentence below starts its own paragraph (see `ElementRefCard`). */
    const CARD_BREAK = '@[](dsh-element:br)'

    /**
     * Wire form of one card inside the draft: `@[<h1> 文本“Elia” → 变成蓝色](dsh-element:1)`.
     * The transcript swaps the marker for `ElementRefCard`; the model still reads the marker text
     * (and the host tool returns the full snapshot when it needs the styles).
     */
    function cardMarkup(item, many, index) {
      return '@[' + quoteTextFor(item, many, index).split('\n').join(CARD_SPLIT) + '](dsh-element:' + (item.order || index + 1) + ')'
    }

    const CARD_STYLE = {
      box: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        boxSizing: 'border-box',
        // Pills share a row and hug their content; a zero-height block after the last one ends the
        // line so the sentence the user typed still starts a paragraph of its own.
        margin: '1px 6px 1px 0',
        padding: '4px 9px 4px 4px',
        borderRadius: '999px',
        border: '1px solid rgba(47,107,255,.14)',
        background: 'rgba(47,107,255,.07)',
        maxWidth: '100%',
        verticalAlign: 'middle',
      },
      badge: {
        flex: '0 0 auto',
        minWidth: '18px',
        height: '18px',
        padding: '0 5px',
        borderRadius: '999px',
        background: '#2f6bff',
        color: '#fff',
        fontSize: '11px',
        fontWeight: 600,
        lineHeight: '18px',
        textAlign: 'center',
      },
      tag: {
        flex: '0 0 auto',
        fontFamily: 'var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
        fontSize: '11.5px',
        lineHeight: '1.4',
        color: 'var(--dsw-alias-accent-strong, #2f5bd0)',
      },
      text: {
        flex: '0 1 auto',
        minWidth: 0,
        fontSize: '13px',
        lineHeight: '1.4',
        color: 'var(--dsw-alias-label-primary, #111827)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      },
    }

    /**
     * One annotation, painted as a block inside the user's message. Being a block is the whole
     * point: the sentence the user typed follows it as an ordinary paragraph, on its own line,
     * in the same message.
     */
    function ElementRefCard(props) {
      const data = (props && props.node && props.node.data) || {}
      // The break marker only ends the pill line; it carries nothing else.
      if (data.br) return h('div', { style: { display: 'block', height: 0, margin: 0, padding: 0, fontSize: 0, lineHeight: 0 } })
      const label = typeof data.label === 'string' ? data.label : ''
      const parts = label.split(CARD_SPLIT)
      const head = parts.shift() || ''
      const ask = parts.join(CARD_SPLIT)
      // "【第 2 处】<span> 文本“…”" → order, tag; the ask is the second half. A single card has no
      // such prefix, so its number comes from the marker's own ref (`dsh-element:1`).
      const prefix = head.match(/^【第 (\d+) 处】/)
      const refId = typeof data.ref === 'string' ? data.ref : ''
      const order = prefix ? prefix[1] : (/^\d+$/.test(refId) ? refId : '')
      const rest = prefix ? head.slice(prefix[0].length) : head
      const tag = (rest.match(/<[^>\s]+>/) || [''])[0]
      // The wire text stays explicit for the model; the pill only shows which element it is.
      const shortAsk = (ask || head).replace(/标注：|我的要求：/g, '')
      return h('div', { style: CARD_STYLE.box, title: shortAsk },
        h('span', { style: CARD_STYLE.badge }, order || '·'),
        tag ? h('span', { style: CARD_STYLE.tag }, tag) : null)
    }

    /** Recognizes the wire marker above; `from` is where the renderer resumed scanning. */
    const CARD_RULE = {
      id: 'element-ref',
      order: 30,
      match(text, from) {
        const re = /@\[([^\]\n]*)\]\(dsh-element:([^)\s]+)\)/gu
        for (const found of text.matchAll(re)) {
          if (found.index < from) continue
          return {
            id: 'element-ref',
            start: found.index,
            end: found.index + found[0].length,
            data: found[2] === 'br' ? { br: true } : { label: found[1], ref: found[2] },
          }
        }
        return undefined
      },
    }

    /** The composer face the dock speaks through: the newest captured seat. */
    function primarySessionId() {
      const ids = Array.from(inputs.keys())
      return ids.length ? ids[ids.length - 1] : undefined
    }

    /**
     * The app's own send button is gated on `draft.trim() === "" && attachments.length === 0`, so a
     * composer holding only chips stays dead. While chips exist we keep that button alive and take
     * its press over.
     *
     * What lands in the transcript are quote cards, one per chip, each carrying the element, its
     * snapshot and the ask — the model still receives every detail, but the message reads as chips
     * instead of a wall of text. Whatever the user typed stays as the plain text of the message.
     */
    function handleSend(ownerKey) {
      const seq = ++sendSeq
      const items = visibleItems(ownerKey).slice().sort(byOrderly)
      if (items.length === 0) return false
      const typed = readDraftText()
      const many = items.length > 1
      const actions = actionsFor(ownerKey)
      if (!actions || typeof actions.submit !== 'function' || typeof actions.setDraft !== 'function') {
        beacon('send', { ok: false, why: 'no-face', seq, seats: inputs.size, loose: !!loose.actions, session: !!ownerKey })
        copyText(buildFinalPrompt(items, typed))
        return false
      }

      // Nothing is typed in on the user's behalf: the message is the chips, plus whatever they
      // wrote themselves. The markers keep the draft non-empty, so the machine still submits
      // (`onEnter` only drops a draft whose trimmed text is "" and which has no attachments).

      // A markdown blockquote is the only shape the app's own renderer knows how to turn into a
      // card, but everything after it stays on the same line: `quoteRule` turns the separator into
      // a single space, so the sentence can never become its own paragraph. The transcript instead
      // paints our own wire marker through the `conversation.user.text.node` slot (see
      // `ElementRefCard`), which is a real block — so the cards stack and the sentence starts a new
      // paragraph below them, in one message.
      let quoted = 0
      try {
        const cards = items.map((item, index) => cardMarkup(item, many, index)).join('')
        if (typeof actions.setDraft === 'function') {
          // Without a typed line the message is just the cards, so no break marker is needed.
          actions.setDraft(cards + (typed ? CARD_BREAK + typed : ''))
          quoted = items.length
        }
      } catch (error) {
        beacon('send', { ok: false, why: 'set-draft-threw', message: String(error), seq })
        quoted = 0
      }

      if (quoted === 0) {
        // No quote support (or every card was refused): one plain block keeps the message intact.
        try {
          actions.setDraft(buildFinalPrompt(items, typed))
        } catch (error) {
          beacon('send', { ok: false, why: 'set-draft-threw', message: String(error), seq })
          copyText(buildFinalPrompt(items, typed))
          return false
        }
      }

      // The run is dispatched from the published draft, so it has to follow the editor update.
      requestAnimationFrame(() => {
        let sent = false
        try {
          actions.submit()
          sent = true
          beacon('send', { ok: true, seq, mode: quoted ? 'quotes' : 'text', quotes: quoted, chips: items.length, typed: typed.length })
        } catch (error) {
          beacon('send', { ok: false, why: 'submit-threw', message: String(error), seq })
          copyText(buildFinalPrompt(items, typed))
        }
        if (sent) {
          // One message spent the whole round: drop the chips and the pins with it.
          void finishRound(items)
        }
      })
      return true
    }

    /**
     * The composer on screen.
     *
     * More than one conversation can be mounted at once (opening a second task keeps the first
     * one alive but hidden), and `querySelector` then answers with whichever card comes first in
     * the DOM — chips landed in the hidden conversation while the visible one stayed empty.
     * Screen position is the honest tie-breaker.
     */
    function composerCard() {
      if (typeof document === 'undefined') return null
      const cards = document.querySelectorAll('[data-composer-card]')
      let fallback = null
      for (let i = 0; i < cards.length; i += 1) {
        const card = cards[i]
        if (!fallback) fallback = card
        const box = typeof card.getBoundingClientRect === 'function' ? card.getBoundingClientRect() : null
        if (box && box.width > 0 && box.height > 0) return card
      }
      return fallback
    }

    /**
     * The card that is really on screen right now. A conversation kept alive in the background
     * can still report a non-zero rect (it is only translated away), so geometry alone is not
     * enough: the centre of the card has to hit-test back into that same card.
     */
    function onScreenCard() {
      if (typeof document === 'undefined') return null
      const cards = document.querySelectorAll('[data-composer-card]')
      for (let i = 0; i < cards.length; i += 1) {
        const card = cards[i]
        const box = typeof card.getBoundingClientRect === 'function' ? card.getBoundingClientRect() : null
        if (!box || box.width < 4 || box.height < 4) continue
        const x = box.left + box.width / 2
        const y = box.top + box.height / 2
        const vw = (typeof window !== 'undefined' && window.innerWidth) || 0
        const vh = (typeof window !== 'undefined' && window.innerHeight) || 0
        if (vw && vh && (x < 0 || y < 0 || x > vw || y > vh)) continue
        if (typeof document.elementFromPoint !== 'function') return card
        const hit = document.elementFromPoint(x, y)
        if (hit && (hit === card || (typeof card.contains === 'function' && card.contains(hit)))) return card
      }
      return composerCard()
    }

    function sendButton() {
      const card = onScreenCard()
      return card ? card.querySelector('button[class*="primary"]') : null
    }

    function isSending(btn) {
      return !!btn && (btn.hasAttribute('data-sending') || btn.getAttribute('aria-busy') === 'true')
    }

    /**
     * While a run is streaming the same primary slot turns into a stop control (a rounded square
     * inside its svg). That press belongs to the app, never to the packing path.
     */
    function isStopControl(btn) {
      return !!btn && !!btn.querySelector('svg rect')
    }

    /** Keep the app's send button alive while chips exist; otherwise let its own rule stand. */
    function syncSendEnabled() {
      const btn = sendButton()
      if (!btn) return
      const probe = { found: true, mode: 'send', label: btn.getAttribute('aria-label') || '', cls: String(btn.className || '').slice(0, 48) }
      if (isSending(btn) || isStopControl(btn)) {
        beacon('sendbtn', { ...probe, mode: isStopControl(btn) ? 'stop' : 'sending' })
        return
      }
      const live = visibleItems(visibleSessionId()).length
      beacon('sendbtn', { ...probe, disabled: btn.disabled, chips: live })
      if (live > 0) {
        if (btn.disabled) btn.disabled = false
        if (btn.getAttribute('aria-disabled') === 'true') btn.removeAttribute('aria-disabled')
      } else if (!btn.disabled && readDraftText() === '') {
        btn.disabled = true
      }
    }

    /**
     * Wires the composer's own send button (and Enter) to handleSend while chips exist, so the
     * dock never needs a send button of its own: one exit, always at the bottom right.
     */
    function installSendBridge() {
      if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
      let frame = 0
      const kick = () => {
        if (frame) return
        frame = requestAnimationFrame(() => { frame = 0; syncSendEnabled() })
      }
      const observer = new MutationObserver(kick)
      let timer = null
      const watch = () => {
        const card = onScreenCard()
        if (!card) return false
        observer.observe(card, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['disabled', 'aria-disabled', 'data-sending', 'class'],
        })
        return true
      }
      if (!watch()) timer = setInterval(() => { if (watch()) clearInterval(timer) }, 800)
      const unsubscribe = store.subscribe(kick)
      const onClick = (event) => {
        const btn = sendButton()
        if (!btn || (event.target !== btn && !btn.contains(event.target))) return
        const owner = visibleOwner()
        const items = visibleItems(owner.key)
        if (items.length === 0 || isSending(btn) || isStopControl(btn)) return
        if (!actionsFor(owner.key)) {
          // A brand-new task's hero composer exposes no actions to us: the app drops that slot
          // until a session exists. Type the markers into the editor instead and let the app's
          // own submit create the session — one message, chips included.
          const filled = fillEditable(items)
          if (filled) void finishRound(items)
          beacon('send', { ok: filled, why: 'dom-fill', seq: ++sendSeq, chips: items.length })
          return
        }
        event.preventDefault()
        event.stopPropagation()
        handleSend(owner.key)
      }
      const onKeyDown = (event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return
        const owner = visibleOwner()
        const items = visibleItems(owner.key)
        if (items.length === 0) return
        const card = onScreenCard()
        const target = event.target
        if (!card || !target || !card.contains(target)) return
        // Our own panel lives inside the card too: its comment box keeps its Enter.
        if (target.closest && target.closest('[data-element-ref]')) return
        if (isSending(sendButton()) || isStopControl(sendButton())) return
        if (!actionsFor(owner.key)) {
          const filled = fillEditable(items)
          if (filled) void finishRound(items)
          beacon('send', { ok: filled, why: 'dom-fill', seq: ++sendSeq, chips: items.length })
          return
        }
        event.preventDefault()
        event.stopPropagation()
        handleSend(owner.key)
      }
      document.addEventListener('click', onClick, true)
      document.addEventListener('keydown', onKeyDown, true)
      // A heartbeat keeps the gate alive when React swaps the button without a class change.
      const beat = setInterval(() => syncSendEnabled(), 2000)
      kick()
      return () => {
        observer.disconnect()
        clearInterval(beat)
        if (timer) clearInterval(timer)
        if (frame) cancelAnimationFrame(frame)
        unsubscribe()
        document.removeEventListener('click', onClick, true)
        document.removeEventListener('keydown', onKeyDown, true)
      }
    }

    const svgIcon = (d, size = 14) => h('svg', {
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.7,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      style: { display: 'block' },
    }, h('path', { d }))

    const PENCIL = 'M4.6 19.4h3.6L18.5 9.1a1.9 1.9 0 0 0-2.7-2.7L5.5 16.7v2.7M14.6 6.6l2.8 2.8'

    function sameItems(a, b) {
      if (a.length !== b.length) return false
      for (let i = 0; i < a.length; i += 1) if (a[i].ref !== b[i].ref) return false
      return true
    }

    /** One element's block inside the message: where it is, what it is, and what should change. */
    function promptBlock(item, many, index) {
      const lines = []
      if (many) lines.push('【第 ' + (item.order || index + 1) + ' 处】')
      lines.push('页面：' + (item.page || ''))
      if (item.pageTitle) lines.push('页面标题：' + item.pageTitle)
      lines.push('元素选择器：' + (item.selector || ''))
      let head = '<' + (item.tag || 'div')
      if (item.id) head += ' id="' + item.id + '"'
      if (item.classes) head += ' class="' + item.classes + '"'
      head += '>'
      lines.push('元素：' + head + (item.text ? ' 文本“' + item.text + '”' : ''))
      if (item.source) lines.push('源码线索：' + item.source)
      if (item.ancestors) lines.push('外层结构：' + item.ancestors)
      if (item.outerHTML) lines.push('元素快照：' + item.outerHTML)
      const styleKeys = Object.keys(item.styles || {})
      if (styleKeys.length > 0) {
        lines.push('当前关键样式：' + styleKeys.map((key) => key + ': ' + item.styles[key]).join('; '))
      }
      const adjustments = Object.entries(item.adjustments || {})
      if (adjustments.length > 0) {
        lines.push('要改成：')
        adjustments.forEach(([label, value]) => {
          // An empty value means "delete this copy", not "no opinion": spell it out so the model
          // does not read a bare `文本：` as a missing instruction.
          lines.push('  · ' + label + '：' + (value === '' ? '清空' : value))
        })
      }
      // 页面草稿把意图放在 comment 里，落库条目才叫 requirement；两边都认，
      // 否则「正在写、还没点发送」的那条批注在 Prompt 里是空的。
      const requirement = item.requirement || item.comment || ''
      if (requirement.trim()) lines.push('我的要求：' + requirement)
      return lines
    }

    /**
     * The message the composer receives. One picked element, or several annotations sent together:
     * they are written in annotation order so the model can work through them one by one.
     */
    function buildPrompt(input, styleOnly) {
      const list = Array.isArray(input) ? input : [input]
      const ordered = list.slice().sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      const many = ordered.length > 1
      const lines = []
      if (many) {
        lines.push(styleOnly
          ? '只调整下面这几处元素的视觉样式（颜色、间距、字号、圆角等），不要改动结构，其它元素保持原样。'
          : '只修改下面这几处元素相关的代码，按标号顺序逐处处理，其它元素和整体布局保持原样。')
      } else {
        lines.push(styleOnly
          ? '只调整下面这个元素的视觉样式（颜色、间距、字号、圆角等），不要改动结构，其它元素保持原样。'
          : '只修改下面这一个元素相关的代码，其它元素和整体布局保持原样。')
      }
      ordered.forEach((item, index) => {
        lines.push('')
        promptBlock(item, many, index).forEach((line) => lines.push(line))
      })
      lines.push('')
      lines.push('修改要求：')
      return lines.join('\n')
    }

    function copyText(text) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text)
      } catch (error) { /* clipboard is optional */ }
      return Promise.resolve()
    }

    /**
     * DSH's own right-sidebar browser renders its page in a <webview> (desktop) or an iframe
     * (web). A webview can run our picker in place, so picking needs no script in the project.
     */
    const FRAME_SELECTOR = 'webview[data-sidebar-browser-frame="webview"]'

    function liveBrowserFrame() {
      if (typeof document === 'undefined') return null
      const frames = Array.prototype.slice.call(document.querySelectorAll(FRAME_SELECTOR))
      for (let i = frames.length - 1; i >= 0; i -= 1) {
        const frame = frames[i]
        const rect = frame.getBoundingClientRect()
        if (rect.width > 120 && rect.height > 120) return frame
      }
      return null
    }

    /** Every sidebar browser frame, visible or not: hidden tabs keep their picker alive. */
    function allBrowserFrames() {
      if (typeof document === 'undefined') return []
      return Array.prototype.slice.call(document.querySelectorAll(FRAME_SELECTOR))
    }

    /** Elements whose content only exists as pixels — the markup cannot describe them. */
    const SHOT_TAGS = { img: 1, svg: 1, canvas: 1 }
    const shotTried = new Set()
    let captureProbed = false

    function bytesToBase64(bytes) {
      if (typeof btoa !== 'function') return ''
      let binary = ''
      const chunk = 0x8000
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
      }
      return btoa(binary)
    }

    /**
     * Photograph one picked image/svg/canvas. The page can hand us a rect but no pixels, and the
     * model reads text — so the renderer crops the element out of the webview and the host parks
     * the PNG next to the row; the agent tool hands the path to the model.
     */
    async function captureShot(item) {
      const ref = item && item.ref
      if (!ref || shotTried.has(ref)) return
      shotTried.add(ref)
      const tag = String(item.tag || '').toLowerCase()
      const frame = liveBrowserFrame()
      if (!frame || typeof frame.capturePage !== 'function') {
        beacon('shot', { ok: false, why: 'no-capture', tag })
        return
      }
      try {
        // Our own badges must not be part of the portrait: hide the overlay, wait for a repaint.
        await frame.executeJavaScript(
          '(function(){var h=window.__DSH_ELEMENT_REF__;return h&&h.overlayHidden?h.overlayHidden(true):true})()',
        )
        const rect = await frame.executeJavaScript(
          '(function(){var h=window.__DSH_ELEMENT_REF__;return h&&h.rectOf?h.rectOf('
            + JSON.stringify(ref) + ',' + JSON.stringify(item.selector || '') + '):null})()',
        )
        if (!rect || rect.width < 4 || rect.height < 4) {
          beacon('shot', { ok: false, why: 'no-rect', tag })
          return
        }
        const image = await frame.capturePage({
          x: Math.max(0, rect.x),
          y: Math.max(0, rect.y),
          width: rect.width,
          height: rect.height,
        })
        // `toPNG()` needs a Node Buffer, which this renderer context does not have ("Buffer is not
        // available for the current Context"); `toDataURL()` is self-contained and already base64.
        let data = ''
        if (image && typeof image.toDataURL === 'function') {
          const url = String(image.toDataURL() || '')
          const comma = url.indexOf(',')
          if (comma !== -1) data = url.slice(comma + 1)
        }
        if (!data && image && typeof image.toPNG === 'function') {
          const png = image.toPNG()
          if (png && png.length) data = bytesToBase64(png)
        }
        if (!data) {
          beacon('shot', { ok: false, why: 'no-data', tag })
          return
        }
        const result = await postJson('/shot', { ref, data, tag })
        beacon('shot', { ok: !!(result && result.ok), tag, bytes: data.length })
      } catch (error) {
        beacon('shot', { ok: false, why: String((error && error.message) || error), tag })
      } finally {
        // The user is still picking: give the pins back even when the shot failed.
        try {
          await frame.executeJavaScript(
            '(function(){var h=window.__DSH_ELEMENT_REF__;return h&&h.overlayHidden?h.overlayHidden(false):true})()',
          )
        } catch (error) { /* the frame may be gone */ }
      }
    }

    /** Anything picked that is a picture gets photographed once, on the next store refresh. */
    function capturePending() {
      const list = store.items || []
      for (const item of list) {
        if (!item || item.screenshot) continue
        if (!SHOT_TAGS[String(item.tag || '').toLowerCase()]) continue
        captureShot(item)
      }
    }

    /**
     * Is a picker actually running in this frame?
     *
     * A handle alone proves nothing (a shutdown that failed halfway leaves one behind), so newer
     * pickers report `state().installed`. Older ones have no such field and are treated as armed:
     * being wrong in that direction makes the sweep run, being wrong the other way leaves a page
     * highlighting with no way to stop it.
     */
    const ARMED_PROBE = '(function(){'
      + 'var h=window.__DSH_ELEMENT_REF__;'
      + 'if(!h||typeof h.destroy!=="function")return false;'
      + 'try{var s=h.state&&h.state();if(s&&typeof s.installed==="boolean")return s.installed}catch(e){}'
      + 'return true'
      + '})()'

    /**
     * Take down pickers nobody asked for in this session.
     *
     * The picker lives inside the page and outlives this module: reload the sidebar (or the app)
     * and the page is still armed while the freshly loaded module believes picking is off. Every
     * press then reads as "stop" against a page that keeps highlighting. A boot sweep makes the
     * two sides agree on "off", which is what a freshly opened browser should look like.
     */
    async function sweepStalePickers() {
      const frames = allBrowserFrames()
      // What is actually out there, per frame: a picker that keeps coming back without an
      // `inject` beacon in front of it was installed by something other than this module.
      const seen = []
      for (const frame of frames) {
        try {
          seen.push(await frame.executeJavaScript(
            '(function(){var h=window.__DSH_ELEMENT_REF__;var n=document.querySelectorAll("[data-dsh-element-ref]");'
            + 'return (h?("handle v"+String(h.version)):"no-handle")+" overlays:"+n.length})()',
          ))
        } catch (error) {
          seen.push('probe-error')
        }
      }
      if (seen.length) beacon('sweep-seen', { frames: frames.length, seen })
      // Old module copies may still hold a listener; the shared flag is what silences them.
      SHARED.pickWanted = false
      const killed = []
      for (const frame of frames) {
        try {
          const installed = await frame.executeJavaScript(ARMED_PROBE)
          if (installed !== true && installed !== 'true') continue
          // Call destroy, then tear down whatever it left behind: an instance from an older build
          // can refuse to finish, and its overlay is what keeps drawing boxes.
          await frame.executeJavaScript(
            '(function(){'
            + 'var h=window.__DSH_ELEMENT_REF__;'
            + 'try{if(h&&typeof h.destroy==="function")h.destroy()}catch(e){}'
            + 'var n=document.querySelectorAll("[data-dsh-element-ref]");'
            + 'for(var i=0;i<n.length;i++){if(n[i].parentNode)n[i].parentNode.removeChild(n[i])}'
            + 'try{if(window.__DSH_ELEMENT_REF__)delete window.__DSH_ELEMENT_REF__}catch(e){}'
            + 'return true})()',
          )
          const left = await frame.executeJavaScript(ARMED_PROBE)
          killed.push(left === true || left === 'true' ? 'survived' : 'destroyed')
        } catch (error) {
          killed.push('error:' + String((error && error.message) || error).slice(0, 40))
        }
      }
      if (killed.length) beacon('sweep', { frames: frames.length, results: killed })
      disarmAddressButton()
      return killed
    }

    /** Set by apply(): opens (or focuses) the sidebar browser on the given address. */
    let openBrowserTab = () => {}

    /** Set by the address-row button: puts the icon back to its idle state. */
    let disarmAddressButton = () => {}

    /** Frames already wired to re-inject after their own reloads. */
    const hookedFrames = new WeakSet()

    /**
     * Whether picking is wanted right now, shared across module reloads.
     *
     * A hot update loads a new copy of this module but the old copy keeps its `did-finish-load`
     * listener on the frame — and that listener asks *its own* `pickWanted`, which was true when
     * the round started. Every page load then injected a picker behind the new module's back:
     * highlight boxes with nothing in the log asking for them. The flag lives on `window` so all
     * copies, past and present, read the same answer and the boot sweep can switch them all off.
     */
    const SHARED = SHARED_ROOT
    const pickWantedNow = () => SHARED.pickWanted === true

    function injectPicker(frame, endpoint, why = 'unknown') {
      // Who asked for this? Picking that shows up "on its own" is either one of these paths
      // firing unbidden or something outside this plugin, and the beacon tells them apart.
      beacon('inject', { why })
      if (!frame || typeof frame.executeJavaScript !== 'function') {
        return Promise.reject(new Error('右栏没有可注入的浏览器页'))
      }
      return fetch(endpoint + '/picker.js', { cache: 'no-store' })
        .then((response) => {
          if (!response.ok) throw new Error('picker ' + response.status)
          return response.text()
        })
        .then((source) => {
          const stale = !source.includes('正在批注')
          // The page posts its drafts straight to the host, so it has to know which conversation
          // is asking — otherwise the row lands unowned and every task sees the chip.
          const session = JSON.stringify(visibleSessionId() || '')
          // One-shot marker in front of the source: the picker only installs when a live copy of
          // this module asked for it, so leftover module copies cannot inject behind our back.
          return frame
            .executeJavaScript('window.__DSH_ELEMENT_REF_GO__=true;window.__DSH_ELEMENT_REF_SESSION__=' + session + ';\n' + source + '\n;true')
            .then(() => {
            if (!hookedFrames.has(frame)) {
              hookedFrames.add(frame)
              frame.addEventListener('did-finish-load', () => {
                if (!pickWantedNow()) return
                injectPicker(frame, endpoint, 'page-load').catch(() => {})
              })
            }
            startBridge(frame, endpoint)
            return { stale }
          })
        })
    }

    // ---------------------------------------------------------------- host bridge
    // The picked page is on another origin (often https), so it cannot always post to DSH.
    // The page queues everything in an outbox; this renderer drains it and posts same-origin.
    const PICKER_API = 33
    let bridgeTimer = null
    let bridgeFrame = null
    let bridgeSince = 0

    /** Upgrade a page that still runs an older injected script, but never wipe live pins. */
    async function ensureFreshScript(frame, endpoint) {
      // Only a page the user asked to pick on gets an upgrade: this loop used to re-inject after
      // the picker was closed, which looked like picking turning itself back on.
      if (!pickWantedNow()) return
      if (upgradingScript) return
      try {
        const raw = await frame.executeJavaScript(
          '(window.__DSH_ELEMENT_REF__ && window.__DSH_ELEMENT_REF__.version) || 0',
        )
        const version = Number(raw) || 0
        diag.script = String(version)
        if (version >= PICKER_API) return
        const pinned = await frame.executeJavaScript(
          '(function(){var h=document.querySelector("[data-dsh-element-ref]");'
          + 'return h && h.shadowRoot ? h.shadowRoot.querySelectorAll(".mark").length : 0})()',
        )
        if (Number(pinned) > 0) return // the user is annotating; leave the page alone
        upgradingScript = injectPicker(frame, endpoint, 'upgrade')
          .catch(() => {})
          .then(() => { upgradingScript = null })
      } catch (error) {
        /* page may be navigating */
      }
    }

    function stopBridge() {
      if (bridgeTimer) clearInterval(bridgeTimer)
      if (SHARED.bridgeTimer && SHARED.bridgeTimer !== bridgeTimer) clearInterval(SHARED.bridgeTimer)
      bridgeTimer = null
      SHARED.bridgeTimer = null
      bridgeFrame = null
    }

    function postQueued(entry) {
      if (!entry || !entry.body) return
      const path = entry.kind === 'collect' ? '/collect' : '/draft'
      // 标注归在「拾取发生时的那个对话」名下：之后切到别的任务就看不见它了。
      const owner = visibleSessionId()
      if (owner && !entry.body.session) entry.body.session = owner
      fetch(API + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(entry.body),
      }).catch(() => {})
    }

    async function drainOutbox(frame) {
      const payload = await frame.executeJavaScript(
        '(window.__DSH_ELEMENT_REF__ && typeof window.__DSH_ELEMENT_REF__.drain === "function")'
        + ' ? window.__DSH_ELEMENT_REF__.drain() : "[]"',
      )
      const entries = JSON.parse(payload || '[]')
      if (!Array.isArray(entries)) return
      for (const entry of entries) postQueued(entry)
    }

    /**
     * A freshly attached page must not replay history: the queue may still hold commands from
     * another tab (focus this selector, rewrite that comment), and applying them here only
     * produces a stack of "this element is gone" toasts. Attaching jumps the cursor to the head.
     */
    async function seedCursor() {
      try {
        const response = await fetch(API + '/commands?since=999999999', { cache: 'no-store' })
        if (!response.ok) return
        const data = await response.json()
        bridgeSince = Math.max(bridgeSince, Number(data && data.version) || 0)
      } catch (error) {
        /* the next tick retries */
      }
    }

    async function pushCommands(frame) {
      const response = await fetch(API + '/commands?since=' + bridgeSince, { cache: 'no-store' })
      if (!response.ok) return
      const data = await response.json()
      const list = (data && data.commands) || []
      if (!list.length) return
      for (const command of list) bridgeSince = Math.max(bridgeSince, Number(command.id) || 0)
      const json = JSON.stringify(JSON.stringify(list))
      await frame.executeJavaScript(
        'window.__DSH_ELEMENT_REF__ && window.__DSH_ELEMENT_REF__.applyCommands'
        + ' ? window.__DSH_ELEMENT_REF__.applyCommands(' + json + ') : 0',
      )
    }

    let upgradingScript = null

    /**
     * Ground truth for "my Enter does nothing" reports: records every keydown that reaches the
     * page's window, including the composed path's first node, so we can tell a missing listener
     * from a retargeted one. Read back through the debug endpoint; it is never shown to the user.
     */
    const KEYLOG_SCRIPT = `(function () {
      if (window.__DSH_KEYLOG__) return 'on';
      window.__DSH_KEYLOG__ = [];
      window.addEventListener('keydown', function (event) {
        try {
          var path = event.composedPath ? event.composedPath() : [];
          var first = path[0] || event.target;
          window.__DSH_KEYLOG__.push({
            k: event.key, sh: !!event.shiftKey, comp: !!event.isComposing, code: event.keyCode,
            tag: (first && first.tagName) || '', cls: (first && first.className) || '',
            prevented: !!event.defaultPrevented, depth: path.length,
          });
          if (window.__DSH_KEYLOG__.length > 20) window.__DSH_KEYLOG__.shift();
        } catch (error) { /* never break the page over diagnostics */ }
      }, true);
      return 'on';
    })()`

    let keyLogState = ''
    async function reportKeyLog(frame) {
      try {
        const raw = await frame.executeJavaScript('JSON.stringify((window.__DSH_KEYLOG__ || []).slice(-4))')
        if (typeof raw === 'string' && raw !== keyLogState) {
          keyLogState = raw
          beacon('keylog', { tail: raw })
        }
      } catch (error) {
        /* the page may be navigating */
      }
    }

    /**
     * Pickers older than 11 decide "is Enter inside the bubble?" with `event.target`, which Shadow
     * DOM retargets to the host element — so Enter did nothing there. Upgrading such a page is not
     * an option while the user is annotating (a fresh script drops every pin), so we click the
     * confirm button for them instead. Pickers at 11+ already do this natively; the shim bows out.
     */
    const ENTER_SHIM = `(function () {
      var api = window.__DSH_ELEMENT_REF__;
      if (!api) return '0:no-picker';
      var version = Number(api.version) || 0;
      if (version >= 11) return version + ':native';
      if (window.__DSH_ENTER_SHIM__) return version + ':shimmed';
      window.__DSH_ENTER_SHIM__ = true;
      document.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.defaultPrevented) return;
        var host = document.querySelector('[data-dsh-element-ref]');
        var root = host && host.shadowRoot;
        if (!root) return;
        var input = root.querySelector('.cinput');
        if (!input) return;
        var path = event.composedPath ? event.composedPath() : [];
        if (path.indexOf(input) < 0) return;
        var ok = root.querySelector('.ok');
        if (!ok || ok.disabled) return;
        event.preventDefault();
        event.stopPropagation();
        ok.click();
      }, true);
      return version + ':shimmed';
    })()`

    let shimState = ''
    async function ensureEnterShim(frame) {
      try {
        await frame.executeJavaScript(KEYLOG_SCRIPT)
        const state = await frame.executeJavaScript(ENTER_SHIM)
        if (state !== shimState) {
          shimState = state
          beacon('enter-shim', { state })
        }
        await reportKeyLog(frame)
      } catch (error) {
        /* the page may be navigating */
      }
    }

    function startBridge(frame, endpoint) {
      if (bridgeFrame === frame && bridgeTimer) return
      stopBridge()
      bridgeFrame = frame
      let busy = false
      let ticks = 0
      let seeded = false
      const tick = async () => {
        if (busy || bridgeFrame !== frame || !frame.isConnected) return
        busy = true
        try {
          frame.executeJavaScript('window.__DSH_ELEMENT_REF__ && window.__DSH_ELEMENT_REF__.useHost(true)').catch(() => {})
          if (!seeded) {
            seeded = true
            await seedCursor()
          }
          await drainOutbox(frame)
          await pushCommands(frame)
          ticks += 1
          if (ticks % 4 === 1) {
            await ensureFreshScript(frame, endpoint)
            await ensureEnterShim(frame)
          }
          store.refresh()
        } catch (error) {
          /* the page may be navigating; the next tick retries */
        } finally {
          busy = false
        }
      }
      // The timer lives on the shared object too: a hot update leaves the previous module copy
      // running, and its interval would keep calling ensureFreshScript — injecting pickers on
      // pages nobody asked about. Whoever starts a bridge stops the timer everyone else owns.
      if (SHARED.bridgeTimer) clearInterval(SHARED.bridgeTimer)
      bridgeTimer = setInterval(tick, 700)
      SHARED.bridgeTimer = bridgeTimer
      // Node (the smoke harness) must not be kept alive by the bridge.
      if (bridgeTimer && typeof bridgeTimer.unref === 'function') bridgeTimer.unref()
      tick()
    }

    /** Poll for a visible sidebar browser, e.g. right after asking the pane to open one. */
    function waitForFrame(timeout) {
      return new Promise((resolve) => {
        const started = Date.now()
        const timer = setInterval(() => {
          const found = liveBrowserFrame()
          if (found || Date.now() - started > timeout) {
            clearInterval(timer)
            resolve(found)
          }
        }, 250)
      })
    }

    /** The guest may still be loading: executeJavaScript can reject until it exists. */
    async function injectWithRetry(frame, endpoint, attempts = 6) {
      let lastError = null
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          return await injectPicker(frame, endpoint, 'arm')
        } catch (error) {
          lastError = error
          await new Promise((resolve) => setTimeout(resolve, 400))
        }
      }
      throw lastError || new Error('注入失败')
    }

    function savedUrl() {
      try { return window.localStorage.getItem('dsh.element-ref.url') || '' } catch (error) { return '' }
    }


    /**
     * Seat above the composer: keeps the insert face for its session, and shows the annotations
     * themselves — pencil opens the page's style panel.
     */
    /**
     * Invisible: the composer seat only hands us the insert face (and keeps it fresh).
     * The visible chip row is mounted inside the card by mountDock().
     */
    function InputBridge(props) {
      const sessionId = props.sessionId
      const actions = props.inputActions
      // Capture at render time as well as in the effect: after a hot update the effect of an
      // already-mounted seat never runs again, and the map would stay empty for the new module.
      if (sessionId && actions && inputs.get(sessionId) !== actions) inputs.set(sessionId, actions)
      // A task that has not been named yet has no id: keep its composer reachable anyway, or the
      // send button in a brand-new task has nothing to talk to.
      if (!sessionId && actions) loose.actions = actions
      useEffect(() => {
        if (!sessionId || !actions) return undefined
        inputs.set(sessionId, actions)
        return () => {
          if (inputs.get(sessionId) === actions) inputs.delete(sessionId)
        }
      }, [sessionId, actions])
      beacon('seat', { sessionId: !!sessionId, actions: !!actions })
      diag.seat = 'yes'
      // A marker with the session on it: hidden conversations have hidden markers, which is how
      // the send path tells "the composer I am looking at" from the ones still mounted behind it.
      return h('span', {
        'data-element-ref': 'seat',
        'data-session': String(sessionId || ''),
        style: { display: 'none' },
      })
    }

    /** Which conversation owns the composer on screen. */
    /**
     * The conversation the user is looking at, as `{ key, sessionId }`.
     *
     * `key` is the id when there is one. A brand-new task reports an empty `data-session` until its
     * first message is sent; those picks share one bucket (`new-task`) instead of falling back to
     * the previous conversation — that fallback is exactly why chips used to appear in the old
     * task. `sessionId` stays empty in that case so callers can tell "no id yet" from "id known".
     */
    const NEW_TASK_KEY = 'new-task'

    function visibleOwner() {
      if (typeof document === 'undefined') return { key: '', sessionId: '' }
      const card = onScreenCard()
      let seat = null
      if (card && typeof card.querySelector === 'function') {
        seat = card.querySelector('[data-element-ref="seat"]')
      }
      if (seat && seat.getAttribute) {
        const sessionId = seat.getAttribute('data-session') || ''
        if (sessionId) return { key: sessionId, sessionId }
        return { key: NEW_TASK_KEY, sessionId: '' }
      }
      // The hero composer of a brand-new task renders no session-scoped slot at all, so there is no
      // marker inside the card — and no other marker anywhere either. That is the unnamed task.
      const anySeat = typeof document.querySelectorAll === 'function'
        ? document.querySelectorAll('[data-element-ref="seat"]').length
        : 0
      if (card && anySeat === 0) return { key: NEW_TASK_KEY, sessionId: '' }
      // No marker inside that card (older build, or the card belongs to another app view).
      const fallback = primarySessionId() || ''
      return { key: fallback, sessionId: fallback }
    }

    function visibleSessionId() {
      return visibleOwner().key
    }

    /**
     * Tell the page which conversation is asking: its drafts are posted straight to the host,
     * so the picker needs the owner at post time, not later.
     */
    function syncPageSession() {
      if (typeof allBrowserFrames !== 'function') return
      // The token is what an unnamed task uses, so the page tags its drafts with the same key the
      // dock filters by — a pick made before the first message still lands in this conversation.
      const session = JSON.stringify(visibleSessionId() || '')
      const frames = allBrowserFrames()
      for (let i = 0; i < frames.length; i += 1) {
        try {
          const result = frames[i].executeJavaScript('window.__DSH_ELEMENT_REF_SESSION__=' + session + ';true')
          if (result && typeof result.catch === 'function') result.catch(() => {})
        } catch (error) {
          /* that frame is gone */
        }
      }
    }

    /**
     * The chip row lives INSIDE the composer card (above the text field, never over it).
     * It starts collapsed at zero height: the composer keeps its usual size until the first
     * annotation shows up, then the card grows upward through a max-height transition.
     */
    /** Hover text for a chip: the shortened requirement, exactly like the sent pill. */
    function chipHint(item) {
      const ask = String(item.requirement || item.comment || '').replace(/\s+/g, ' ').trim()
      if (ask) return '标注：' + (ask.length > 120 ? ask.slice(0, 120) + '…' : ask)
      return item.selector || ''
    }

    function DockRow() {
      useStore()
      // Which chip the pointer is on; only that one shows its × (the × floats on the corner,
      // outside the pill, so it never covers the label).
      const [hovered, setHovered] = useState(null)
      // Only the conversation on screen owns its chips: switching tasks swaps the whole row.
      const items = visibleItems(visibleSessionId()).slice().sort(byOrderly)
      const has = items.length > 0
      return h('div', {
        'data-element-ref': 'dock-slot',
        style: {
          // The slot still animates its height, but it must not clip the hover ×: that button
          // sits on the chip's corner, 7px outside the pill. Clipping stays on while the row is
          // collapsed (hiding the chips below zero height), and goes visible once they are in.
          overflow: has ? 'visible' : 'hidden',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          marginTop: has ? 6 : 0,
          opacity: has ? 1 : 0,
          maxHeight: has ? 96 : 0,
          transition: 'max-height 200ms ease, opacity 160ms ease, margin-top 200ms ease',
          pointerEvents: has ? 'auto' : 'none',
        },
      },
        has ? h('div', { style: S.dockWrap },
          // A chip is a label, not a control: it mirrors what will be sent, and a hover answers
          // with the shortened requirement. Hovering also reveals a × on the corner that drops
          // this one annotation — the pin on the page and the row in the host both go away.
          items.map((item) => h('div', {
            key: item.ref,
            style: S.chipWrap,
            onMouseEnter: () => setHovered(item.ref),
            onMouseLeave: () => setHovered((now) => (now === item.ref ? null : now)),
          },
            h('div', { style: S.dockChip, title: chipHint(item) },
              h('span', null, `<${item.tag || 'div'}>`),
              h('span', { style: S.badge }, String(item.order || '')),
            ),
            hovered === item.ref ? h('button', {
              type: 'button',
              'data-element-ref': 'dock-kill',
              style: S.chipKill,
              title: '取消这次修改',
              'aria-label': '取消这次修改',
              onClick: (event) => {
                if (event && typeof event.preventDefault === 'function') event.preventDefault()
                if (event && typeof event.stopPropagation === 'function') event.stopPropagation()
                discardItem(item)
              },
            }, '×') : null,
          )),
        ) : null,
      )
    }

    /**
     * Mounts the chip row as a real child of the composer card, so it sits inside the box.
     * Boot order differs between shells, so a missing card is retried instead of giving up.
     */
    function mountDock() {
      if (typeof document === 'undefined') return () => {}
      let cancelled = false
      let timer = null
      let holder = null
      let root = null
      let owner = visibleSessionId()
      if (!legacySession && owner) legacySession = owner

      const ensure = () => {
        if (cancelled) return
        try {
          // The card of the conversation on screen: a second conversation keeps its own card
          // mounted (hidden), and re-parenting into the wrong one is what made chips look like
          // they belonged to the previous task.
          const card = onScreenCard() || document.querySelector('[data-composer-seat]')
          if (!card) return
          if (!holder) {
            holder = document.createElement('div')
            holder.setAttribute('data-element-ref', 'dock-overlay')
            holder.style.cssText = 'display:flex;flex-direction:column;gap:0;position:relative;flex:none;'
            holder.style.padding = '0 12px'
            root = createRootOf(holder)
            root.render(h(DockRow, null))
            diag.dock = 'yes'
          }
          if (holder.parentNode !== card) card.insertBefore(holder, card.firstChild)
          // Older builds pinned a chip above the card; drop any leftover so only one row remains.
          if (card.parentNode && typeof document.querySelectorAll === 'function') {
            const strays = document.querySelectorAll('[data-element-ref="dock-overlay"]')
            Array.prototype.forEach.call(strays, (node) => {
              if (node === holder) return
              try { if (node.parentNode) node.parentNode.removeChild(node) } catch (error) { /* already gone */ }
            })
          }
        } catch (error) {
          diag.error = String((error && error.message) || error)
          beacon('mount-failed', { message: diag.error })
        }
        // Switching conversations must repaint the row: the new task owns a different set of chips.
        const sid = visibleSessionId()
        if (!legacySession && sid && sid !== NEW_TASK_KEY) legacySession = sid
        if (sid !== owner) {
          owner = sid
          // The first conversation we ever saw adopts the untagged records; later ones must not.
          if (!legacySession && owner && owner !== NEW_TASK_KEY) legacySession = owner
          store.notify()
          beacon('owner', { session: sid ? 'set' : 'none', untagged: !!legacySession, unnamed: sid === NEW_TASK_KEY })
          // The page tags its drafts with the conversation it was told about, so it has to hear
          // about a switch too — otherwise a pick in task B is filed under task A.
          syncPageSession()
        }
        // Once the unnamed task gets a real id (its first message went out), its picks belong to
        // that session — not to a bucket nobody reads. Re-home rather than delete: the send and the
        // rename race, and deleting first is how `element_ref_details` came back empty.
        if (sid && sid !== NEW_TASK_KEY && store.items.some((item) => item && item.session === NEW_TASK_KEY)) {
          postJson('/reassign', { from: NEW_TASK_KEY, to: sid }).then(() => store.refresh())
        }
      }

      ensure()
      timer = setInterval(ensure, 600)
      if (timer && typeof timer.unref === 'function') timer.unref()

      return () => {
        cancelled = true
        if (timer) clearInterval(timer)
        diag.dock = 'no'
        try { if (root) root.unmount() } catch (error) { /* already gone */ }
        if (holder && holder.parentNode) holder.parentNode.removeChild(holder)
      }
    }

    /** The sidebar browser's address row, far right: a cursor icon that arms picking. */
    const PICK_SIZE = 28
    const PICK_GAP = 6

    /**
     * Icon knobs. 图形用的是需求里给的那 4 条 path，原样转写（24×24 viewBox、stroke 2.5）。
     * 渲染 16px 时 2.5 的描边落到屏幕上约 1.67px，跟 28px 的按钮、14px 的邻居图标同一个刻度。
     */
    const GLYPH_SIZE = 16
    const GLYPH_STROKE = 2.5
    /** 保留两个旋钮，方便以后微调；用户版图形不需要偏移，默认 0 / 1。 */
    const GLYPH_SHIFT = { x: 0, y: 0 }
    const GLYPH_POINTER_SCALE = 1

    /**
     * 需求里给的图标，四条 path 一条不改：
     *   三处圆角括号（左上、右上、左下）+ 右下角的鼠标指针三角形。
     * 第四角留空给指针，16px 下才不会糊成一团。
     */
    const GLYPH_PATHS = [
      'M8 4H6C4.895 4 4 4.895 4 6V8',
      'M16 4H18C19.105 4 20 4.895 20 6V8',
      'M4 16V18C4 19.105 4.895 20 6 20H8',
      'M13.5 13.5L19.5 15.5L16.5 16.5L15.5 19.5L13.5 13.5Z',
    ]

    /**
     * Selection frame with a pointer: the usual "pick an element" mark. Three corners plus an
     * outlined cursor (the fourth corner is left open for it), so the pointer never collides with a
     * bracket — which is what made an earlier filled version read as one blob at 16px.
     */
    function cursorGlyph() {
      const ns = 'http://www.w3.org/2000/svg'
      const svg = document.createElementNS(ns, 'svg')
      svg.setAttribute('viewBox', '0 0 24 24')
      svg.setAttribute('width', String(GLYPH_SIZE))
      svg.setAttribute('height', String(GLYPH_SIZE))
      svg.setAttribute('fill', 'none')
      svg.setAttribute('stroke', 'currentColor')
      svg.setAttribute('stroke-width', String(GLYPH_STROKE))
      svg.setAttribute('stroke-linecap', 'round')
      svg.setAttribute('stroke-linejoin', 'round')
      svg.style.display = 'block'
      // Pin the box in inline style: page stylesheets (svg { width: 100% }) would otherwise stretch
      // the glyph to the whole button and make it read as a blob at 28px.
      svg.style.width = GLYPH_SIZE + 'px'
      svg.style.height = GLYPH_SIZE + 'px'
      svg.style.flex = 'none'
      for (let index = 0; index < GLYPH_PATHS.length; index += 1) {
        const path = document.createElementNS(ns, 'path')
        path.setAttribute('d', GLYPH_PATHS[index])
        // 指针是最后一条：只有它需要按比例微调，括号跟着 viewBox 走。
        if (index === GLYPH_PATHS.length - 1 && GLYPH_POINTER_SCALE !== 1) {
          path.setAttribute('transform', `translate(12.6 11) scale(${GLYPH_POINTER_SCALE}) translate(-12.6 -11)`)
        }
        svg.appendChild(path)
      }
      return svg
    }

    /**
     * Mount the cursor icon inside the sidebar browser's address row.
     *
     * That row is already a flex line — [back][forward][reload][address field][open ↗] — so the
     * icon goes in as a real flex child right after the address field. The field is
     * `flex: auto; min-width: 0`, so it simply gives up 28px and the icon can never overlap the
     * nav buttons or the ↗, at any pane width. (Pinning it with `position: fixed` is what forces
     * overlap, and is why this used to reserve left padding on the row instead.)
     *
     * React owns the row and re-renders it (the sandbox button is conditional), which drops our
     * node, so a MutationObserver puts it back. Nothing here reads geometry.
     */
    function installPickButton() {
      const noop = () => {}
      if (typeof document === 'undefined' || !document.body) return noop
      if (typeof document.createElement !== 'function') return noop

      // One-time capability probe: a screenshot of a picked picture is only possible if this
      // renderer's <webview> exposes capturePage. Knowing it up front beats a silent no-op.
      if (!captureProbed) {
        captureProbed = true
        const probe = allBrowserFrames()[0]
        beacon('capture', { api: typeof (probe && probe.capturePage) })
      }
      // A hot reload can install this twice; two icons in one row would each own their own
      // armed flag, and clicking one would leave the other picking.
      const stale = document.querySelectorAll('[data-element-ref="toolbar"]')
      for (let i = 0; i < stale.length; i += 1) {
        if (stale[i].parentNode) stale[i].parentNode.removeChild(stale[i])
      }
      const staleNotes = document.querySelectorAll('[data-element-ref="toolbar-note"]')
      for (let i = 0; i < staleNotes.length; i += 1) {
        if (staleNotes[i].parentNode) staleNotes[i].parentNode.removeChild(staleNotes[i])
      }

      const button = document.createElement('button')
      button.type = 'button'
      button.setAttribute('data-element-ref', 'toolbar')
      button.setAttribute('aria-label', '点选元素')
      button.title = '点选元素：只改这一处'
      Object.assign(button.style, {
        width: PICK_SIZE + 'px',
        height: PICK_SIZE + 'px',
        flex: 'none',
        padding: '0',
        margin: '0',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '0',
        borderRadius: 'var(--dsw-radius-sm, 6px)',
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary, #666)',
        cursor: 'pointer',
        transition: 'background 120ms ease, color 120ms ease, box-shadow 120ms ease',
      })
      button.appendChild(cursorGlyph())

      // Feedback stays a floating tooltip: it must not take a slot in the row.
      const note = document.createElement('span')
      note.setAttribute('data-element-ref', 'toolbar-note')
      Object.assign(note.style, {
        position: 'fixed',
        zIndex: '70',
        display: 'none',
        padding: '3px 8px',
        borderRadius: '6px',
        whiteSpace: 'nowrap',
        fontSize: '11px',
        lineHeight: '1.4',
        pointerEvents: 'none',
        background: 'var(--dsw-alias-bg-layer-1, #fff)',
        color: 'var(--dsw-alias-label-secondary, #666)',
        border: '.5px solid var(--dsw-alias-border-l3, rgba(0,0,0,.12))',
        boxShadow: '0 2px 8px rgba(0,0,0,.12)',
      })
      document.body.appendChild(note)

      let busy = false
      let flash = 0
      let armed = false

      /** Reflect picking state on the icon; the same flag decides whether a reload re-injects. */
      const setArmed = (on) => {
        armed = on
        SHARED.pickWanted = on === true
        button.setAttribute('aria-pressed', on ? 'true' : 'false')
        button.title = on ? '点选已开启，再点一次退出（页面里 Esc 也能退出）' : '点选元素：只改这一处'
        button.style.background = on ? '#1890ff' : 'transparent'
        button.style.color = on ? '#fff' : 'var(--dsw-alias-label-secondary, #666)'
        button.style.boxShadow = on ? '0 0 0 3px rgba(24,144,255,.18)' : 'none'
      }

      disarmAddressButton = () => setArmed(false)

      button.addEventListener('mouseenter', () => {
        if (!armed) button.style.background = 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.14))'
      })
      button.addEventListener('mouseleave', () => {
        if (!armed) button.style.background = 'transparent'
      })

      /**
       * Find the address row: the toolbar that owns the URL input. CSS modules keep the trailing
       * `_toolbar` segment across builds (only the hash prefix changes), so match on it.
       */
      /**
       * A row counts only while it is on screen. The sidebar keeps one row per tab and hides
       * the inactive ones, so matching the first row in the DOM used to park the icon in a
       * hidden tab: the visible tab then looked like it had no button at all.
       */
      const shown = (el) => {
        if (!el || el.isConnected === false) return false
        const rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null
        return !!rect && rect.width > 0 && rect.height > 0
      }

      const findRow = () => {
        if (typeof document.querySelectorAll !== 'function') return null
        let rows = null
        try {
          rows = document.querySelectorAll('[class*="toolbar"]')
        } catch (error) {
          return null
        }
        if (!rows) return null
        let fallback = null
        for (let index = 0; index < rows.length; index += 1) {
          const row = rows[index]
          if (!row) continue
          const input = typeof row.querySelector === 'function' ? row.querySelector('input') : null
          if (!input) continue
          if (shown(row) && shown(input)) return { row, input }
          if (!fallback) fallback = { row, input }
        }
        return fallback
      }

      /** Put the icon right after the field's wrapper, which is a direct child of the row. */
      const mount = () => {
        const found = findRow()
        if (!found) return false
        const { row, input } = found
        let box = input
        for (let depth = 0; depth < 8 && box.parentNode && box.parentNode !== row; depth += 1) {
          box = box.parentNode
        }
        if (box.parentNode !== row) return false
        const next = box.nextElementSibling !== undefined ? box.nextElementSibling : box.nextSibling
        const placed = button.parentNode === row && (next === button || button.previousSibling === box)
        if (!placed) row.insertBefore(button, next || null)
        return true
      }

      mount()

      /**
       * 运行态自证：把"到底看见了什么"发回 host（GET /element-ref/debug）。
       * 按钮不出现时不用再靠猜 —— 这里能分清是"没找到行"、"找到了但插不进去"，
       * 还是"插进去了却被 React 重排顶掉"；找不到行时还会带上候选类名。
       */
      const report = () => {
        const found = findRow()
        const candidates = []
        let totalRows = 0
        let visibleRows = 0
        if (typeof document.querySelectorAll === 'function') {
          let rows = null
          try { rows = document.querySelectorAll('[class*="toolbar"]') } catch (error) { rows = null }
          totalRows = rows ? rows.length : 0
          for (let index = 0; rows && index < rows.length && index < 6; index += 1) {
            const el = rows[index]
            if (!el) continue
            if (shown(el)) visibleRows += 1
            candidates.push({
              tag: String(el.tagName || '').toLowerCase(),
              cls: String(el.className || '').slice(0, 90),
              kids: el.children ? el.children.length : 0,
              shown: shown(el),
              hasInput: !!(el.querySelector && el.querySelector('input')),
            })
          }
        }
        const key = [!!found, found ? String(found.row.className || '') : '', button.parentNode !== null, totalRows, visibleRows].join('|')
        if (key === lastReport) return
        lastReport = key
        beacon('row', {
          found: !!found,
          rowClass: found ? String(found.row.className || '').slice(0, 90) : null,
          mounted: button.parentNode !== null,
          rows: totalRows,
          visibleRows,
          candidates,
        })
      }
      let lastReport = ''
      report()

      let pending = 0
      let lastSweep = 0
      const schedule = () => {
        if (pending) return
        pending = setTimeout(() => {
          pending = 0
          mount()
          report()
          // Keep the Enter shortcut working on pickers installed by an older build, even before
          // the user starts a new picking round.
          const frame = bridgeFrame || liveBrowserFrame()
          if (frame) ensureEnterShim(frame)
          // A tab that shows up later can arrive still armed from an older session. Nothing in
          // this round asked for picking, so take it down — at most every few seconds.
          if (!pickWantedNow() && Date.now() - lastSweep > 4000) {
            lastSweep = Date.now()
            sweepStalePickers().catch(() => {})
          }
        }, 50)
      }

      let observer = null
      if (typeof MutationObserver === 'function') {
        try {
          observer = new MutationObserver(schedule)
          observer.observe(document.body, { childList: true, subtree: true })
        } catch (error) {
          observer = null
        }
      }
      // Cheap safety net: the pane can be re-created without a mutation we subscribe to.
      const timer = setInterval(schedule, 1000)

      const say = (text) => {
        note.textContent = text
        try {
          const box = button.getBoundingClientRect()
          note.style.left = Math.round(box.left) + 'px'
          note.style.top = Math.round(box.bottom + 6) + 'px'
        } catch (error) { /* keep the last position */ }
        note.style.display = 'inline-block'
        clearTimeout(flash)
        flash = setTimeout(() => { note.style.display = 'none' }, 2800)
      }

      /**
       * Turn picking off everywhere.
       *
       * The old toggle asked one frame "are you armed?" and, when the answer was no, injected a
       * picker — so pressing the button to stop could start a round on another tab instead. The
       * button is the switch now: turning off disarms every frame and never injects anything.
       * Each frame's outcome is reported, because a silently rejected executeJavaScript is
       * exactly how the page kept picking while the icon said it was off.
       */
      /**
       * Stop a round the user walked away from.
       *
       * Pressing the switch off means "I am done with this round": the chips that were never sent
       * are part of a batch that will not happen, so they must leave the composer with the same
       * sweep as the panel's ✕. Rows already sent stay untouched — the model may be reading them.
       */
      const dropAbandonedRound = async () => {
        const pending = visibleItems(visibleSessionId()).filter((item) => item && !item.spent)
        if (pending.length === 0) return 0
        beacon('round-dropped', { chips: pending.length })
        // Only the host rows: the page's own marks go away with the picker itself (destroy() clears
        // them), so this never injects a script just to tidy up a round nobody will send.
        try { await postJson('/clear', {}) } catch (error) { /* the rows are gone either way */ }
        await store.refresh()
        return pending.length
      }

      const disarmPicker = async (tell) => {        setArmed(false)
        stopBridge()
        const frames = allBrowserFrames()
        const results = []
        for (const frame of frames) {
          let outcome = 'absent'
          try {
            const answer = await frame.executeJavaScript(
              'window.__DSH_ELEMENT_REF__ && window.__DSH_ELEMENT_REF__.destroy'
              + ' ? (window.__DSH_ELEMENT_REF__.destroy(), "destroyed") : "absent"',
            )
            outcome = String(answer)
            // Destroy is best effort inside the page: confirm rather than assume. A handle that
            // is no longer installed is harmless, so ask about the running state, not existence.
            const left = await frame.executeJavaScript(ARMED_PROBE)
            if (left === true || left === 'true') outcome = 'survived'
          } catch (error) {
            outcome = 'error:' + String((error && error.message) || error).slice(0, 60)
          }
          results.push(outcome)
        }
        beacon('disarm', { frames: results.length, results })
        if (tell) say('已退出点选')
        return results.every((row) => row === 'absent' || row === 'destroyed')
      }

      /**
       * Is any sidebar page still *running* a picker, whatever our own flag believes?
       * A handle left by a failed shutdown proves nothing, so ask the frame whether picking is
       * live; older pickers have no such field and count as live (see ARMED_PROBE).
       */
      const anyFrameArmed = async () => {
        const frames = allBrowserFrames()
        for (const frame of frames) {
          try {
            const value = await frame.executeJavaScript(ARMED_PROBE)
            if (value === true || value === 'true') return true
          } catch (error) {
            /* the guest may be navigating */
          }
        }
        return false
      }

      const arm = async () => {
        if (busy) return
        busy = true
        button.style.opacity = '0.5'
        try {
          // Our own state decides the direction of a click; the page is brought in line after.
          // Turning the switch off ends the round: chips that were never sent belong to a round the
          // user just walked away from. Already-sent rows stay, because the model may still be
          // reading them through the tool.
          if (pickWantedNow()) {
            beacon('arm', { path: 'stop-by-flag' })
            await disarmPicker(true)
            await dropAbandonedRound()
            return
          }
          // A picker outlives our flag whenever a probe raced a reload. If the page is already
          // picking, this press means "stop" — injecting here is what started it again.
          if (await anyFrameArmed()) {
            beacon('arm', { path: 'stop-by-page' })
            await disarmPicker(true)
            await dropAbandonedRound()
            return
          }
          let frame = liveBrowserFrame()
          if (!frame) {
            openBrowserTab(savedUrl())
            frame = await waitForFrame(10000)
          }
          if (!frame) {
            beacon('arm', { path: 'no-frame' })
            say('先打开右栏浏览器')
            return
          }
          beacon('arm', { path: 'inject' })
          const result = await injectWithRetry(frame, API)
          setArmed(true)
          say(result && result.stale ? '已开启（重启应用后可写要求）' : '在页面里点元素')
        } catch (error) {
          say('注入失败：' + (error && error.message ? error.message : '未知'))
        } finally {
          busy = false
          button.style.opacity = '1'
        }
      }

      button.addEventListener('click', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault()
        arm()
      })

      // Esc in the page closes the picker without telling us; this keeps the icon honest.
      // It asks every tab, not just the one we happen to look at: a single wrong probe used to
      // grey the icon while the page kept picking.
      const syncTimer = setInterval(async () => {
        if (!armed || busy) return
        if (!(await anyFrameArmed())) setArmed(false)
      }, 2000)

      return () => {
        observer && observer.disconnect()
        clearInterval(timer)
        clearInterval(syncTimer)
        clearTimeout(flash)
        clearTimeout(pending)
        if (button.parentNode) button.parentNode.removeChild(button)
        if (note.parentNode) note.parentNode.removeChild(note)
      }
    }

    let applied = null

    return {
      inject: ['slots', 'sidebarRight', 'uiConversation'],
      /**
       * Prompt assembly is the part a bug report can point at without any UI around it, so the
       * smoke test builds messages straight from here instead of driving the (stateful) docks.
       */
      __test: { buildPrompt, buildFinalPrompt, readDraftText },
      apply(ctx) {
        if (ctx === applied) return
        applied = ctx
        bootProbe('apply', ctx)
        setTimeout(() => bootProbe('late', ctx), 6000)
        // A page keeps whatever script was injected into it long after this module reloads, and
        // the button's own flag starts at "off" every time. Left alone, that mismatch is what
        // makes picking look like it turns itself on: the page is still armed while the icon says
        // it is not. Nothing in this session asked for picking, so take it down once at boot.
        setTimeout(() => { sweepStalePickers().catch(() => {}) }, 800)

        openBrowserTab = (address) => {
          const open = (options) => ctx.sidebarRight.openTab('browser', { destination: 'sidebar', ...options })
          try {
            if (address) open({ params: { url: address } })
            else open({})
          } catch (error) {
            console.warn('[element-ref] cannot open the sidebar browser', error)
            try {
              open({})
            } catch (fallback) {
              console.warn('[element-ref] the sidebar browser page type is not available', fallback)
            }
          }
        }

        // Composer: the seat only captures the insert face; the chips are mounted in the card.
        ctx.effect(() => ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: ID,
          order: 40,
        }, InputBridge)), 'element-ref: composer bridge')

        // Transcript: our wire markers become real blocks, so a card and the sentence below it sit
        // on separate lines inside one message (a markdown quote cannot do that — see handleSend).
        ctx.effect(() => {
          const conversation = ctx.uiConversation
          if (!conversation || !conversation.userText || typeof conversation.userText.register !== 'function') return
          return conversation.userText.register(CARD_RULE)
        }, 'element-ref: transcript rule')

        ctx.effect(() => ctx.slots.inject('conversation.user.text.node', () => ctx.slots.register({
          name: 'conversation.user.text.node',
          key: 'element-ref',
          priority: 120,
        }, ElementRefCard)), 'element-ref: transcript card')

        ctx.effect(() => installPickButton(), 'element-ref: toolbar pick')

        // Chips live inside the composer card, above the text field (never over it).
        ctx.effect(() => mountDock(), 'element-ref: composer chips')
    ctx.effect(() => installSendBridge(), 'element-ref: composer send bridge')

        beacon('apply', { seats: true })
      },
    }
  },
})
