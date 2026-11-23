/**
 * Client half: a floating DeepSeek whale in `shell.overlay`.
 *
 * The whale is the button: it floats, swims, blinks, and drags anywhere on the
 * frame. Clicking it opens the version tree, which reads the Host half through
 * `/__dsh-version-bubble/`.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-version-bubble',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const API = '/__dsh-version-bubble/'
    const POS_KEY = 'dsh.version-bubble.pos.v1'
    const PANEL_W = 376

    const CSS = [
      '.vwb-root{position:fixed;z-index:2147483000;pointer-events:auto;touch-action:none;font-family:inherit}',
      '.vwb-anchor{position:relative;width:70px;height:56px;display:flex;align-items:center;justify-content:center;cursor:grab;outline:none}',
      '.vwb-anchor:active{cursor:grabbing}',
      '.vwb-anchor:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary);border-radius:50%}',
      '.vwb-halo{position:absolute;left:50%;top:50%;width:84px;height:84px;margin:-42px 0 0 -42px;border-radius:50%;',
      'background:radial-gradient(circle,rgba(77,107,254,.24),rgba(77,107,254,0) 68%);pointer-events:none;transition:opacity .2s ease}',
      '.vwb-anchor:hover .vwb-halo{background:radial-gradient(circle,rgba(77,107,254,.34),rgba(77,107,254,0) 70%)}',
      '.vwb-whale{display:block;pointer-events:none;filter:drop-shadow(0 8px 16px rgba(28,46,150,.30))}',
      '.vwb-float{animation:vwb-float 3.6s ease-in-out infinite}',
      '.vwb-tail{animation:vwb-tail 2.4s ease-in-out infinite;transform-origin:27px 30px}',
      '.vwb-eye{animation:vwb-blink 8s linear infinite;transform-origin:60px 26px}',
      '.vwb-hop{animation:vwb-hop .85s ease}',
      '.vwb-bub{animation:vwb-bub 4.2s ease-in-out infinite}',
      '.vwb-bub--2{animation-delay:.5s}',
      '.vwb-bub--3{animation-delay:1.1s}',
      '.vwb-anchor:hover .vwb-float{animation-duration:2.4s}',
      '.vwb-anchor:hover .vwb-tail{animation-duration:1.1s}',
      '.vwb-badge{position:absolute;right:6px;bottom:6px;width:10px;height:10px;border-radius:50%;',
      'background:#FF8A3D;box-shadow:0 0 0 2px rgba(255,255,255,.9);animation:vwb-pulse 2.6s ease-in-out infinite}',
      '@keyframes vwb-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.5px)}}',
      '@keyframes vwb-tail{0%,100%{transform:rotate(0deg)}50%{transform:rotate(6deg)}}',
      '@keyframes vwb-blink{0%,95%,100%{transform:scaleY(1)}97%{transform:scaleY(.12)}}',
      '@keyframes vwb-hop{0%{transform:translateY(0) rotate(0)}28%{transform:translateY(-11px) rotate(-7deg)}',
      '58%{transform:translateY(1px) rotate(2deg)}100%{transform:translateY(0) rotate(0)}}',
      '@keyframes vwb-bub{0%{transform:translateY(2px);opacity:0}30%{opacity:.75}100%{transform:translateY(-9px);opacity:0}}',
      '@keyframes vwb-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(.82);opacity:.75}}',
      '@keyframes vwb-pop{from{opacity:0;transform:translateY(6px) scale(.985)}to{opacity:1;transform:none}}',
      '.vwb-panel{position:absolute;width:' + PANEL_W + 'px;display:flex;flex-direction:column;overflow:hidden;',
      'background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);border-radius:16px;',
      'box-shadow:0 20px 52px rgba(12,22,58,.26);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5;',
      'animation:vwb-pop .18s ease-out}',
      '.vwb-head{display:flex;align-items:center;gap:8px;padding:12px 12px 12px 14px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.vwb-title{font-weight:600;font-size:13px;letter-spacing:.2px}',
      '.vwb-ver{font-size:11px;padding:1px 7px;border-radius:999px;background:rgba(77,107,254,.14);color:var(--dsw-alias-brand-primary);font-weight:600}',
      '.vwb-grow{flex:1}',
      '.vwb-icon{width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border:none;',
      'background:transparent;color:var(--dsw-alias-label-secondary);border-radius:7px;cursor:pointer;font-size:15px;line-height:1}',
      '.vwb-icon:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.vwb-dirty{display:flex;align-items:center;gap:8px;padding:8px 14px;font-size:12px;',
      'background:rgba(255,138,61,.12);border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.vwb-err{padding:8px 14px;font-size:12px;color:var(--dsw-alias-state-error-primary);',
      'background:rgba(220,60,60,.09);border-bottom:1px solid var(--dsw-alias-border-l1);word-break:break-word}',
      '.vwb-toast{padding:7px 14px;font-size:12px;color:var(--dsw-alias-state-success-primary);',
      'border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.vwb-list{position:relative;overflow-y:auto;padding:2px 0 6px}',
      '.vwb-list::before{content:"";position:absolute;left:19px;top:10px;bottom:10px;width:1px;background:var(--dsw-alias-border-l1)}',
      '.vwb-day{position:sticky;top:0;z-index:1;padding:8px 14px 4px;font-size:11px;letter-spacing:.4px;',
      'color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-overlay)}',
      '.vwb-row{position:relative;display:flex;gap:10px;padding:7px 14px 7px 34px;cursor:pointer;align-items:flex-start}',
      '.vwb-row:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.vwb-row--on{background:rgba(77,107,254,.10)}',
      '.vwb-dot{position:absolute;left:15px;top:12px;width:9px;height:9px;border-radius:50%;',
      'background:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px rgba(77,107,254,.16)}',
      '.vwb-dot--old{background:var(--dsw-alias-label-secondary);box-shadow:0 0 0 3px rgba(120,130,150,.14)}',
      '.vwb-clock{font-variant-numeric:tabular-nums;font-size:11px;color:var(--dsw-alias-label-secondary);min-width:38px;padding-top:2px}',
      '.vwb-subject{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px}',
      '.vwb-num{font-size:11px;color:var(--dsw-alias-label-secondary);padding-top:2px}',
      '.vwb-empty{padding:26px 18px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:12.5px}',
      '.vwb-foot{display:flex;align-items:center;gap:8px;padding:9px 14px;border-top:1px solid var(--dsw-alias-border-l1);',
      'font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.vwb-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left}',
      '.vwb-btn{display:inline-flex;align-items:center;justify-content:center;height:28px;padding:0 12px;border-radius:8px;',
      'border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);',
      'font-size:12px;font-family:inherit;cursor:pointer;white-space:nowrap}',
      '.vwb-btn:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.vwb-btn--primary{background:var(--dsw-alias-brand-primary);border-color:transparent;color:#fff}',
      '.vwb-btn--primary:hover{filter:brightness(1.06)}',
      '.vwb-btn[disabled]{opacity:.5;cursor:default}',
      '.vwb-detail{padding:14px;display:flex;flex-direction:column;gap:10px;overflow-y:auto}',
      '.vwb-detail-subject{font-size:14px;font-weight:600;line-height:1.45;word-break:break-word}',
      '.vwb-meta{font-size:11.5px;color:var(--dsw-alias-label-secondary)}',
      '.vwb-back{border:none;background:transparent;color:var(--dsw-alias-brand-primary);font-size:12px;',
      'cursor:pointer;padding:0;font-family:inherit}',
      '.vwb-note{font-size:11px;color:var(--dsw-alias-label-secondary);line-height:1.6}',
      '.vwb-points{display:flex;flex-direction:column;gap:6px}',
      '.vwb-point{display:flex;gap:8px;align-items:flex-start;font-size:12.5px;line-height:1.55}',
      '.vwb-kind{flex:none;margin-top:1px;font-size:10.5px;padding:1px 6px;border-radius:999px;',
      'background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}',
      '.vwb-point-text{flex:1;min-width:0;word-break:break-word}',
      '.vwb-files{display:flex;flex-direction:column;gap:3px;font-size:11.5px;color:var(--dsw-alias-label-secondary)}',
      '.vwb-file{display:flex;gap:10px;justify-content:space-between}',
      '.vwb-file-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.vwb-file-stat{flex:none;font-variant-numeric:tabular-nums}',
      '.vwb-confirm{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px;',
      'background:var(--dsw-alias-bg-layer-2);display:flex;flex-direction:column;gap:8px}',
      '.vwb-confirm-text{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary)}',
      '@media (prefers-reduced-motion: reduce){.vwb-float,.vwb-tail,.vwb-eye,.vwb-hop,.vwb-bub,.vwb-badge{animation:none !important}}',
    ].join('\n')

    function pad2(value) {
      return value < 10 ? '0' + value : '' + value
    }

    function clockOf(seconds) {
      const date = new Date(seconds * 1000)
      return pad2(date.getHours()) + ':' + pad2(date.getMinutes())
    }

    function dayOf(seconds) {
      const date = new Date(seconds * 1000)
      return date.getFullYear() + '/' + date.getMonth() + '/' + date.getDate()
    }

    function dayLabel(seconds) {
      const date = new Date(seconds * 1000)
      const now = new Date()
      const same = function (a, b) {
        return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
      }
      if (same(date, now)) return '今天'
      const yesterday = new Date(now.getTime() - 86400000)
      if (same(date, yesterday)) return '昨天'
      return date.getMonth() + 1 + ' 月 ' + date.getDate() + ' 日'
    }

    function fullTime(seconds) {
      const date = new Date(seconds * 1000)
      return (
        date.getFullYear() +
        '-' +
        pad2(date.getMonth() + 1) +
        '-' +
        pad2(date.getDate()) +
        ' ' +
        pad2(date.getHours()) +
        ':' +
        pad2(date.getMinutes())
      )
    }

    function readPos() {
      const fallback = {
        x: Math.max(12, window.innerWidth - 96),
        y: Math.max(12, window.innerHeight - 104),
      }
      try {
        const raw = window.localStorage.getItem(POS_KEY)
        if (raw === null) return fallback
        const parsed = JSON.parse(raw)
        if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return fallback
        return {
          x: Math.min(Math.max(8, parsed.x), Math.max(8, window.innerWidth - 78)),
          y: Math.min(Math.max(8, parsed.y), Math.max(8, window.innerHeight - 64)),
        }
      } catch {
        return fallback
      }
    }

    function savePos(pos) {
      try {
        window.localStorage.setItem(POS_KEY, JSON.stringify(pos))
      } catch {
        /* storage unavailable: position lasts for this page only */
      }
    }

    function Whale(props) {
      const children = [
        h('path', {
          key: 'tail',
          className: 'vwb-tail',
          d: 'M27 30 C20 27.5 13 21.5 5 17.5 C9 25 9 35 5 42.5 C13 38.5 20 32.5 27 30 Z',
          fill: 'url(#vwbFin)',
        }),
        h('path', {
          key: 'body',
          d: 'M22 30 C22 19 33 12 47 12 C61 12 72 19 72 30 C72 40 60 46 46 46 C31 46 22 40 22 30 Z',
          fill: 'url(#vwbBody)',
        }),
        h('path', {
          key: 'belly',
          d: 'M32 38 C40 45 58 45 66 37 C60 44 46 47.5 37 43.5 C34 42 32.5 40 32 38 Z',
          fill: '#FFFFFF',
          opacity: 0.2,
        }),
        h('ellipse', {
          key: 'sheen',
          cx: 52,
          cy: 19,
          rx: 11,
          ry: 4,
          fill: '#FFFFFF',
          opacity: 0.22,
          transform: 'rotate(-12 52 19)',
        }),
        h('path', {
          key: 'mouth',
          d: 'M63 33 q5 2.5 8 0.5',
          fill: 'none',
          stroke: '#0B1740',
          strokeOpacity: 0.32,
          strokeWidth: 1.5,
          strokeLinecap: 'round',
        }),
        h('circle', { key: 'eye', className: 'vwb-eye', cx: 60, cy: 26, r: 2.2, fill: '#0B1740' }),
        h('circle', { key: 'b1', className: 'vwb-bub', cx: 67, cy: 8, r: 2, fill: '#7E9AFF', opacity: 0.8 }),
        h('circle', { key: 'b2', className: 'vwb-bub vwb-bub--2', cx: 72, cy: 5, r: 1.5, fill: '#7E9AFF', opacity: 0.7 }),
        h('circle', { key: 'b3', className: 'vwb-bub vwb-bub--3', cx: 62, cy: 5, r: 1.2, fill: '#7E9AFF', opacity: 0.6 }),
      ]
      return h(
        'svg',
        {
          className: 'vwb-whale',
          viewBox: '0 0 76 56',
          width: 70,
          height: 52,
          role: 'img',
          'aria-label': '版本气泡',
        },
        h(
          'defs',
          null,
          h(
            'linearGradient',
            { id: 'vwbBody', x1: '0', y1: '0', x2: '0.35', y2: '1' },
            h('stop', { offset: '0', stopColor: '#7E9AFF' }),
            h('stop', { offset: '0.55', stopColor: '#4D6BFE' }),
            h('stop', { offset: '1', stopColor: '#2740C8' }),
          ),
          h(
            'linearGradient',
            { id: 'vwbFin', x1: '0', y1: '0', x2: '1', y2: '1' },
            h('stop', { offset: '0', stopColor: '#5E7DFF' }),
            h('stop', { offset: '1', stopColor: '#2B3FD1' }),
          ),
        ),
        h(
          'g',
          { className: 'vwb-float' },
          h('g', { key: 'hop-' + props.hop, className: props.hop > 0 ? 'vwb-hop' : undefined }, children),
        ),
      )
    }

    /** Stable selector: a fresh closure each render can retrigger snapshot subscriptions. */
    function IDENTITY(state) {
      return state
    }

    /** The directory of the Session the main view is showing: the project the user is in right now. */
    function mainProjectOf(state) {
      if (state === null || typeof state !== 'object') return ''
      const byId = state.byId
      if (byId === null || typeof byId !== 'object') return ''
      let bestDir = ''
      let bestScore = 0
      for (const id of Object.keys(byId)) {
        const session = byId[id]
        if (session === null || typeof session !== 'object') continue
        const retained = session.retainedBy
        const score =
          retained !== null && typeof retained === 'object' && typeof retained.mainView === 'number'
            ? retained.mainView
            : 0
        if (score <= bestScore) continue
        if (typeof session.cwd !== 'string' || session.cwd === '') continue
        bestScore = score
        bestDir = session.cwd
      }
      return bestDir
    }

    function VersionBubble(props) {
      const [pos, setPos] = React.useState(readPos)
      const [open, setOpen] = React.useState(false)
      const [data, setData] = React.useState(null)
      const [error, setError] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [selected, setSelected] = React.useState(null)
      const [toast, setToast] = React.useState('')
      const [hop, setHop] = React.useState(0)
      const [override, setOverride] = React.useState('')
      const [picking, setPicking] = React.useState(false)
      const [spaces, setSpaces] = React.useState([])
      const [noteData, setNoteData] = React.useState(null)
      const [noteLoading, setNoteLoading] = React.useState(false)
      const [confirmRestore, setConfirmRestore] = React.useState(false)
      const rootRef = React.useRef(null)
      const dragRef = React.useRef(null)
      const posRef = React.useRef(pos)
      posRef.current = pos

      const sessionState = typeof props.useSessions === 'function' ? props.useSessions(IDENTITY) : null
      const liveDir = mainProjectOf(sessionState)
      const projectDir = override !== '' ? override : liveDir

      const request = React.useCallback(
        async function (action, payload) {
          const suffix = projectDir !== '' ? '?dir=' + encodeURIComponent(projectDir) : ''
          const init =
            payload === undefined
              ? { headers: { accept: 'application/json' } }
              : {
                  method: 'POST',
                  headers: { 'content-type': 'application/json', accept: 'application/json' },
                  body: JSON.stringify(payload),
                }
          const response = await fetch(API + action + suffix, init)
          const json = await response.json()
          if (!json || json.ok !== true) throw new Error((json && json.error) || '读取版本信息失败')
          return json
        },
        [projectDir],
      )

      const refresh = React.useCallback(
        async function () {
          if (projectDir === '') {
            setData(null)
            setError('')
            return
          }
          try {
            const next = await request('state')
            setData(next)
            setError('')
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught))
          }
        },
        [projectDir, request],
      )

      React.useEffect(() => {
        setSelected(null)
        setData(null)
        refresh()
      }, [projectDir, refresh])

      React.useEffect(() => {
        if (selected === null) {
          setNoteData(null)
          setNoteLoading(false)
          setConfirmRestore(false)
          return undefined
        }
        let alive = true
        setNoteData(null)
        setNoteLoading(true)
        setConfirmRestore(false)
        request('note', { sha: selected.sha })
          .then(function (result) {
            if (!alive) return
            setNoteData(result)
            setNoteLoading(false)
          })
          .catch(function (caught) {
            if (!alive) return
            setNoteLoading(false)
            setError(caught instanceof Error ? caught.message : String(caught))
          })
        return function () {
          alive = false
        }
      }, [selected, request])

      React.useEffect(() => {
        if (!open) return undefined
        const timer = window.setInterval(refresh, 8000)
        return function () {
          window.clearInterval(timer)
        }
      }, [open, refresh])

      React.useEffect(() => {
        if (toast === '') return undefined
        const timer = window.setTimeout(function () {
          setToast('')
        }, 2600)
        return function () {
          window.clearTimeout(timer)
        }
      }, [toast])

      React.useEffect(() => {
        if (!open) return undefined
        function onKey(event) {
          if (event.key === 'Escape') {
            setSelected(null)
            setOpen(false)
          }
        }
        function onDown(event) {
          const node = rootRef.current
          if (node !== null && !node.contains(event.target)) {
            setSelected(null)
            setOpen(false)
          }
        }
        window.addEventListener('keydown', onKey)
        document.addEventListener('pointerdown', onDown, true)
        return function () {
          window.removeEventListener('keydown', onKey)
          document.removeEventListener('pointerdown', onDown, true)
        }
      }, [open])

      React.useEffect(() => {
        function onResize() {
          setPos(function (current) {
            const x = Math.min(Math.max(8, current.x), Math.max(8, window.innerWidth - 78))
            const y = Math.min(Math.max(8, current.y), Math.max(8, window.innerHeight - 64))
            return x === current.x && y === current.y ? current : { x: x, y: y }
          })
        }
        window.addEventListener('resize', onResize)
        return function () {
          window.removeEventListener('resize', onResize)
        }
      }, [])

      async function act(action, payload) {
        setBusy(true)
        setError('')
        try {
          const result = await request(action, payload === undefined ? {} : payload)
          setToast(result.message || '完成')
          setHop(function (value) {
            return value + 1
          })
          await refresh()
          return result
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : String(caught))
          return null
        } finally {
          setBusy(false)
        }
      }

      function chooseDir(path) {
        setOverride(path)
        setPicking(false)
      }

      async function openPicker() {
        setError('')
        try {
          const result = await request('workspaces')
          setSpaces(Array.isArray(result.items) ? result.items : [])
          setSelected(null)
          setPicking(true)
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : String(caught))
        }
      }

      function onPointerDown(event) {
        if (event.button !== undefined && event.button !== 0) return
        dragRef.current = {
          id: event.pointerId,
          sx: event.clientX,
          sy: event.clientY,
          ox: pos.x,
          oy: pos.y,
          moved: false,
        }
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          /* capture unsupported: dragging still works without it */
        }
      }

      function onPointerMove(event) {
        const drag = dragRef.current
        if (drag === null) return
        const dx = event.clientX - drag.sx
        const dy = event.clientY - drag.sy
        if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return
        drag.moved = true
        setPos({
          x: Math.min(Math.max(8, drag.ox + dx), Math.max(8, window.innerWidth - 78)),
          y: Math.min(Math.max(8, drag.oy + dy), Math.max(8, window.innerHeight - 64)),
        })
      }

      function onPointerUp(event) {
        const drag = dragRef.current
        dragRef.current = null
        if (drag === null) return
        try {
          event.currentTarget.releasePointerCapture(drag.id)
        } catch {
          /* already released */
        }
        if (drag.moved) {
          savePos(posRef.current)
          return
        }
        setOpen(function (value) {
          return !value
        })
        setSelected(null)
      }

      function onKeyDown(event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          setOpen(function (value) {
            return !value
          })
        }
      }

      const versions = data !== null && Array.isArray(data.versions) ? data.versions : []
      const dirty = data !== null && typeof data.dirty === 'number' ? data.dirty : 0
      const total = versions.length > 0 ? versions[0].n : 0
      const label = versions.length > 0 ? '版本 v' + total + (dirty > 0 ? '，' + dirty + ' 个文件未存档' : '') : '版本气泡'

      const groups = []
      let lastDay = ''
      for (let index = 0; index < versions.length; index += 1) {
        const item = versions[index]
        const key = dayOf(item.at)
        if (key !== lastDay) {
          groups.push({ key: key, label: dayLabel(item.at), items: [] })
          lastDay = key
        }
        groups[groups.length - 1].items.push(item)
      }

      const openUp = pos.y > 460
      const nearLeft = pos.x < PANEL_W - 80
      const panelStyle = {
        maxHeight: openUp
          ? Math.max(240, Math.min(540, pos.y - 20))
          : Math.max(240, Math.min(540, window.innerHeight - pos.y - 80)),
        right: nearLeft ? undefined : -8,
        left: nearLeft ? -8 : undefined,
        bottom: openUp ? 58 : undefined,
        top: openUp ? undefined : 58,
      }

      const panel = open
        ? h(
            'div',
            { className: 'vwb-panel', style: panelStyle, role: 'dialog', 'aria-label': '版本记录' },
            h(
              'div',
              { className: 'vwb-head' },
              h('span', { className: 'vwb-title' }, '版本'),
              h('span', { className: 'vwb-ver' }, versions.length > 0 ? 'v' + total : 'v0'),
              h('span', { className: 'vwb-grow' }),
              h(
                'button',
                {
                  type: 'button',
                  className: 'vwb-btn vwb-btn--primary',
                  disabled: busy || projectDir === '',
                  onClick: function () {
                    act('snapshot', { note: '' })
                  },
                },
                busy ? '存档中' : '存档',
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'vwb-icon',
                  'aria-label': '关闭',
                  onClick: function () {
                    setSelected(null)
                    setOpen(false)
                  },
                },
                '×',
              ),
            ),
            toast !== '' ? h('div', { className: 'vwb-toast' }, toast) : null,
            error !== ''
              ? h('div', { className: 'vwb-err' }, error)
              : null,
            picking
              ? h(
                  'div',
                  { className: 'vwb-list' },
                  h('div', { className: 'vwb-day' }, '选择要存档的项目'),
                  h(
                    'div',
                    {
                      className: 'vwb-row',
                      role: 'button',
                      tabIndex: 0,
                      onClick: function () {
                        chooseDir('')
                      },
                      onKeyDown: function (event) {
                        if (event.key === 'Enter') chooseDir('')
                      },
                    },
                    h('span', { className: 'vwb-dot' }),
                    h('span', { className: 'vwb-subject' }, '跟随当前项目（自动）'),
                  ),
                  spaces.length === 0
                    ? h('div', { className: 'vwb-empty' }, '还没有打开过任何工作区。')
                    : spaces.map(function (item) {
                        return h(
                          'div',
                          {
                            key: item.path,
                            className: 'vwb-row',
                            role: 'button',
                            tabIndex: 0,
                            onClick: function () {
                              chooseDir(item.path)
                            },
                            onKeyDown: function (event) {
                              if (event.key === 'Enter') chooseDir(item.path)
                            },
                          },
                          h('span', { className: 'vwb-dot' }),
                          h('span', { className: 'vwb-subject', title: item.path }, item.title),
                        )
                      }),
                )
              : selected !== null
              ? h(
                  'div',
                  { className: 'vwb-detail' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'vwb-back',
                      onClick: function () {
                        setSelected(null)
                      },
                    },
                    '← 返回版本树',
                  ),
                  h('div', { className: 'vwb-detail-subject' }, noteData !== null && noteData.summary ? noteData.summary : selected.subject),
                  h(
                    'div',
                    { className: 'vwb-meta' },
                    'v' + selected.n + ' · ' + fullTime(selected.at) + ' · ' + selected.short,
                  ),
                  noteLoading
                    ? h('div', { className: 'vwb-note' }, '正在读这次改动，写版本说明…')
                    : noteData !== null && Array.isArray(noteData.points) && noteData.points.length > 0
                      ? h(
                          'div',
                          { className: 'vwb-points' },
                          noteData.points.map(function (point, index) {
                            return h(
                              'div',
                              { className: 'vwb-point', key: 'point-' + index },
                              h('span', { className: 'vwb-kind' }, point.kind),
                              h('span', { className: 'vwb-point-text' }, point.text),
                            )
                          }),
                        )
                      : null,
                  noteData !== null && Array.isArray(noteData.files) && noteData.files.length > 0
                    ? h(
                        'div',
                        { className: 'vwb-files' },
                        noteData.files.slice(0, 8).map(function (file) {
                          return h(
                            'div',
                            { className: 'vwb-file', key: file.path },
                            h('span', { className: 'vwb-file-name', title: file.path }, file.path),
                            h('span', { className: 'vwb-file-stat' }, '+' + file.added + ' -' + file.removed),
                          )
                        }),
                        noteData.files.length > 8
                          ? h('div', null, '还有 ' + (noteData.files.length - 8) + ' 个文件')
                          : null,
                      )
                    : null,
                  confirmRestore
                    ? h(
                        'div',
                        { className: 'vwb-confirm' },
                        h(
                          'div',
                          { className: 'vwb-confirm-text' },
                          '回到 v' +
                            selected.n +
                            '？当前内容会先存成一个新版本，历史不会被删除，之后还能再回来。',
                        ),
                        h(
                          'div',
                          { style: { display: 'flex', gap: '8px' } },
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'vwb-btn vwb-btn--primary',
                              disabled: busy,
                              onClick: async function () {
                                const result = await act('restore', { sha: selected.sha })
                                if (result !== null) setSelected(null)
                              },
                            },
                            busy ? '处理中' : '确认回到这一版',
                          ),
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'vwb-btn',
                              onClick: function () {
                                setConfirmRestore(false)
                              },
                            },
                            '取消',
                          ),
                        ),
                      )
                    : h(
                        'div',
                        { style: { display: 'flex', gap: '8px' } },
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'vwb-btn',
                            disabled: busy,
                            onClick: function () {
                              setConfirmRestore(true)
                            },
                          },
                          '回到这一版',
                        ),
                      ),
                )
              : h(
                  'div',
                  { className: 'vwb-list' },
                  projectDir === ''
                    ? h(
                        'div',
                        { className: 'vwb-empty' },
                        '还没有打开项目。',
                        h('br'),
                        '在主区打开一个会话，我就跟着那个项目走。',
                        h(
                          'div',
                          { style: { marginTop: '10px' } },
                          h('button', { type: 'button', className: 'vwb-back', onClick: openPicker }, '手动选择项目'),
                        ),
                      )
                    : null,
                  projectDir !== '' && dirty > 0 ? h(
                    'div',
                    { className: 'vwb-dirty' },
                    h('span', null, dirty + ' 个文件有改动，还没存档'),
                  ) : null,
                  projectDir !== '' && versions.length === 0
                    ? h(
                        'div',
                        { className: 'vwb-empty' },
                        '还没有版本。',
                        h('br'),
                        '点上面的「存档」创建第一版。',
                        h(
                          'div',
                          { style: { marginTop: '10px' } },
                          h(
                            'button',
                            { type: 'button', className: 'vwb-back', onClick: openPicker },
                            '换个项目',
                          ),
                        ),
                      )
                    : groups.map(function (group) {
                        return h(
                          'div',
                          { key: group.key },
                          h('div', { className: 'vwb-day' }, group.label),
                          group.items.map(function (item) {
                            return h(
                              'div',
                              {
                                key: item.sha,
                                className: 'vwb-row',
                                role: 'button',
                                tabIndex: 0,
                                onClick: function () {
                                  setSelected(item)
                                },
                                onKeyDown: function (event) {
                                  if (event.key === 'Enter') setSelected(item)
                                },
                              },
                              h('span', {
                                className: 'vwb-dot' + (item === versions[0] ? '' : ' vwb-dot--old'),
                              }),
                              h('span', { className: 'vwb-clock' }, clockOf(item.at)),
                              h(
                                'span',
                                {
                                  className: 'vwb-subject',
                                  title: item.note && item.note.summary ? item.note.summary : item.subject,
                                },
                                item.note && item.note.summary ? item.note.summary : item.subject,
                              ),
                              h('span', { className: 'vwb-num' }, 'v' + item.n),
                            )
                          }),
                        )
                      }),
                ),
            h(
              'div',
              { className: 'vwb-foot' },
              h(
                'span',
                { className: 'vwb-path', title: data !== null && data.root ? data.root : projectDir },
                data !== null && data.root
                  ? data.root
                  : projectDir !== ''
                    ? '读取中…'
                    : '未选择项目',
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'vwb-icon',
                  'aria-label': '切换项目',
                  title: '切换项目',
                  onClick: openPicker,
                },
                '⇄',
              ),
              h('span', null, '仅本地'),
            ),
          )
        : null

      return h(
        'div',
        { ref: rootRef, className: 'vwb-root', style: { left: pos.x, top: pos.y } },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        panel,
        h(
          'div',
          {
            className: 'vwb-anchor',
            role: 'button',
            tabIndex: 0,
            'aria-label': label,
            title: label,
            onPointerDown: onPointerDown,
            onPointerMove: onPointerMove,
            onPointerUp: onPointerUp,
            onPointerCancel: onPointerUp,
            onKeyDown: onKeyDown,
          },
          h('div', { className: 'vwb-halo' }),
          h(Whale, { hop: hop, dirty: dirty }),
          dirty > 0 ? h('span', { className: 'vwb-badge' }) : null,
        ),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('shell.overlay', function () {
          return ctx.slots.register(
            { name: 'shell.overlay', id: 'version-bubble', order: 40 },
            VersionBubble,
          )
        })
      },
    }
  },
})
