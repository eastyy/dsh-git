/**
 * Client half of the HTML visual editor.
 *
 * A floating launcher in `shell.overlay` opens a full-screen canvas over the
 * Harness frame: a workspace file list on the left, the served page in a
 * sandboxed iframe in the middle, and an inspector on the right. The Host half
 * owns every file read and write; the iframe runtime owns selection and edits.
 */
window.__ModuleLoader__.load({
  id: 'dsh-html-editor',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const API = '/__dsh-html-editor'
    const LAST_KEY = 'dsh.html-editor.last.v1'

    const CSS = [
      '.dhe-launcher{position:fixed;left:16px;bottom:76px;z-index:2147483000;display:flex;align-items:center;gap:8px;',
      'pointer-events:auto;',
      'height:38px;padding:0 14px 0 11px;border:1px solid var(--dsw-alias-border-l2,rgba(15,23,42,.12));',
      'border-radius:999px;background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-primary,#0f172a);',
      'box-shadow:0 8px 22px rgba(15,23,42,.14);cursor:pointer;font:600 12.5px/1 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;',
      'letter-spacing:.01em;transition:transform .14s ease,box-shadow .14s ease}',
      '.dhe-launcher:hover{transform:translateY(-1px);box-shadow:0 12px 26px rgba(15,23,42,.18)}',
      '.dhe-launcher:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:2px}',
      '.dhe-launcher svg{width:17px;height:17px;color:var(--dsw-alias-brand-primary,#4d6bfe)}',
      '.dhe-root{position:fixed;inset:0;z-index:2147483001;display:flex;flex-direction:column;pointer-events:auto;',
      'background:var(--dsw-alias-bg-layer-1,#f7f8fa);color:var(--dsw-alias-label-primary,#0f172a);',
      'font:13px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;',
      '--dhe-border:var(--dsw-alias-border-l1,rgba(15,23,42,.09));',
      '--dhe-border-strong:var(--dsw-alias-border-l2,rgba(15,23,42,.16));',
      '--dhe-muted:var(--dsw-alias-label-secondary,#64748b);',
      '--dhe-soft:var(--dsw-alias-bg-layer-2,#f1f3f6);',
      '--dhe-panel:var(--dsw-alias-bg-overlay,#fff);',
      '--dhe-brand:var(--dsw-alias-brand-primary,#4d6bfe);',
      '--dhe-danger:var(--dsw-alias-state-error-primary,#dc2626);',
      'animation:dhe-fade .16s ease-out}',
      '@keyframes dhe-fade{from{opacity:0}to{opacity:1}}',
      '.dhe-bar{height:52px;flex:none;display:flex;align-items:center;gap:10px;padding:0 12px 0 14px;',
      'border-bottom:1px solid var(--dhe-border);background:var(--dhe-panel)}',
      '.dhe-mark{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;',
      'background:linear-gradient(140deg,#5b7cff,#2c3fbf);color:#fff;flex:none;box-shadow:0 2px 6px rgba(44,63,191,.35)}',
      '.dhe-title{display:flex;flex-direction:column;min-width:0;gap:1px;margin-right:4px}',
      '.dhe-title b{font-size:13px;font-weight:650;letter-spacing:.01em}',
      '.dhe-title span{font-size:11px;color:var(--dhe-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:340px}',
      '.dhe-dot{width:7px;height:7px;border-radius:50%;background:#f59e0b;flex:none;margin-left:2px}',
      '.dhe-grow{flex:1}',
      '.dhe-btn{height:28px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 10px;',
      'border:1px solid var(--dhe-border-strong);border-radius:8px;background:transparent;color:inherit;',
      'font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}',
      '.dhe-btn:hover{background:var(--dhe-soft)}',
      '.dhe-btn:disabled{opacity:.42;cursor:default}',
      '.dhe-btn--icon{width:30px;padding:0}',
      '.dhe-btn--primary{background:var(--dhe-brand);border-color:transparent;color:#fff;font-weight:600}',
      '.dhe-btn--primary:hover{background:color-mix(in srgb,var(--dhe-brand) 88%,#000)}',
      '.dhe-btn--danger{color:var(--dhe-danger);border-color:color-mix(in srgb,var(--dhe-danger) 32%,transparent)}',
      '.dhe-btn--danger:hover{background:color-mix(in srgb,var(--dhe-danger) 8%,transparent)}',
      '.dhe-sep{width:1px;height:20px;background:var(--dhe-border);margin:0 2px}',
      '.dhe-body{flex:1;min-height:0;display:grid;grid-template-columns:244px minmax(0,1fr) 302px}',
      '.dhe-side{min-height:0;display:flex;flex-direction:column;background:var(--dhe-panel)}',
      '.dhe-side--left{border-right:1px solid var(--dhe-border)}',
      '.dhe-side--right{border-left:1px solid var(--dhe-border)}',
      '.dhe-side-head{flex:none;display:flex;align-items:center;gap:8px;padding:11px 12px 8px}',
      '.dhe-side-head b{font-size:11.5px;font-weight:650;letter-spacing:.04em;text-transform:uppercase;color:var(--dhe-muted)}',
      '.dhe-count{font-size:10.5px;padding:1px 6px;border-radius:999px;background:var(--dhe-soft);color:var(--dhe-muted)}',
      '.dhe-icon{width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;border:none;',
      'background:transparent;color:var(--dhe-muted);border-radius:7px;cursor:pointer;padding:0}',
      '.dhe-icon:hover{background:var(--dhe-soft);color:var(--dsw-alias-label-primary,#0f172a)}',
      '.dhe-search{margin:0 12px 8px;height:30px;display:flex;align-items:center;gap:7px;padding:0 9px;',
      'border:1px solid var(--dhe-border);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#f7f8fa)}',
      '.dhe-search svg{width:14px;height:14px;color:var(--dhe-muted);flex:none}',
      '.dhe-search input{flex:1;min-width:0;border:none;background:transparent;outline:none;color:inherit;font:inherit;font-size:12px}',
      '.dhe-files{flex:1;min-height:0;overflow:auto;padding:2px 8px 10px}',
      '.dhe-file{width:100%;display:flex;flex-direction:column;gap:2px;padding:7px 9px;border:none;border-radius:8px;',
      'background:transparent;color:inherit;text-align:left;cursor:pointer;font:inherit}',
      '.dhe-file:hover{background:var(--dhe-soft)}',
      '.dhe-file--on{background:color-mix(in srgb,var(--dhe-brand) 11%,transparent)}',
      '.dhe-file-top{display:flex;align-items:center;gap:6px;min-width:0}',
      '.dhe-file-name{font-size:12.5px;font-weight:550;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dhe-file-dir{font-size:10.5px;color:var(--dhe-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dhe-file--on .dhe-file-name{color:var(--dhe-brand)}',
      '.dhe-leaf{width:9px;height:9px;border-radius:2px;border:1.5px solid color-mix(in srgb,var(--dhe-brand) 55%,transparent);flex:none}',
      '.dhe-leaf--on{background:var(--dhe-brand);border-color:var(--dhe-brand)}',
      '.dhe-empty{padding:26px 18px;text-align:center;color:var(--dhe-muted);font-size:12px;line-height:1.7}',
      '.dhe-empty b{display:block;color:var(--dsw-alias-label-primary,#0f172a);font-size:12.5px;margin-bottom:4px}',
      '.dhe-root-path{padding:9px 12px;border-top:1px solid var(--dhe-border);font-size:10.5px;color:var(--dhe-muted);',
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:rtl;text-align:left}',
      '.dhe-stage{position:relative;min-width:0;min-height:0;display:flex;flex-direction:column;',
      'background:var(--dsw-alias-bg-layer-2,#eef0f4);',
      'background-image:radial-gradient(circle at 1px 1px,color-mix(in srgb,var(--dsw-alias-label-primary,#0f172a) 9%,transparent) 1px,transparent 0);',
      'background-size:18px 18px}',
      '.dhe-canvas-wrap{flex:1;min-height:0;padding:16px 20px 18px;display:flex;justify-content:center}',
      '.dhe-canvas{position:relative;width:100%;max-width:1320px;height:100%;background:#fff;border-radius:10px;',
      'box-shadow:0 2px 6px rgba(15,23,42,.08),0 18px 48px rgba(15,23,42,.12);overflow:hidden}',
      '.dhe-canvas iframe{display:block;width:100%;height:100%;border:0;background:#fff}',
      '.dhe-veil{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;',
      'background:color-mix(in srgb,var(--dsw-alias-bg-layer-1,#fff) 74%,transparent);backdrop-filter:blur(2px);',
      'color:var(--dhe-muted);font-size:12px;z-index:3}',
      '.dhe-spin{width:22px;height:22px;border-radius:50%;border:2px solid color-mix(in srgb,var(--dhe-brand) 24%,transparent);',
      'border-top-color:var(--dhe-brand);animation:dhe-spin .8s linear infinite}',
      '@keyframes dhe-spin{to{transform:rotate(360deg)}}',
      '.dhe-stage-foot{flex:none;display:flex;align-items:center;gap:12px;padding:7px 16px;border-top:1px solid var(--dhe-border);',
      'background:color-mix(in srgb,var(--dhe-panel) 86%,transparent);font-size:11px;color:var(--dhe-muted)}',
      '.dhe-kbd{display:inline-flex;align-items:center;height:17px;padding:0 4px;border:1px solid var(--dhe-border-strong);',
      'border-bottom-width:2px;border-radius:4px;font-size:10px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;',
      'color:var(--dsw-alias-label-primary,#0f172a);background:var(--dhe-panel)}',
      '.dhe-inspect{flex:1;min-height:0;overflow:auto;padding:2px 12px 16px}',
      '.dhe-card{border:1px solid var(--dhe-border);border-radius:10px;background:var(--dhe-panel);padding:11px 12px;margin-top:10px}',
      '.dhe-card h4{margin:0 0 9px;font-size:11px;font-weight:650;letter-spacing:.05em;text-transform:uppercase;color:var(--dhe-muted)}',
      '.dhe-selected{border-bottom:1px solid var(--dhe-border);padding:12px 12px 11px}',
      '.dhe-tagline{display:flex;align-items:center;gap:7px;min-width:0}',
      '.dhe-tag{font:600 12px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--dhe-brand);',
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dhe-dim{font-size:10.5px;color:var(--dhe-muted);white-space:nowrap}',
      '.dhe-crumbs{display:flex;flex-wrap:wrap;align-items:center;gap:2px;margin-top:7px;font-size:10.5px;color:var(--dhe-muted)}',
      '.dhe-crumb{border:none;background:transparent;color:inherit;font:inherit;padding:1px 3px;border-radius:4px;cursor:pointer}',
      '.dhe-crumb:hover{background:var(--dhe-soft);color:var(--dsw-alias-label-primary,#0f172a)}',
      '.dhe-crumb-sep{opacity:.5}',
      '.dhe-row{display:flex;align-items:center;gap:8px;min-height:30px;margin:5px 0}',
      '.dhe-label{flex:none;width:64px;font-size:11.5px;color:var(--dhe-muted)}',
      '.dhe-color{display:flex;align-items:center;gap:6px;flex:1;min-width:0}',
      '.dhe-swatch{position:relative;width:22px;height:22px;border-radius:6px;flex:none;cursor:pointer;',
      'border:1px solid var(--dhe-border-strong);overflow:hidden;background:var(--dhe-soft)}',
      '.dhe-swatch input{position:absolute;inset:-6px;width:40px;height:40px;opacity:0;cursor:pointer;border:none;padding:0}',
      '.dhe-swatch--none::after{content:"";position:absolute;left:-2px;top:10px;width:28px;height:1.5px;background:var(--dhe-danger);',
      'transform:rotate(-45deg)}',
      '.dhe-hex{font:10.5px/1 ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--dhe-muted);width:58px;flex:none}',
      '.dhe-mini{border:none;background:transparent;color:var(--dhe-brand);font:inherit;font-size:10.5px;cursor:pointer;padding:2px 4px;border-radius:4px}',
      '.dhe-mini:hover{background:color-mix(in srgb,var(--dhe-brand) 10%,transparent)}',
      '.dhe-textarea{width:100%;min-height:64px;resize:vertical;border:1px solid var(--dhe-border);border-radius:8px;',
      'background:var(--dsw-alias-bg-layer-1,#f7f8fa);color:inherit;font-family:inherit;font-size:12px;line-height:1.55;',
      'padding:7px 8px;outline:none}',
      '.dhe-textarea:focus{border-color:var(--dhe-brand)}',
      '.dhe-hint{font-size:10.5px;color:var(--dhe-muted);line-height:1.55;margin-top:6px}',
      '.dhe-stepper{display:flex;align-items:center;gap:4px;flex:1}',
      '.dhe-stepper input{width:58px;height:26px;border:1px solid var(--dhe-border-strong);border-radius:6px;',
      'background:var(--dhe-panel);color:inherit;font-family:inherit;font-size:11.5px;padding:0 6px;outline:none}',
      '.dhe-stepper button{width:24px;height:26px;border:1px solid var(--dhe-border-strong);border-radius:6px;',
      'background:var(--dhe-panel);color:inherit;cursor:pointer;font-size:13px;line-height:1;padding:0}',
      '.dhe-stepper button:hover{background:var(--dhe-soft)}',
      '.dhe-seg{display:inline-flex;border:1px solid var(--dhe-border-strong);border-radius:7px;overflow:hidden}',
      '.dhe-seg button{height:25px;min-width:30px;border:none;border-right:1px solid var(--dhe-border);background:var(--dhe-panel);',
      'color:var(--dhe-muted);font:inherit;font-size:11px;cursor:pointer;padding:0 7px}',
      '.dhe-seg button:last-child{border-right:none}',
      '.dhe-seg button:hover{background:var(--dhe-soft)}',
      '.dhe-seg button[aria-pressed="true"]{background:color-mix(in srgb,var(--dhe-brand) 13%,transparent);color:var(--dhe-brand);font-weight:600}',
      '.dhe-actions{display:flex;gap:7px;flex-wrap:wrap}',
      '.dhe-placeholder{padding:34px 20px;text-align:center;color:var(--dhe-muted)}',
      '.dhe-placeholder .dhe-glyph{width:34px;height:34px;margin:0 auto 10px;border-radius:10px;',
      'display:flex;align-items:center;justify-content:center;background:var(--dhe-soft);color:var(--dhe-brand)}',
      '.dhe-placeholder b{display:block;font-size:12.5px;color:var(--dsw-alias-label-primary,#0f172a);margin-bottom:4px}',
      '.dhe-tips{display:flex;flex-direction:column;gap:8px;margin-top:18px;text-align:left;font-size:11px;line-height:1.5}',
      '.dhe-tip{display:flex;gap:7px;align-items:flex-start}',
      '.dhe-tip i{flex:none;width:16px;height:16px;border-radius:50%;background:var(--dhe-soft);color:var(--dhe-brand);',
      'font-style:normal;font-size:9.5px;display:inline-flex;align-items:center;justify-content:center;margin-top:1px}',
      '.dhe-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:2147483002;',
      'background:#1f2a44;color:#fff;font-size:12px;padding:8px 14px;border-radius:9px;box-shadow:0 12px 30px rgba(15,23,42,.28);',
      'animation:dhe-pop .16s ease-out;max-width:min(520px,80vw)}',
      '.dhe-toast--error{background:#b91c1c}',
      '@keyframes dhe-pop{from{opacity:0;transform:translate(-50%,6px)}to{opacity:1;transform:translate(-50%,0)}}',
      '.dhe-err{position:absolute;left:20px;right:20px;top:14px;z-index:4;border:1px solid color-mix(in srgb,var(--dhe-danger) 35%,transparent);',
      'background:color-mix(in srgb,var(--dhe-danger) 9%,var(--dhe-panel));color:var(--dhe-danger);border-radius:9px;',
      'padding:8px 11px;font-size:11.5px;display:flex;gap:10px;align-items:center}',
      '.dhe-preview-btn{height:24px;display:inline-flex;align-items:center;gap:5px;padding:0 8px;border-radius:6px;',
      'border:1px solid var(--dsw-alias-border-l2,rgba(15,23,42,.14));background:transparent;color:var(--dsw-alias-label-primary,#0f172a);',
      'font:inherit;font-size:11.5px;cursor:pointer;white-space:nowrap}',
      '.dhe-preview-btn:hover{background:var(--dsw-alias-bg-layer-2,#f1f3f6)}',
      '.dhe-preview-btn svg{width:13px;height:13px;color:var(--dsw-alias-brand-primary,#4d6bfe)}',
      '@media (max-width:1100px){.dhe-body{grid-template-columns:204px minmax(0,1fr) 272px}}',
    ].join('\n')

    const PATHS = {
      logo: 'M6.5 8.5h11M8 6v4M16 6v4M8.5 17.5c1.2-2.4 3.2-3.6 5.5-3.6s4.3 1.2 5.5 3.6',
      undo: 'M8.5 7.5 5 11l3.5 3.5M5.4 11h6.1a4.5 4.5 0 1 1 0 9H9',
      redo: 'M15.5 7.5 19 11l-3.5 3.5M18.6 11h-6.1a4.5 4.5 0 1 0 0 9H15',
      save: 'M5 4.5h9.5L19 9v10.5H5zM8 4.5v5h7v-5M8 19v-5h8v5',
      close: 'M6 6l12 12M18 6 6 18',
      refresh: 'M19 12a7 7 0 1 1-2.1-5M19 4.5V9h-4.5',
      search: 'm17 17-3.8-3.8M15.2 10.6a4.6 4.6 0 1 1-9.2 0 4.6 4.6 0 0 1 9.2 0Z',
      edit: 'M5 16.5 15.8 5.7a2 2 0 0 1 2.8 2.8L7.8 19.3 4 20z',
      copy: 'M8.5 8.5V5.5h10v10h-3M5.5 8.5h10v10h-10z',
      trash: 'M5 7h14M9.5 7V5h5v2M7 7l.8 12h8.4L17 7M10 10.5v5.5M14 10.5v5.5',
      alignLeft: 'M4 6h16M4 10h10M4 14h16M4 18h10',
      alignCenter: 'M4 6h16M7 10h10M4 14h16M7 18h10',
      alignRight: 'M4 6h16M10 10h10M4 14h16M10 18h10',
      text: 'M5 5.5h14M12 5.5v13M9 18.5h6',
      spark: 'M12 3.5 13.6 9l5.4 1.6-5.4 1.6L12 17.5l-1.6-5.3L5 10.6 10.4 9z',
    }

    function Icon(props) {
      const size = props.size || 15
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: props.width || 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        h('path', { d: PATHS[props.name] || PATHS.spark }),
      )
    }

    function mainCwd(state) {
      if (state === null || typeof state !== 'object') return ''
      const byId = state.byId
      if (byId === null || typeof byId !== 'object') return ''
      let best = ''
      let bestScore = -1
      let any = ''
      for (const id of Object.keys(byId)) {
        const session = byId[id]
        if (session === null || typeof session !== 'object') continue
        if (typeof session.cwd !== 'string' || session.cwd === '') continue
        if (any === '') any = session.cwd
        const retained = session.retainedBy
        const score =
          retained !== null && typeof retained === 'object' && typeof retained.mainView === 'number'
            ? retained.mainView
            : 0
        if (score > bestScore) {
          bestScore = score
          best = session.cwd
        }
      }
      return best !== '' ? best : any
    }

    function readLast() {
      try {
        const raw = window.localStorage.getItem(LAST_KEY)
        if (raw === null) return null
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object') return null
        if (typeof parsed.root !== 'string' || typeof parsed.path !== 'string') return null
        return parsed
      } catch (_error) {
        return null
      }
    }

    function writeLast(root, path) {
      try {
        window.localStorage.setItem(LAST_KEY, JSON.stringify({ root, path }))
      } catch (_error) {
        /* storage unavailable */
      }
    }

    function encodePath(path) {
      return String(path)
        .split('/')
        .map((part) => encodeURIComponent(part))
        .join('/')
    }

    function formatBytes(value) {
      if (!Number.isFinite(value) || value <= 0) return ''
      if (value < 1024) return value + ' B'
      if (value < 1024 * 1024) return (value / 1024).toFixed(0) + ' KB'
      return (value / 1024 / 1024).toFixed(1) + ' MB'
    }

    function frameOf(ref) {
      return ref.current
    }

    function postToFrame(frame, type, payload) {
      if (!frame || !frame.contentWindow) return
      try {
        frame.contentWindow.postMessage({ type: 'dhe:' + type, payload: payload || {} }, window.location.origin)
      } catch (_error) {
        /* frame gone */
      }
    }

    function ColorRow(props) {
      const value = props.value || ''
      return h(
        'div',
        { className: 'dhe-row' },
        h('span', { className: 'dhe-label' }, props.label),
        h(
          'div',
          { className: 'dhe-color' },
          h(
            'label',
            {
              className: 'dhe-swatch' + (value === '' ? ' dhe-swatch--none' : ''),
              style: value === '' ? undefined : { background: value },
              title: props.label,
            },
            h('input', {
              type: 'color',
              value: value === '' ? '#ffffff' : value,
              onChange: (event) => props.onChange(event.target.value),
            }),
          ),
          h('code', { className: 'dhe-hex' }, value === '' ? '无' : value.toUpperCase()),
          h(
            'button',
            { type: 'button', className: 'dhe-mini', onClick: () => props.onChange('') },
            '还原',
          ),
        ),
      )
    }

    function Seg(props) {
      return h(
        'div',
        { className: 'dhe-seg', role: 'group', 'aria-label': props.label },
        props.options.map((option) =>
          h(
            'button',
            {
              key: option.value,
              type: 'button',
              'aria-pressed': props.value === option.value,
              title: option.title || option.label,
              onClick: () => props.onChange(option.value),
            },
            option.label,
          ),
        ),
      )
    }

    function Inspector(props) {
      const selection = props.selection
      const [draft, setDraft] = React.useState('')
      const [sizeDraft, setSizeDraft] = React.useState('')

      React.useEffect(() => {
        setDraft(selection ? selection.text : '')
        setSizeDraft(selection ? String(selection.styles.fontSize || '') : '')
      }, [selection ? selection.path : '', selection ? selection.text : '', selection ? selection.styles.fontSize : ''])

      if (!selection) {
        return h(
          'div',
          { className: 'dhe-placeholder' },
          h('div', { className: 'dhe-glyph' }, h(Icon, { name: 'spark', size: 18 })),
          h('b', null, '在画布中选择一个元素'),
          h('div', null, '点选组件后，这里会出现改字、改色、删除等操作。'),
          h(
            'div',
            { className: 'dhe-tips' },
            h('div', { className: 'dhe-tip' }, h('i', null, '1'), h('span', null, '单击选中组件，标签显示在左上角。')),
            h('div', { className: 'dhe-tip' }, h('i', null, '2'), h('span', null, '双击文字直接进入编辑，Enter 结束。')),
            h('div', { className: 'dhe-tip' }, h('i', null, '3'), h('span', null, 'Delete 删除选中组件，撤销随时可回。')),
          ),
        )
      }

      const styles = selection.styles
      const bold = String(styles.fontWeight) === '700' || String(styles.fontWeight) === 'bold'
      const align = styles.textAlign === 'center' ? 'center' : styles.textAlign === 'right' || styles.textAlign === 'end' ? 'right' : 'left'

      const apply = (changes) => props.onStyle(changes)

      return h(
        'div',
        null,
        h(
          'div',
          { className: 'dhe-selected' },
          h(
            'div',
            { className: 'dhe-tagline' },
            h('span', { className: 'dhe-tag', title: selection.label }, selection.label),
            h('span', { className: 'dhe-dim' }, selection.rect.width + ' × ' + selection.rect.height),
          ),
          h(
            'div',
            { className: 'dhe-crumbs' },
            selection.ancestors.map((row, index) =>
              h(
                React.Fragment,
                { key: row.path + ':' + index },
                index > 0 ? h('span', { className: 'dhe-crumb-sep' }, '›') : null,
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dhe-crumb',
                    title: row.label,
                    onClick: () => props.onCommand('select-path', row.path),
                  },
                  row.tag,
                ),
              ),
            ),
          ),
        ),
        h(
          'div',
          { className: 'dhe-card' },
          h('h4', null, '文字'),
          selection.textEditable
            ? h(
                React.Fragment,
                null,
                h('textarea', {
                  className: 'dhe-textarea',
                  value: draft,
                  spellCheck: false,
                  onChange: (event) => setDraft(event.target.value),
                  onBlur: () => {
                    if (draft !== selection.text) props.onText(draft)
                  },
                }),
                h(
                  'div',
                  { className: 'dhe-hint' },
                  '也可以在画布里双击这段文字，直接改。修改后点画布空白处或按 Enter 生效。',
                ),
              )
            : h(
                React.Fragment,
                null,
                h(
                  'div',
                  { className: 'dhe-hint', style: { marginTop: 0 } },
                  '这个元素由多个子组件组成，请双击其中的文字，或直接编辑子元素。',
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dhe-btn',
                    style: { marginTop: 8 },
                    onClick: () => props.onCommand('edit-text'),
                  },
                  h(Icon, { name: 'edit', size: 13 }),
                  '在画布中编辑文字',
                ),
              ),
        ),
        h(
          'div',
          { className: 'dhe-card' },
          h('h4', null, '颜色'),
          h(ColorRow, {
            label: '文字',
            value: styles.color,
            onChange: (value) => apply({ color: value }),
          }),
          h(ColorRow, {
            label: '背景',
            value: styles.backgroundColor,
            onChange: (value) => apply({ backgroundColor: value }),
          }),
          h(ColorRow, {
            label: '边框',
            value: styles.borderColor,
            onChange: (value) => apply({ borderColor: value }),
          }),
          h(
            'div',
            { className: 'dhe-row' },
            h('span', { className: 'dhe-label' }, '边框粗细'),
            h(Seg, {
              label: '边框粗细',
              value: String(styles.borderWidth || '0'),
              options: [
                { value: '0', label: '无' },
                { value: '1', label: '1' },
                { value: '2', label: '2' },
                { value: '4', label: '4' },
              ],
              onChange: (value) =>
                apply({ borderWidth: value, borderStyle: value === '0' ? 'none' : 'solid' }),
            }),
          ),
        ),
        h(
          'div',
          { className: 'dhe-card' },
          h('h4', null, '排版'),
          h(
            'div',
            { className: 'dhe-row' },
            h('span', { className: 'dhe-label' }, '字号'),
            h(
              'div',
              { className: 'dhe-stepper' },
              h(
                'button',
                {
                  type: 'button',
                  title: '减小',
                  onClick: () => {
                    const next = Math.max(8, Math.round(Number(styles.fontSize) || 16) - 1)
                    setSizeDraft(String(next))
                    apply({ fontSize: next })
                  },
                },
                '−',
              ),
              h('input', {
                type: 'number',
                min: 8,
                max: 200,
                value: sizeDraft,
                onChange: (event) => {
                  const text = event.target.value
                  setSizeDraft(text)
                  const next = Number(text)
                  if (Number.isFinite(next) && next >= 8 && next <= 200) apply({ fontSize: next })
                },
              }),
              h(
                'button',
                {
                  type: 'button',
                  title: '增大',
                  onClick: () => {
                    const next = Math.min(200, Math.round(Number(styles.fontSize) || 16) + 1)
                    setSizeDraft(String(next))
                    apply({ fontSize: next })
                  },
                },
                '+',
              ),
            ),
          ),
          h(
            'div',
            { className: 'dhe-row' },
            h('span', { className: 'dhe-label' }, '样式'),
            h(Seg, {
              label: '字重',
              value: bold ? 'bold' : 'normal',
              options: [
                { value: 'normal', label: '常规' },
                { value: 'bold', label: '加粗' },
              ],
              onChange: (value) => apply({ fontWeight: value === 'bold' ? 700 : 400 }),
            }),
          ),
          h(
            'div',
            { className: 'dhe-row' },
            h('span', { className: 'dhe-label' }, '对齐'),
            h(Seg, {
              label: '对齐',
              value: align,
              options: [
                { value: 'left', label: '左', title: '左对齐' },
                { value: 'center', label: '中', title: '居中' },
                { value: 'right', label: '右', title: '右对齐' },
              ],
              onChange: (value) => apply({ textAlign: value }),
            }),
          ),
        ),
        h(
          'div',
          { className: 'dhe-card' },
          h('h4', null, '操作'),
          h(
            'div',
            { className: 'dhe-actions' },
            h(
              'button',
              { type: 'button', className: 'dhe-btn', onClick: () => props.onCommand('duplicate') },
              h(Icon, { name: 'copy', size: 13 }),
              '复制元素',
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dhe-btn dhe-btn--danger',
                disabled: !selection.canDelete,
                onClick: () => props.onCommand('delete'),
              },
              h(Icon, { name: 'trash', size: 13 }),
              '删除元素',
            ),
          ),
          h('div', { className: 'dhe-hint' }, '删除后仍可用 Ctrl/⌘+Z 撤销。'),
        ),
      )
    }

    function FileList(props) {
      const files = props.files
      const query = props.query.trim().toLowerCase()
      const shown = query === '' ? files : files.filter((file) => file.path.toLowerCase().includes(query))
      return h(
        'aside',
        { className: 'dhe-side dhe-side--left' },
        h(
          'div',
          { className: 'dhe-side-head' },
          h('b', null, '工作区 HTML'),
          h('span', { className: 'dhe-count' }, String(files.length)),
          h('span', { className: 'dhe-grow' }),
          h(
            'button',
            { type: 'button', className: 'dhe-icon', title: '刷新文件列表', onClick: props.onRefresh },
            h(Icon, { name: 'refresh', size: 14 }),
          ),
        ),
        h(
          'div',
          { className: 'dhe-search' },
          h(Icon, { name: 'search', size: 14 }),
          h('input', {
            value: props.query,
            placeholder: '筛文件名或路径',
            spellCheck: false,
            onChange: (event) => props.onQuery(event.target.value),
          }),
        ),
        h(
          'div',
          { className: 'dhe-files' },
          shown.length === 0
            ? h(
                'div',
                { className: 'dhe-empty' },
                h('b', null, files.length === 0 ? '还没有 HTML 文件' : '没有匹配的文件'),
                h(
                  'span',
                  null,
                  files.length === 0
                    ? '让 DSH 生成一个原型，或把 .html 文件放进这个工作区，然后点右上角刷新。'
                    : '换个关键词试试。',
                ),
              )
            : shown.map((file) =>
                h(
                  'button',
                  {
                    key: file.path,
                    type: 'button',
                    className: 'dhe-file' + (file.path === props.active ? ' dhe-file--on' : ''),
                    title: file.path,
                    onClick: () => props.onOpen(file.path),
                  },
                  h(
                    'span',
                    { className: 'dhe-file-top' },
                    h('span', { className: 'dhe-leaf' + (file.path === props.active ? ' dhe-leaf--on' : '') }),
                    h('span', { className: 'dhe-file-name' }, file.name),
                  ),
                  h(
                    'span',
                    { className: 'dhe-file-dir' },
                    (file.dir === '' ? '工作区根目录' : file.dir) + (file.size ? ' · ' + formatBytes(file.size) : ''),
                  ),
                ),
              ),
        ),
        h('div', { className: 'dhe-root-path', title: props.root }, props.root || '未确定工作区'),
      )
    }

    function HtmlEditorOverlay(props) {
      const useSessions = props.useSessions
      const cwd = typeof useSessions === 'function' ? useSessions(mainCwd) : ''

      const [open, setOpen] = React.useState(false)
      const [root, setRoot] = React.useState('')
      const [token, setToken] = React.useState('')
      const [files, setFiles] = React.useState([])
      const [active, setActive] = React.useState('')
      const [url, setUrl] = React.useState('')
      const [query, setQuery] = React.useState('')
      const [loading, setLoading] = React.useState(false)
      const [ready, setReady] = React.useState(false)
      const [error, setError] = React.useState('')
      const [selection, setSelection] = React.useState(null)
      const [docState, setDocState] = React.useState({ dirty: false, canUndo: false, canRedo: false, count: 0 })
      const [saving, setSaving] = React.useState(false)
      const [toast, setToast] = React.useState(null)

      const frameRef = React.useRef(null)
      const rootRef = React.useRef('')
      const activeRef = React.useRef('')
      const dirtyRef = React.useRef(false)
      const readyRef = React.useRef(false)
      const saveTimerRef = React.useRef(0)
      const loadTimerRef = React.useRef(0)
      const toastTimerRef = React.useRef(0)

      rootRef.current = root
      activeRef.current = active
      dirtyRef.current = docState.dirty
      readyRef.current = ready

      const showToast = React.useCallback(function (text, kind) {
        setToast({ text: text, kind: kind || 'ok' })
        window.clearTimeout(toastTimerRef.current)
        toastTimerRef.current = window.setTimeout(() => setToast(null), 2600)
      }, [])

      const post = React.useCallback(function (type, payload) {
        postToFrame(frameRef.current, type, payload)
      }, [])

      const activate = React.useCallback(
        function (path, tokenArg, rootArg) {
          const tk = tokenArg || token
          const rt = rootArg || rootRef.current
          setActive(path)
          setSelection(null)
          setReady(false)
          setError('')
          setDocState({ dirty: false, canUndo: false, canRedo: false, count: 0 })
          setUrl(`${API}/fs/${tk}/${encodePath(path)}?v=${Date.now()}`)
          writeLast(rt, path)
          window.clearTimeout(loadTimerRef.current)
          loadTimerRef.current = window.setTimeout(function () {
            if (!readyRef.current) setError('页面载入超时。请检查这个 HTML 是否能独立打开，然后重试。')
          }, 12000)
        },
        [token],
      )

      const loadState = React.useCallback(
        async function (rootArg, preferred) {
          setLoading(true)
          setError('')
          try {
            const response = await fetch(`${API}/api/state?root=${encodeURIComponent(rootArg || '')}`, {
              headers: { accept: 'application/json' },
            })
            const json = await response.json()
            if (!json || json.ok !== true) throw new Error((json && json.error) || '读取工作区失败')
            setRoot(json.root)
            rootRef.current = json.root
            setToken(json.token)
            setFiles(json.files || [])
            if (json.truncated === true) showToast('HTML 文件太多，只列出前 800 个', 'error')
            const list = json.files || []
            const remembered = readLast()
            const rememberedPath =
              remembered !== null && remembered.root === json.root && list.some((file) => file.path === remembered.path)
                ? remembered.path
                : ''
            const pick =
              preferred && list.some((file) => file.path === preferred)
                ? preferred
                : rememberedPath !== ''
                  ? rememberedPath
                  : list.length > 0
                    ? list[0].path
                    : ''
            if (pick !== '') {
              activate(pick, json.token, json.root)
            } else {
              setActive('')
              setUrl('')
              setSelection(null)
            }
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught))
          } finally {
            setLoading(false)
          }
        },
        [activate],
      )

      const openEditor = React.useCallback(
        function (path) {
          if (dirtyRef.current && !window.confirm('当前文件有未保存的修改，打开别的文件会丢失这些修改。继续吗？')) return
          setOpen(true)
          setQuery('')
          setSelection(null)
          if (typeof path === 'string' && path !== '') {
            const file = path
            const isAbsolute = /^[a-zA-Z]:[\\/]/.test(file) || file.startsWith('/')
            if (isAbsolute) {
              fetch(`${API}/api/resolve?file=${encodeURIComponent(file)}`)
                .then((response) => response.json())
                .then((json) => {
                  if (json && json.ok) {
                    loadState(json.root, json.path)
                  } else {
                    loadState(cwd || rootRef.current, '')
                    showToast((json && json.error) || '这个文件不在工作区里', 'error')
                  }
                })
                .catch(() => loadState(cwd || rootRef.current, ''))
              return
            }
            loadState(cwd || rootRef.current, file)
            return
          }
          loadState(cwd || rootRef.current, '')
        },
        [cwd, loadState, showToast],
      )

      React.useEffect(() => {
        function onOpen(event) {
          if (event && event.detail && typeof event.detail.path === 'string') openEditor(event.detail.path)
          else openEditor('')
        }
        window.addEventListener('dsh-html-editor:open', onOpen)
        return function () {
          window.removeEventListener('dsh-html-editor:open', onOpen)
        }
      }, [openEditor])

      React.useEffect(() => {
        function onMessage(event) {
          const frame = frameRef.current
          if (!frame || event.source !== frame.contentWindow) return
          if (event.origin !== window.location.origin) return
          const data = event.data
          if (!data || typeof data.type !== 'string' || data.type.indexOf('dhe:') !== 0) return
          if (data.type === 'dhe:ready') {
            window.clearTimeout(loadTimerRef.current)
            setReady(true)
            setError('')
            return
          }
          if (data.type === 'dhe:state') {
            setDocState({
              dirty: data.dirty === true,
              canUndo: data.canUndo === true,
              canRedo: data.canRedo === true,
              count: Number(data.count) || 0,
            })
            return
          }
          if (data.type === 'dhe:selection') {
            setSelection(data.selection || null)
            return
          }
          if (data.type === 'dhe:toast') {
            showToast(data.text || '', 'ok')
            return
          }
          if (data.type === 'dhe:serialize') {
            const requestId = data.requestId
            const html = data.html
            /* Snapshot the target: the user may switch files before this
               round trip lands, and the ack belongs to the file that sent it. */
            const targetRoot = rootRef.current
            const targetPath = activeRef.current
            setSaving(true)
            fetch(`${API}/api/save`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', accept: 'application/json' },
              body: JSON.stringify({ root: targetRoot, path: targetPath, html: html }),
            })
              .then((response) => response.json())
              .then((json) => {
                postToFrame(frameRef.current, 'saved', {
                  requestId: requestId,
                  ok: json.ok === true,
                  error: (json && json.error) || '',
                })
                if (json.ok === true) showToast('已保存到 ' + targetPath, 'ok')
                else showToast((json && json.error) || '保存失败', 'error')
                if (json.ok === true) {
                  setFiles(function (rows) {
                    return rows.map(function (row) {
                      return row.path === targetPath ? Object.assign({}, row, { size: json.size, mtime: json.mtime }) : row
                    })
                  })
                }
              })
              .catch((caught) => {
                postToFrame(frameRef.current, 'saved', {
                  requestId: requestId,
                  ok: false,
                  error: caught instanceof Error ? caught.message : String(caught),
                })
                showToast('保存失败', 'error')
              })
              .finally(() => {
                setSaving(false)
                window.clearTimeout(saveTimerRef.current)
              })
          }
        }
        window.addEventListener('message', onMessage)
        return function () {
          window.removeEventListener('message', onMessage)
        }
      }, [showToast])

      const requestSave = React.useCallback(
        function () {
          if (!ready || saving || !activeRef.current) return
          setSaving(true)
          post('save', {})
          window.clearTimeout(saveTimerRef.current)
          saveTimerRef.current = window.setTimeout(() => {
            setSaving(false)
            showToast('保存超时，请重试', 'error')
          }, 20000)
        },
        [post, ready, saving, showToast],
      )

      const closeEditor = React.useCallback(
        function () {
          if (dirtyRef.current && !window.confirm('有未保存的修改，确定关闭编辑器吗？')) return
          setOpen(false)
          setUrl('')
          setActive('')
          setSelection(null)
          setReady(false)
          setDocState({ dirty: false, canUndo: false, canRedo: false, count: 0 })
          window.clearTimeout(loadTimerRef.current)
        },
        [],
      )

      const switchFile = React.useCallback(
        function (path) {
          if (path === activeRef.current) return
          if (dirtyRef.current && !window.confirm('当前文件有未保存的修改，切换后这些修改会丢失。继续吗？')) return
          activate(path)
        },
        [activate],
      )

      const reloadFile = React.useCallback(
        function () {
          if (!activeRef.current) return
          if (dirtyRef.current && !window.confirm('放弃未保存的修改并重新载入？')) return
          const path = activeRef.current
          setUrl(`${API}/fs/${token}/${encodePath(path)}?v=${Date.now()}`)
          setSelection(null)
          setReady(false)
          setDocState({ dirty: false, canUndo: false, canRedo: false, count: 0 })
        },
        [token],
      )

      React.useEffect(() => {
        if (!open) return undefined
        function onKey(event) {
          const meta = event.ctrlKey || event.metaKey
          const target = event.target
          const typing =
            target &&
            (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable === true)
          if (event.key === 'Escape' && !event.defaultPrevented) {
            if (typing) return
            closeEditor()
            return
          }
          if (meta && (event.key === 's' || event.key === 'S')) {
            event.preventDefault()
            requestSave()
            return
          }
          if (meta && !typing && (event.key === 'z' || event.key === 'Z')) {
            event.preventDefault()
            post('command', { name: event.shiftKey ? 'redo' : 'undo' })
          }
        }
        window.addEventListener('keydown', onKey)
        return function () {
          window.removeEventListener('keydown', onKey)
        }
      }, [open, closeEditor, requestSave, post])

      React.useEffect(
        function () {
          return function () {
            window.clearTimeout(toastTimerRef.current)
            window.clearTimeout(saveTimerRef.current)
            window.clearTimeout(loadTimerRef.current)
          }
        },
        [],
      )

      const styleTag = h('style', { dangerouslySetInnerHTML: { __html: CSS } })

      if (!open) {
        return h(
          React.Fragment,
          null,
          styleTag,
          h(
            'button',
            {
              type: 'button',
              className: 'dhe-launcher',
              title: '打开 HTML 可视化编辑器',
              onClick: () => openEditor(''),
            },
            h(Icon, { name: 'logo', size: 17 }),
            h('span', null, 'HTML 编辑'),
          ),
        )
      }

      const activeFile = files.find((file) => file.path === active) || null

      return h(
        React.Fragment,
        null,
        styleTag,
        h(
          'div',
          { className: 'dhe-root', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'HTML 可视化编辑器' },
          h(
            'header',
            { className: 'dhe-bar' },
            h('div', { className: 'dhe-mark' }, h(Icon, { name: 'logo', size: 17 })),
            h(
              'div',
              { className: 'dhe-title' },
              h('b', null, 'HTML 编辑'),
              h('span', { title: active || '' }, active || '选择文件开始'),
            ),
            docState.dirty ? h('span', { className: 'dhe-dot', title: '有未保存修改' }) : null,
            h('span', { className: 'dhe-grow' }),
            h(
              'button',
              {
                type: 'button',
                className: 'dhe-btn dhe-btn--icon',
                title: '撤销 (Ctrl/⌘+Z)',
                disabled: !ready || !docState.canUndo,
                onClick: () => post('command', { name: 'undo' }),
              },
              h(Icon, { name: 'undo' }),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dhe-btn dhe-btn--icon',
                title: '重做 (Ctrl/⌘+Shift+Z)',
                disabled: !ready || !docState.canRedo,
                onClick: () => post('command', { name: 'redo' }),
              },
              h(Icon, { name: 'redo' }),
            ),
            h('span', { className: 'dhe-sep' }),
            h(
              'button',
              {
                type: 'button',
                className: 'dhe-btn dhe-btn--icon',
                title: '重新载入文件',
                disabled: !ready,
                onClick: reloadFile,
              },
              h(Icon, { name: 'refresh' }),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dhe-btn dhe-btn--primary',
                disabled: !ready || saving || !docState.dirty,
                onClick: requestSave,
              },
              h(Icon, { name: 'save', size: 14 }),
              saving ? '保存中…' : docState.dirty ? '保存' : '已保存',
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dhe-btn dhe-btn--icon',
                title: '关闭编辑器 (Esc)',
                onClick: closeEditor,
              },
              h(Icon, { name: 'close' }),
            ),
          ),
          h(
            'div',
            { className: 'dhe-body' },
            h(FileList, {
              files: files,
              root: root,
              active: active,
              query: query,
              onQuery: setQuery,
              onOpen: switchFile,
              onRefresh: () => loadState(rootRef.current, activeRef.current),
            }),
            h(
              'main',
              { className: 'dhe-stage' },
              error !== ''
                ? h(
                    'div',
                    { className: 'dhe-err' },
                    h('span', { style: { flex: 1 } }, error),
                    h('button', { type: 'button', className: 'dhe-mini', onClick: () => loadState(rootRef.current, activeRef.current) }, '重试'),
                  )
                : null,
              h(
                'div',
                { className: 'dhe-canvas-wrap' },
                h(
                  'div',
                  { className: 'dhe-canvas' },
                  url !== ''
                    ? h('iframe', {
                        ref: frameRef,
                        src: url,
                        title: active || 'HTML preview',
                        sandbox: 'allow-scripts allow-same-origin',
                      })
                    : h(
                        'div',
                        { className: 'dhe-empty', style: { paddingTop: 80 } },
                        h('b', null, '还没有打开文件'),
                        h('span', null, '从左侧选择一个 HTML 文件。'),
                      ),
                  url !== '' && (!ready || loading)
                    ? h(
                        'div',
                        { className: 'dhe-veil' },
                        h('div', { className: 'dhe-spin' }),
                        h('span', null, loading ? '读取工作区…' : '准备画布…'),
                      )
                    : null,
                ),
              ),
              h(
                'div',
                { className: 'dhe-stage-foot' },
                h('span', null, '双击文字改文案 · 选中后右侧改颜色 · ', h('span', { className: 'dhe-kbd' }, 'Del'), ' 删除'),
                h('span', { className: 'dhe-grow' }),
                h('span', null, (activeFile ? formatBytes(activeFile.size) : '') + (docState.count ? ' · ' + docState.count + ' 个元素' : '')),
                h('span', null, '仅本地'),
              ),
            ),
            h(
              'aside',
              { className: 'dhe-side dhe-side--right' },
              h(
                'div',
                { className: 'dhe-side-head' },
                h('b', null, '属性'),
                h('span', { className: 'dhe-grow' }),
                selection
                  ? h(
                      'button',
                      {
                        type: 'button',
                        className: 'dhe-icon',
                        title: '取消选择',
                        onClick: () => post('command', { name: 'deselect' }),
                      },
                      h(Icon, { name: 'close', size: 13 }),
                    )
                  : null,
              ),
              h('div', { className: 'dhe-inspect' }, h(Inspector, {
                selection: selection,
                onStyle: (changes) => post('style', { changes: changes }),
                onText: (value) => post('text', { value: value }),
                onCommand: (name, path) => {
                  if (name === 'select-path') {
                    if (path === '') post('command', { name: 'deselect' })
                    else post('select', { path: path })
                  } else {
                    post('command', { name: name })
                  }
                },
              })),
            ),
          ),
          toast ? h('div', { className: 'dhe-toast' + (toast.kind === 'error' ? ' dhe-toast--error' : '') }, toast.text) : null,
        ),
      )
    }

    function PreviewEditAction(props) {
      const absolutePath = typeof props.absolutePath === 'string' ? props.absolutePath : ''
      if (!/\.html?$/i.test(absolutePath)) return null
      return h(
        'button',
        {
          type: 'button',
          className: 'dhe-preview-btn',
          title: '在 HTML 可视化编辑器中打开',
          onClick: () => {
            window.dispatchEvent(new CustomEvent('dsh-html-editor:open', { detail: { path: absolutePath } }))
          },
        },
        h('svg', {
          width: 13,
          height: 13,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        }, h('path', { d: PATHS.edit })),
        '编辑',
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('shell.overlay', function () {
          return ctx.slots.register({ name: 'shell.overlay', id: 'html-editor', order: 46 }, HtmlEditorOverlay)
        })
        ctx.slots.inject('sidebar.right.tab.document.actions', function () {
          return ctx.slots.register(
            { name: 'sidebar.right.tab.document.actions', id: 'html-editor', order: -20 },
            PreviewEditAction,
          )
        })
      },
    }
  },
})
