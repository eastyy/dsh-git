/**
 * In-iframe runtime of the HTML visual editor.
 *
 * The host injects this classic script into the served document behind a nonce
 * CSP, so the page's own scripts never run and cannot corrupt a save. This file
 * owns selection, inline text editing, undo/redo and serialization; the React
 * chrome in client.js owns the panels and asks for everything over postMessage.
 */
;(function () {
  'use strict'

  var CONFIG = window.__DSH_HTML_EDITOR__ || {}
  if (window.__DSH_HTML_EDITOR_ACTIVE__) return
  window.__DSH_HTML_EDITOR_ACTIVE__ = true

  var MAX_HISTORY = 80
  var COALESCE_MS = 700
  var BLOCKED_TAGS = {
    HTML: 1,
    HEAD: 1,
    META: 1,
    LINK: 1,
    SCRIPT: 1,
    STYLE: 1,
    TITLE: 1,
    BASE: 1,
  }
  var NON_EDITABLE = {
    IMG: 1,
    VIDEO: 1,
    AUDIO: 1,
    CANVAS: 1,
    SVG: 1,
    IFRAME: 1,
    OBJECT: 1,
    EMBED: 1,
    INPUT: 1,
    TEXTAREA: 1,
    SELECT: 1,
    OPTION: 1,
    BR: 1,
    HR: 1,
  }
  var COLOR_PROPS = {
    color: 'color',
    backgroundColor: 'background-color',
    borderColor: 'border-color',
  }
  var CSS_PROPS = {
    color: 'color',
    backgroundColor: 'background-color',
    borderColor: 'border-color',
    borderWidth: 'border-width',
    borderStyle: 'border-style',
    fontSize: 'font-size',
    fontWeight: 'font-weight',
    textAlign: 'text-align',
    borderRadius: 'border-radius',
    opacity: 'opacity',
    padding: 'padding',
    margin: 'margin',
    lineHeight: 'line-height',
    letterSpacing: 'letter-spacing',
    fontFamily: 'font-family',
    width: 'width',
    height: 'height',
  }

  var state = {
    selected: null,
    hovered: null,
    editing: null,
    history: [],
    index: 0,
    savedHtml: '',
    coalesce: { key: '', at: 0 },
    saveToken: '',
    raf: 0,
  }

  var root = null
  var hoverBox = null
  var selBox = null
  var selTag = null
  var selSize = null

  /* ------------------------------------------------------------------ */
  /* utilities                                                          */
  /* ------------------------------------------------------------------ */

  function post(type, payload) {
    try {
      /* Same origin as the chrome that framed us: a wildcard target would hand
         our messages to whatever page the frame was navigated to. */
      window.parent.postMessage(Object.assign({ type: 'dhe:' + type }, payload || {}), window.location.origin)
    } catch (_error) {
      /* parent gone */
    }
  }

  /** The page's own form controls keep their keyboard; only Ctrl/⌘+S stays global. */
  function isTypingTarget(target) {
    if (!target || target.nodeType !== 1) return false
    var tag = target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'OPTION') return true
    return target.isContentEditable === true
  }


  function toast(text) {
    post('toast', { text: text })
  }

  function computedValue(element, property) {
    try {
      return window.getComputedStyle(element).getPropertyValue(property)
    } catch (_error) {
      return ''
    }
  }

  function toHex(value) {
    if (!value) return ''
    var text = String(value).trim()
    if (text === '' || text === 'transparent' || text === 'none') return ''
    if (text.charAt(0) === '#') {
      if (text.length === 4) return '#' + text[1] + text[1] + text[2] + text[2] + text[3] + text[3]
      return text.slice(0, 7)
    }
    var match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/i.exec(text)
    if (!match) return ''
    var alpha = match[4] === undefined ? 1 : Number(match[4])
    if (!(alpha > 0.04)) return ''
    var hex = '#'
    for (var i = 1; i <= 3; i += 1) {
      var channel = Math.max(0, Math.min(255, Math.round(Number(match[i]))))
      hex += (channel < 16 ? '0' : '') + channel.toString(16)
    }
    return hex
  }

  function labelOf(element) {
    if (!element) return ''
    var label = element.tagName.toLowerCase()
    if (element.id) label += '#' + element.id
    var classes = element.classList
    if (classes && classes.length > 0) {
      label += '.' + Array.prototype.slice.call(classes, 0, 2).join('.')
    }
    return label
  }

  function classListOf(element) {
    if (!element || !element.classList) return []
    return Array.prototype.slice.call(element.classList, 0, 12)
  }

  function pathOf(element) {
    if (!element || element === document.body) return ''
    var segments = []
    var current = element
    while (current && current !== document.body && current.parentElement) {
      var index = Array.prototype.indexOf.call(current.parentElement.children, current)
      segments.unshift(String(index))
      current = current.parentElement
    }
    return segments.join('/')
  }

  function byPath(path) {
    if (!path) return document.body
    var current = document.body
    var parts = String(path).split('/')
    for (var i = 0; i < parts.length; i += 1) {
      var index = Number(parts[i])
      if (!Number.isInteger(index) || index < 0) return null
      current = current.children[index]
      if (!current) return null
    }
    return current
  }

  function isOverlay(node) {
    if (!node || !node.closest) return false
    return node.closest('[data-dhe-root]') !== null
  }

  function pickElement(target) {
    if (!target) return null
    var element = target.nodeType === 3 ? target.parentElement : target
    while (element && element !== document.body) {
      if (BLOCKED_TAGS[element.tagName]) return null
      if (element.tagName === 'svg' || element.closest('svg')) return element.closest('svg')
      return element
    }
    return element === document.body ? document.body : null
  }

  function canEditInline(element) {
    if (!element || element === document.body || element === document.documentElement) return false
    if (BLOCKED_TAGS[element.tagName] || NON_EDITABLE[element.tagName]) return false
    for (var i = 0; i < element.children.length; i += 1) {
      var child = element.children[i]
      if (NON_EDITABLE[child.tagName]) return false
      var display = computedValue(child, 'display')
      if (
        display === 'block' ||
        display === 'flex' ||
        display === 'grid' ||
        display === 'table' ||
        display === 'list-item' ||
        display === 'inline-flex' ||
        display === 'inline-grid'
      ) {
        return false
      }
    }
    return true
  }

  function isTextEditable(element) {
    return canEditInline(element) && element.children.length === 0
  }

  function editableFromPoint(x, y) {
    var range = null
    if (document.caretRangeFromPoint) range = document.caretRangeFromPoint(x, y)
    if (!range) return isTextEditable(state.selected) ? state.selected : null
    var node = range.startContainer
    var element = node && node.nodeType === 3 ? node.parentElement : node
    while (element && element !== document.body) {
      if (canEditInline(element)) return element
      element = element.parentElement
    }
    return canEditInline(state.selected) ? state.selected : null
  }

  /* ------------------------------------------------------------------ */
  /* overlay                                                            */
  /* ------------------------------------------------------------------ */

  var STYLE = [
    '[data-dhe-root]{position:fixed;inset:0;z-index:2147483647;pointer-events:none;',
    'font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}',
    '.dhe-hover{position:fixed;border:1px solid rgba(77,107,254,.85);background:rgba(77,107,254,.06);',
    'border-radius:2px;pointer-events:none;transition:opacity .08s linear}',
    '.dhe-sel{position:fixed;border:1.5px solid #4d6bfe;border-radius:2px;pointer-events:none;',
    'box-shadow:0 0 0 1px rgba(255,255,255,.55),0 6px 18px rgba(20,35,110,.14)}',
    '.dhe-sel::before,.dhe-sel::after{content:"";position:absolute;width:7px;height:7px;border-radius:1px;',
    'background:#fff;border:1.5px solid #4d6bfe}',
    '.dhe-sel::before{left:-4px;top:-4px}.dhe-sel::after{right:-4px;bottom:-4px}',
    '.dhe-tag{position:fixed;transform:translateY(-100%);background:#21306e;color:#fff;',
    'font-size:11px;line-height:18px;padding:0 7px;border-radius:4px 4px 0 0;white-space:nowrap;',
    'max-width:340px;overflow:hidden;text-overflow:ellipsis;letter-spacing:.01em;pointer-events:none}',
    '.dhe-size{position:fixed;transform:translateY(4px);background:#21306e;color:#dbe3ff;font-size:10px;',
    'line-height:16px;padding:0 5px;border-radius:3px;white-space:nowrap;pointer-events:none;',
    'font-variant-numeric:tabular-nums}',
  ].join('')

  function ensureStyle() {
    if (document.querySelector('style[data-dhe]')) return
    var style = document.createElement('style')
    style.setAttribute('data-dhe', 'injected')
    style.textContent = STYLE
    ;(document.head || document.documentElement).appendChild(style)
  }

  function ensureRoot() {
    if (root && root.isConnected) return root
    ensureStyle()
    root = document.createElement('div')
    root.setAttribute('data-dhe-root', '')
    root.innerHTML =
      '<div class="dhe-hover" style="display:none"></div>' +
      '<div class="dhe-sel" style="display:none"></div>' +
      '<div class="dhe-tag" style="display:none"></div>' +
      '<div class="dhe-size" style="display:none"></div>'
    hoverBox = root.children[0]
    selBox = root.children[1]
    selTag = root.children[2]
    selSize = root.children[3]
    document.body.appendChild(root)
    return root
  }

  function place(box, rect) {
    if (!rect || rect.width === 0 || rect.height === 0) {
      box.style.display = 'none'
      return
    }
    box.style.display = 'block'
    box.style.left = Math.round(rect.left) + 'px'
    box.style.top = Math.round(rect.top) + 'px'
    box.style.width = Math.max(0, Math.round(rect.width)) + 'px'
    box.style.height = Math.max(0, Math.round(rect.height)) + 'px'
  }

  function draw() {
    state.raf = 0
    ensureRoot()
    if (state.editing) {
      hoverBox.style.display = 'none'
      var editingRect = state.editing.element.getBoundingClientRect()
      place(selBox, editingRect)
      placeTag(editingRect)
      placeSize(editingRect)
      return
    }
    if (state.hovered && state.hovered !== state.selected && state.hovered.isConnected) {
      place(hoverBox, state.hovered.getBoundingClientRect())
    } else {
      hoverBox.style.display = 'none'
    }
    if (state.selected && state.selected.isConnected) {
      var rect = state.selected.getBoundingClientRect()
      place(selBox, rect)
      placeTag(rect)
      placeSize(rect)
    } else {
      selBox.style.display = 'none'
      selTag.style.display = 'none'
      selSize.style.display = 'none'
    }
  }

  function placeTag(rect) {
    if (!rect || rect.width === 0) {
      selTag.style.display = 'none'
      return
    }
    selTag.textContent = labelOf(state.editing ? state.editing.element : state.selected)
    var top = Math.max(18, rect.top)
    selTag.style.display = 'block'
    selTag.style.left = Math.round(rect.left) + 'px'
    selTag.style.top = top + 'px'
  }

  function placeSize(rect) {
    if (!rect || rect.width === 0) {
      selSize.style.display = 'none'
      return
    }
    selSize.textContent = Math.round(rect.width) + ' × ' + Math.round(rect.height)
    selSize.style.display = 'block'
    selSize.style.left = Math.round(rect.left + rect.width) + 'px'
    selSize.style.top = Math.round(rect.top + rect.height) + 'px'
    selSize.style.transform = 'translate(-100%,4px)'
  }

  function scheduleDraw() {
    if (state.raf) return
    state.raf = window.requestAnimationFrame(draw)
  }

  /* ------------------------------------------------------------------ */
  /* history                                                            */
  /* ------------------------------------------------------------------ */

  function captureBody() {
    var clone = document.body.cloneNode(true)
    var junk = clone.querySelectorAll('[data-dhe], [data-dhe-root]')
    for (var i = 0; i < junk.length; i += 1) junk[i].parentNode && junk[i].parentNode.removeChild(junk[i])
    var all = clone.querySelectorAll('*')
    for (var j = 0; j < all.length; j += 1) {
      var attributes = Array.prototype.slice.call(all[j].attributes)
      for (var k = 0; k < attributes.length; k += 1) {
        if (attributes[k].name.indexOf('data-dhe') === 0) all[j].removeAttribute(attributes[k].name)
      }
    }
    return clone.outerHTML
  }

  function currentHtml() {
    return state.history[state.index] ? state.history[state.index].html : ''
  }

  function isDirty() {
    return currentHtml() !== state.savedHtml
  }

  function elementCount() {
    var all = document.body.querySelectorAll('*')
    var count = 0
    for (var i = 0; i < all.length; i += 1) {
      if (!all[i].closest('[data-dhe-root]')) count += 1
    }
    return count
  }

  function broadcastState() {
    post('state', {
      dirty: isDirty(),
      canUndo: state.index > 0,
      canRedo: state.index < state.history.length - 1,
      count: elementCount(),
      path: CONFIG.path || '',
    })
  }

  function record(key) {
    var html = captureBody()
    if (html === currentHtml()) return false
    var now = Date.now()
    if (
      key &&
      key === state.coalesce.key &&
      now - state.coalesce.at < COALESCE_MS &&
      state.index > 0 &&
      state.index === state.history.length - 1
    ) {
      state.history[state.index] = { html: html, path: state.selected ? pathOf(state.selected) : '' }
    } else {
      state.history = state.history.slice(0, state.index + 1)
      state.history.push({ html: html, path: state.selected ? pathOf(state.selected) : '' })
      if (state.history.length > MAX_HISTORY) state.history.shift()
      state.index = state.history.length - 1
    }
    state.coalesce = { key: key || '', at: now }
    broadcastState()
    return true
  }

  function applySnapshot(entry) {
    stopEditing(false, true)
    document.body.outerHTML = entry.html
    ensureRoot()
    state.hovered = null
    state.selected = entry.path ? byPath(entry.path) : null
    if (state.selected === document.body) state.selected = null
    scheduleDraw()
    broadcastState()
    broadcastSelection()
  }

  function undo() {
    if (state.index <= 0) return
    stopEditing(false, true)
    state.index -= 1
    applySnapshot(state.history[state.index])
  }

  function redo() {
    if (state.index >= state.history.length - 1) return
    stopEditing(false, true)
    state.index += 1
    applySnapshot(state.history[state.index])
  }

  /* ------------------------------------------------------------------ */
  /* selection                                                          */
  /* ------------------------------------------------------------------ */

  function select(element) {
    stopEditing(false, false)
    state.selected = element && element.isConnected ? element : null
    state.hovered = null
    scheduleDraw()
    broadcastSelection()
  }

  function stylePayload(element) {
    var borderWidth = computedValue(element, 'border-top-width').replace('px', '')
    var borderStyle = computedValue(element, 'border-top-style')
    return {
      color: toHex(computedValue(element, 'color')),
      backgroundColor: toHex(computedValue(element, 'background-color')),
      borderColor: borderStyle === 'none' || Number(borderWidth) === 0 ? '' : toHex(computedValue(element, 'border-top-color')),
      borderWidth: borderWidth,
      borderStyle: borderStyle,
      fontSize: computedValue(element, 'font-size').replace('px', ''),
      fontWeight: computedValue(element, 'font-weight'),
      textAlign: computedValue(element, 'text-align'),
      borderRadius: computedValue(element, 'border-top-left-radius'),
      opacity: computedValue(element, 'opacity'),
      fontFamily: computedValue(element, 'font-family'),
      lineHeight: computedValue(element, 'line-height'),
      display: computedValue(element, 'display'),
    }
  }

  function ancestorsOf(element) {
    var rows = []
    var current = element
    while (current && current !== document.documentElement && rows.length < 6) {
      rows.unshift({
        tag: current.tagName.toLowerCase(),
        label: labelOf(current),
        path: current === document.body ? '' : pathOf(current),
      })
      current = current.parentElement
    }
    return rows
  }

  function broadcastSelection() {
    var element = state.selected && state.selected.isConnected ? state.selected : null
    if (!element) {
      post('selection', { selection: null })
      return
    }
    var rect = element.getBoundingClientRect()
    post('selection', {
      selection: {
        path: pathOf(element),
        tag: element.tagName.toLowerCase(),
        label: labelOf(element),
        id: element.id || '',
        classes: classListOf(element),
        text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 600),
        textEditable: isTextEditable(element),
        rect: { width: Math.round(rect.width), height: Math.round(rect.height) },
        styles: stylePayload(element),
        ancestors: ancestorsOf(element),
        canDelete: element !== document.body && element.parentElement !== null,
      },
    })
  }

  /* ------------------------------------------------------------------ */
  /* style + content mutations                                          */
  /* ------------------------------------------------------------------ */

  function applyStyles(changes) {
    var element = state.selected
    if (!element) return
    var keys = Object.keys(changes || {})
    if (keys.length === 0) return
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i]
      var property = CSS_PROPS[key]
      if (!property) continue
      var value = changes[key]
      if (value === null || value === undefined || value === '') {
        element.style.removeProperty(property)
        continue
      }
      if (key === 'fontSize' && /^\d+(\.\d+)?$/.test(String(value))) value = String(value) + 'px'
      if (key === 'borderWidth' && /^\d+(\.\d+)?$/.test(String(value))) value = String(value) + 'px'
      element.style.setProperty(property, String(value))
      if (key === 'borderColor') {
        if (element.style.getPropertyValue('border-style') === '' && computedValue(element, 'border-top-style') === 'none') {
          element.style.setProperty('border-style', 'solid')
          element.style.setProperty('border-width', '1px')
        }
      }
    }
    record('style:' + keys.join(','))
    scheduleDraw()
    broadcastSelection()
  }

  function applyText(value) {
    var element = state.selected
    if (!element || !isTextEditable(element)) {
      toast('这个元素包含子组件，请双击其中的文字来编辑')
      return
    }
    if (element.textContent === value) return
    var trimmed = String(value === null || value === undefined ? '' : value)
    element.textContent = trimmed
    record('text')
    scheduleDraw()
    broadcastSelection()
  }

  function deleteSelection() {
    var element = state.selected
    if (!element || element === document.body || !element.parentElement) return
    var parent = element.parentElement
    element.remove()
    state.selected = parent === document.body ? null : parent
    record('delete')
    scheduleDraw()
    broadcastSelection()
  }

  function duplicateSelection() {
    var element = state.selected
    if (!element || element === document.body || !element.parentElement) return
    var clone = element.cloneNode(true)
    clone.removeAttribute('id')
    var identified = clone.querySelectorAll('[id]')
    for (var i = 0; i < identified.length; i += 1) identified[i].removeAttribute('id')
    element.parentElement.insertBefore(clone, element.nextSibling)
    state.selected = clone
    record('duplicate')
    scheduleDraw()
    broadcastSelection()
  }

  /* ------------------------------------------------------------------ */
  /* inline text editing                                                */
  /* ------------------------------------------------------------------ */

  function stopEditing(revert, silent) {
    var editing = state.editing
    if (!editing) return
    state.editing = null
    var element = editing.element
    try {
      element.removeEventListener('blur', editing.onBlur, true)
    } catch (_error) {
      /* detached */
    }
    try {
      if (revert) element.innerHTML = editing.beforeHtml
    } catch (_error) {
      /* detached */
    }
    if (editing.originalContentEditable === null) element.removeAttribute('contenteditable')
    else element.setAttribute('contenteditable', editing.originalContentEditable)
    element.style.removeProperty('user-select')
    element.style.removeProperty('-webkit-user-select')
    if (!silent) {
      record('')
      scheduleDraw()
      broadcastSelection()
    }
  }

  function startEditing(element, x, y) {
    if (!canEditInline(element)) {
      toast('这个元素不能直接改文字，请双击里面的文字')
      return
    }
    stopEditing(false, true)
    select(element)
    state.editing = {
      element: element,
      beforeHtml: element.innerHTML,
      originalContentEditable: element.getAttribute('contenteditable'),
      onBlur: function () {
        if (state.editing && state.editing.element === element) stopEditing(false, false)
      },
    }
    element.addEventListener('blur', state.editing.onBlur, true)
    element.setAttribute('contenteditable', 'true')
    element.style.setProperty('user-select', 'text')
    element.style.setProperty('-webkit-user-select', 'text')
    try {
      element.focus({ preventScroll: true })
    } catch (_error) {
      element.focus()
    }
    try {
      var selection = window.getSelection()
      var range = document.createRange()
      range.selectNodeContents(element)
      selection.removeAllRanges()
      selection.addRange(range)
    } catch (_error) {
      /* selection is best effort */
    }
    scheduleDraw()
    post('editing', { editing: true, label: labelOf(element) })
  }

  /* ------------------------------------------------------------------ */
  /* serialization                                                      */
  /* ------------------------------------------------------------------ */

  function serialize() {
    stopEditing(false, true)
    var clone = document.documentElement.cloneNode(true)
    var junk = clone.querySelectorAll('[data-dhe], [data-dhe-root]')
    for (var i = 0; i < junk.length; i += 1) junk[i].parentNode && junk[i].parentNode.removeChild(junk[i])
    var all = clone.querySelectorAll('*')
    for (var j = 0; j < all.length; j += 1) {
      var attributes = Array.prototype.slice.call(all[j].attributes)
      for (var k = 0; k < attributes.length; k += 1) {
        if (attributes[k].name.indexOf('data-dhe') === 0) all[j].removeAttribute(attributes[k].name)
      }
    }
    var doctype = '<!DOCTYPE html>'
    try {
      if (document.doctype) doctype = new XMLSerializer().serializeToString(document.doctype)
    } catch (_error) {
      /* keep the default doctype */
    }
    return doctype + '\n' + clone.outerHTML + '\n'
  }

  /* ------------------------------------------------------------------ */
  /* events                                                             */
  /* ------------------------------------------------------------------ */

  function onPointerDown(event) {
    if (event.button !== 0) return
    if (isOverlay(event.target)) return
    if (state.editing && state.editing.element.contains(event.target)) return
    var target = pickElement(event.target)
    if (!target) return
    event.stopPropagation()
    try {
      window.focus()
    } catch (_error) {
      /* focus is best effort */
    }
    select(target)
  }

  function onDoubleClick(event) {
    if (isOverlay(event.target)) return
    if (state.editing && state.editing.element.contains(event.target)) return
    var element = editableFromPoint(event.clientX, event.clientY)
    if (!element) {
      toast('这里没有可直接编辑的文字')
      return
    }
    event.preventDefault()
    event.stopPropagation()
    startEditing(element, event.clientX, event.clientY)
  }

  function onPointerMove(event) {
    if (state.editing) return
    if (isOverlay(event.target)) return
    var element = pickElement(event.target)
    if (element === state.hovered) return
    state.hovered = element
    scheduleDraw()
  }

  function onKeyDown(event) {
    var key = event.key
    var meta = event.ctrlKey || event.metaKey
    if (state.editing) {
      if (key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        stopEditing(true, false)
        return
      }
      if (key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        event.stopPropagation()
        stopEditing(false, false)
        return
      }
      if (key === 'Tab') {
        event.preventDefault()
        stopEditing(false, false)
        return
      }
      return
    }
    if (isTypingTarget(event.target) && !(meta && (key === 's' || key === 'S'))) return
    if (meta && (key === 'z' || key === 'Z')) {      event.preventDefault()
      event.stopPropagation()
      if (event.shiftKey) redo()
      else undo()
      return
    }
    if (meta && (key === 'y' || key === 'Y')) {
      event.preventDefault()
      event.stopPropagation()
      redo()
      return
    }
    if (meta && (key === 's' || key === 'S')) {
      event.preventDefault()
      event.stopPropagation()
      requestSave()
      return
    }
    if (meta && (key === 'd' || key === 'D')) {
      event.preventDefault()
      event.stopPropagation()
      duplicateSelection()
      return
    }
    if (key === 'Delete' || key === 'Backspace') {
      if (!state.selected) return
      event.preventDefault()
      event.stopPropagation()
      deleteSelection()
      return
    }
    if (key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      select(null)
    }
  }

  function onPaste(event) {
    if (!state.editing) return
    event.preventDefault()
    var text = (event.clipboardData || window.clipboardData).getData('text/plain')
    document.execCommand('insertText', false, text)
  }

  function requestSave() {
    stopEditing(false, false)
    var token = String(Date.now())
    state.saveToken = token
    /* What dirty-ness is measured against is the body at the moment of the
       click, not the body when the reply arrives: edits made during the round
       trip stay unsaved. */
    state.saveBody = captureBody()
    post('serialize', { requestId: token, html: serialize() })
  }

  function onMessage(event) {
    if (event.source !== window.parent) return
    /* Only our own chrome may drive the canvas: a frame navigated elsewhere
       would otherwise be able to answer a save with arbitrary markup. */
    if (event.origin !== window.location.origin) return
    var data = event.data
    if (!data || typeof data.type !== 'string' || data.type.indexOf('dhe:') !== 0) return
    var payload = data.payload || data
    switch (data.type) {
      case 'dhe:style':
        applyStyles(payload.changes || {})
        break
      case 'dhe:text':
        applyText(payload.value)
        break
      case 'dhe:select':
        if (typeof payload.path === 'string') {
          var target = byPath(payload.path)
          if (target) select(target)
        }
        break
      case 'dhe:command':
        runCommand(payload.name)
        break
      case 'dhe:save':
        requestSave()
        break
      case 'dhe:saved':
        if (payload.requestId === state.saveToken) {
          if (payload.ok) {
            state.savedHtml = typeof state.saveBody === 'string' ? state.saveBody : currentHtml()
            broadcastState()
            toast('已保存')
          }
        }
        break
      case 'dhe:hello':
        broadcastState()
        broadcastSelection()
        break
      default:
        break
    }
  }

  function runCommand(name) {
    if (name === 'undo') undo()
    else if (name === 'redo') redo()
    else if (name === 'delete') deleteSelection()
    else if (name === 'duplicate') duplicateSelection()
    else if (name === 'deselect') select(null)
    else if (name === 'edit-text') {
      if (!state.selected) return
      var rect = state.selected.getBoundingClientRect()
      startEditing(state.selected, rect.left + rect.width / 2, rect.top + rect.height / 2)
    } else if (name === 'select-parent') {
      if (state.selected && state.selected.parentElement) select(state.selected.parentElement)
    }
  }

  /* ------------------------------------------------------------------ */
  /* boot                                                               */
  /* ------------------------------------------------------------------ */

  function boot() {
    if (!document.body) {
      window.setTimeout(boot, 16)
      return
    }
    ensureRoot()
    state.history = [{ html: captureBody(), path: '' }]
    state.index = 0
    state.savedHtml = state.history[0].html

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('dblclick', onDoubleClick, true)
    document.addEventListener('pointermove', onPointerMove, true)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('paste', onPaste, true)
    document.addEventListener(
      'click',
      function (event) {
        if (isOverlay(event.target)) return
        /* A link must never navigate the canvas away: the runtime would be
           gone, and the page it lands on would be the one answering saves. */
        var link = event.target && event.target.closest ? event.target.closest('a[href], area[href]') : null
        if (link) {
          event.preventDefault()
          event.stopPropagation()
          return
        }
        if (state.editing && state.editing.element.contains(event.target)) return
        event.preventDefault()
        event.stopPropagation()
      },
      true,
    )
    document.addEventListener(
      'submit',
      function (event) {
        event.preventDefault()
        event.stopPropagation()
      },
      true,
    )
    document.addEventListener('contextmenu', function (event) {
      if (isOverlay(event.target)) return
      event.preventDefault()
    })
    document.addEventListener('dragstart', function (event) {
      event.preventDefault()
    })
    document.addEventListener(
      'selectstart',
      function (event) {
        if (state.editing) return
        if (isOverlay(event.target)) return
        event.preventDefault()
      },
      true,
    )
    window.addEventListener('scroll', scheduleDraw, true)
    window.addEventListener('resize', scheduleDraw)
    window.addEventListener('message', onMessage)
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleDraw).catch(function () {})
    window.setTimeout(scheduleDraw, 120)
    window.setTimeout(scheduleDraw, 600)

    broadcastState()
    post('ready', {
      title: document.title || '',
      path: CONFIG.path || '',
      edits: elementCount(),
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
  } else {
    boot()
  }
})()
