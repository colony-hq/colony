// DOM helpers for the UI layer. Every UI module injects its own CSS through injectStyle so
// index.html only carries the shared tokens.

const injected = new Set();

export function injectStyle(id, css) {
  if (injected.has(id)) return;
  injected.add(id);
  const el = document.createElement('style');
  el.dataset.lentera = id;
  el.textContent = css;
  document.head.appendChild(el);
}

// h('div.card#main', { onclick }, [children]) -> HTMLElement
export function h(tag, props = {}, children = []) {
  const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(tag);
  const el = document.createElement((m && m[1]) || 'div');
  if (m && m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g)) {
      if (part[0] === '.') el.classList.add(part.slice(1));
      else el.id = part.slice(1);
    }
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

// Root containers declared in index.html.
export function uiRoot(name) {
  return document.getElementById(name);
}
