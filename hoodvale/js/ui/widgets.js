// Generic widgets: tooltip, context menu ("Choose Option"), window manager, number prompt.
// Owner: ui builder.

import { h } from '../core/dom.js';
import { clamp, esc } from './util.js';
import { tabSvg } from './icons.js';

// ------------------------------------------------------------------------------- tooltip
export function createTooltip(U) {
  const el = h('div.u-tip');
  U.roots.menus.append(el);
  let owner = null;
  const tip = {
    show(html, x, y, who = null) {
      owner = who;
      el.innerHTML = html;
      el.classList.add('on');
      tip.move(x, y);
    },
    move(x, y) {
      const w = el.offsetWidth, hh = el.offsetHeight;
      let px = x + 16, py = y + 18;
      if (px + w > window.innerWidth - 6) px = x - w - 12;
      if (py + hh > window.innerHeight - 6) py = y - hh - 12;
      el.style.left = clamp(px, 4, window.innerWidth - w - 4) + 'px';
      el.style.top = clamp(py, 4, window.innerHeight - hh - 4) + 'px';
    },
    hide(who = null) { if (who && owner !== who) return; el.classList.remove('on'); owner = null; },
    // Attach a hover tooltip to an element: html is a string or a function returning one.
    attach(target, html) {
      target.addEventListener('pointerenter', (e) => { if (e.pointerType === 'touch') return; const s = typeof html === 'function' ? html() : html; if (s) tip.show(s, e.clientX, e.clientY, target); });
      target.addEventListener('pointermove', (e) => { if (owner === target) tip.move(e.clientX, e.clientY); });
      target.addEventListener('pointerleave', () => tip.hide(target));
      target.addEventListener('pointerdown', () => tip.hide(target));
    },
  };
  return tip;
}

// ------------------------------------------------------------------------------- context menu
// rows: [{ html, onSelect, cancel? }]. Opens at screen x, y. Mouse: closes when the pointer leaves
// the menu by a margin (RS feel). Any click outside closes it without acting.
export function createMenu(U) {
  let catcher = null, el = null, onClose = null, sel = -1;
  const menu = {
    get isOpen() { return !!el; },
    open(x, y, rows, { title = 'Choose Option', onRightClickOutside = null } = {}) {
      menu.close();
      U.tip?.hide();
      catcher = h('div.u-menu-catch', { 'data-interactive': '' });
      catcher.addEventListener('pointerdown', (e) => {
        if (e.target !== catcher) return;
        e.preventDefault();
        const isRight = e.button === 2;
        menu.close();
        if (isRight && onRightClickOutside) onRightClickOutside(e.clientX, e.clientY);
      });
      catcher.addEventListener('contextmenu', (e) => e.preventDefault());
      catcher.addEventListener('wheel', (e) => { menu.close(); }, { passive: true });
      el = h('div.u-menu', { role: 'menu' }, [h('div.mt', { text: title })]);
      const buttons = [];
      rows.forEach((r, i) => {
        const b = h('button', { html: r.html, role: 'menuitem' });
        if (r.cancel) b.classList.add('cancel');
        b.addEventListener('click', (e) => { e.stopPropagation(); menu.close(); try { r.onSelect?.(); } catch (err) { console.error('[ui] menu', err); } });
        b.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); menu.close(); try { r.onSelect?.(); } catch (err) { console.error(err); } });
        b.addEventListener('pointerenter', () => { sel = i; buttons.forEach((bb, j) => bb.classList.toggle('sel', j === i)); });
        buttons.push(b);
        el.append(b);
      });
      catcher.append(el);
      U.roots.menus.append(catcher);
      const w = el.offsetWidth, hh = el.offsetHeight;
      el.style.left = clamp(x - w / 2, 4, window.innerWidth - w - 4) + 'px';
      el.style.top = clamp(y - 4, 4, window.innerHeight - hh - 4) + 'px';
      sel = -1;
      // Mouse users: leaving the menu closes it.
      catcher.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch' || !el) return;
        const r = el.getBoundingClientRect();
        const m = 28;
        if (e.clientX < r.left - m || e.clientX > r.right + m || e.clientY < r.top - m || e.clientY > r.bottom + m) menu.close();
      });
      menu._buttons = buttons;
      onClose = null;
      return el;
    },
    // Keyboard navigation (arrows / enter) while open.
    key(code) {
      if (!el) return false;
      const b = menu._buttons || [];
      if (code === 'ArrowDown' || code === 'ArrowUp') {
        sel = (sel + (code === 'ArrowDown' ? 1 : -1) + b.length) % b.length;
        b.forEach((bb, j) => bb.classList.toggle('sel', j === sel));
        return true;
      }
      if (code === 'Enter' || code === 'Space') { if (sel >= 0) b[sel].click(); return true; }
      if (code === 'Escape') { menu.close(); return true; }
      return false;
    },
    close() {
      if (!catcher) return;
      catcher.remove();
      catcher = null; el = null;
      onClose?.();
    },
  };
  return menu;
}

// ------------------------------------------------------------------------------- windows
// openWindow(id, { title, icon, render(body, win), width, height, onClose, className,
//   parchment, closable = true, sheet = true (phone bottom sheet), anchor: 'center'|'left'|'right' })
export function createWindows(U) {
  const open = new Map(); // id -> win
  let z = 10;
  const root = U.roots.windows;

  function focus(win) { win.el.style.zIndex = String(++z); }

  const wm = {
    get open() { return open; },
    get(id) { return open.get(id) || null; },
    isOpen(id) { return open.has(id); },
    top() { let best = null; for (const w of open.values()) if (!best || +w.el.style.zIndex > +best.el.style.zIndex) best = w; return best; },
    openWindow(id, opts = {}) {
      if (open.has(id)) wm.closeWindow(id, { silent: true, reopen: true });
      const { title = '', icon = null, width = 420, height = null, className = '', parchment = false, closable = true, sheet = true, anchor = 'center' } = opts;
      const el = h('div.u-win' + (parchment ? '.u-parch' : '.u-frame'), { 'data-interactive': '', 'data-win': id });
      if (className) for (const c of className.split(/\s+/).filter(Boolean)) el.classList.add(c);
      if (sheet) el.classList.add('sheet');
      el.style.width = typeof width === 'number' ? `min(${width}px, calc(100vw - 12px))` : width;
      if (height) el.style.height = typeof height === 'number' ? `min(${height}px, calc(100vh - 12px))` : height;
      const head = h('div.u-win-h');
      if (icon) head.append(typeof icon === 'string' ? h('img', { src: icon, alt: '' }) : icon);
      const titleEl = h('div.u-title', { text: title });
      head.append(titleEl);
      if (closable) {
        const x = h('button.u-x', { 'aria-label': 'Close', title: 'Close (Esc)', html: tabSvg('close') });
        x.addEventListener('click', () => wm.closeWindow(id));
        head.append(x);
      }
      const body = h('div.u-win-b');
      el.append(head, body);
      root.append(el);
      const win = { id, el, head, body, titleEl, opts, setTitle(t) { titleEl.textContent = t; }, close: () => wm.closeWindow(id) };
      open.set(id, win);
      el.addEventListener('pointerdown', () => focus(win));
      focus(win);
      try { opts.render?.(body, win); } catch (err) { console.error('[ui] window render', id, err); body.append(h('div', { text: 'This window failed to open.' })); }
      wm.place(win, anchor);
      if (U.layout !== 'phone') makeDraggable(win);
      U.events.emit('ui:window', { id, open: true });
      return win;
    },
    place(win, anchor = win.opts.anchor || 'center') {
      const el = win.el;
      if (U.layout === 'phone' && win.opts.sheet !== false) { el.style.left = '0px'; el.style.top = 'auto'; return; }
      const w = el.offsetWidth, hh = el.offsetHeight;
      const W = window.innerWidth, H = window.innerHeight;
      let x = (W - w) / 2, y = (H - hh) / 2 - H * 0.04;
      if (anchor === 'left') x = Math.max(8, Math.min(W * 0.06, W - w - 8));
      if (anchor === 'game') { // centred in the play area (left of the side panel on desktop)
        const right = U.layout === 'desk' ? 262 : 0;
        x = (W - right - w) / 2;
      }
      el.style.left = clamp(x, 6, W - w - 6) + 'px';
      el.style.top = clamp(y, 6, H - hh - 6) + 'px';
    },
    closeWindow(id, { silent = false, reopen = false } = {}) {
      const win = open.get(id);
      if (!win) return false;
      open.delete(id);
      win.el.remove();
      if (!reopen) { try { win.opts.onClose?.(); } catch (err) { console.error('[ui] window onClose', id, err); } }
      if (!silent) U.events.emit('ui:window', { id, open: false });
      return true;
    },
    closeTop() {
      const t = wm.top();
      if (!t || t.opts.closable === false) return false;
      return wm.closeWindow(t.id);
    },
    closeAll(filter = () => true) { for (const id of [...open.keys()]) if (filter(open.get(id))) wm.closeWindow(id); },
    relayout() { for (const w of open.values()) wm.place(w); },
  };

  function makeDraggable(win) {
    const { el, head } = win;
    el.classList.add('drag');
    let start = null;
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      start = { x: e.clientX, y: e.clientY, l: el.offsetLeft, t: el.offsetTop };
      head.setPointerCapture(e.pointerId);
    });
    head.addEventListener('pointermove', (e) => {
      if (!start) return;
      el.style.left = clamp(start.l + e.clientX - start.x, -el.offsetWidth + 80, window.innerWidth - 80) + 'px';
      el.style.top = clamp(start.t + e.clientY - start.y, 0, window.innerHeight - 40) + 'px';
    });
    const end = () => { start = null; };
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
  }
  return wm;
}

// ------------------------------------------------------------------------------- prompt
// Small modal asking for a number (or text). Resolves with the value or null.
export function promptValue(U, { title = 'Enter amount', label = '', value = '', type = 'number', max = 2147483647 } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; U.windows.closeWindow('prompt', { silent: true }); resolve(v); };
    U.windows.openWindow('prompt', {
      title, width: 300, sheet: false, className: 'u-prompt',
      onClose: () => finish(null),
      render(body) {
        const input = h('input', { type: type === 'number' ? 'text' : 'text', inputmode: type === 'number' ? 'numeric' : 'text', value: String(value), maxlength: '12', style: { width: '100%', boxSizing: 'border-box', fontSize: '16px' } });
        const submit = () => {
          let v = input.value.trim();
          if (type === 'number') {
            const m = /^(\d+(?:\.\d+)?)\s*([kmb])?$/i.exec(v.replace(/,/g, ''));
            if (!m) { input.focus(); input.select(); return; }
            let n = parseFloat(m[1]) * ({ k: 1e3, m: 1e6, b: 1e9 }[(m[2] || '').toLowerCase()] || 1);
            n = Math.min(max, Math.floor(n));
            if (!(n > 0)) { input.focus(); return; }
            finish(n);
          } else finish(v);
        };
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
          if (e.key === 'Escape') { e.preventDefault(); finish(null); }
          e.stopPropagation();
        });
        body.append(
          label ? h('div', { text: label, style: { margin: '0 0 8px', color: 'var(--parch-dim)', fontSize: '13px' } }) : null,
          input,
          h('div', { style: { display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' } }, [
            h('button.u-btn', { text: 'Cancel', onclick: () => finish(null) }),
            h('button.u-btn.primary', { text: 'OK', onclick: submit }),
          ]),
        );
        setTimeout(() => { input.focus(); input.select(); }, 30);
      },
    });
  });
}

export function confirmBox(U, { title = 'Are you sure?', text = '', yes = 'Yes', no = 'No' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; U.windows.closeWindow('confirm', { silent: true }); resolve(v); };
    U.windows.openWindow('confirm', {
      title, width: 340, sheet: false, onClose: () => finish(false),
      render(body) {
        body.append(h('p', { html: esc(text), style: { margin: '2px 0 12px', lineHeight: '1.4' } }), h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } }, [
          h('button.u-btn', { text: no, onclick: () => finish(false) }),
          h('button.u-btn.primary', { text: yes, onclick: () => finish(true) }),
        ]));
      },
    });
  });
}
