import gramLogo from './assets/gram.svg';

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}
function icon(name) {
  if (name === 'gram') {
    const mark = document.createElement('img');
    mark.className = 'icon currency-icon';
    mark.src = gramLogo;
    mark.alt = '';
    mark.setAttribute('aria-hidden', 'true');
    mark.width = 16;
    mark.height = 16;
    return mark;
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}
function stat(name, text, label, className = '') {
  const node = element('span', className);
  node.setAttribute('aria-label', `${label}: ${text}`);
  node.dataset.metric = name;
  node.append(icon(name), element('span', '', text));
  return node;
}
function metric(list, label, value, key) {
  const item = element('div');
  const number = element('dd', '', value);
  number.dataset.metric = key;
  item.append(element('dt', '', label), number);
  list.append(item);
}
function setText(node, value) {
  if (node.textContent !== value) node.textContent = value;
}
// Card controls that keep their node, and focus, across updates.
const CONTROLS = ['card-view', 'like-button', 'group-name'];
function childKey(node) {
  if (node.nodeType !== 1) return null;
  if (node.dataset.metric) return `metric:${node.dataset.metric}`;
  return CONTROLS.find((name) => node.classList.contains(name)) ?? null;
}

function sameNodeType(a, b) {
  return (
    a?.nodeType === b.nodeType &&
    (b.nodeType !== 1 || a.localName === b.localName)
  );
}

// Reconcile a changed card without replacing its controls, images or text nodes.
function updateNode(current, next) {
  if (current.nodeType !== 1) {
    if (current.nodeValue !== next.nodeValue)
      current.nodeValue = next.nodeValue;
    return;
  }
  for (const name of current.getAttributeNames())
    if (!next.hasAttribute(name)) current.removeAttribute(name);
  for (const name of next.getAttributeNames())
    if (current.getAttribute(name) !== next.getAttribute(name))
      current.setAttribute(name, next.getAttribute(name));
  const previous = [...current.childNodes];
  const used = new Set();
  [...next.childNodes].forEach((child, index) => {
    const key = childKey(child);
    const candidate = key
      ? previous.find(
          (node) =>
            !used.has(node) &&
            childKey(node) === key &&
            sameNodeType(node, child),
        )
      : previous.find(
          (node, i) =>
            i === index &&
            !used.has(node) &&
            !childKey(node) &&
            sameNodeType(node, child),
        );
    if (candidate) {
      if (current.childNodes[index] !== candidate)
        current.insertBefore(candidate, current.childNodes[index] || null);
      updateNode(candidate, child);
      used.add(candidate);
    } else {
      current.insertBefore(child, current.childNodes[index] || null);
      used.add(child);
    }
  });
  for (const node of previous) if (!used.has(node)) node.remove();
}

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches)
    for (const node of document.getElementById('cards').querySelectorAll('*'))
      node.getAnimations?.().forEach((animation) => animation.cancel());
});
// Low-end Android devices get the same still interface as reduced motion.
function reduceMotion() {
  return (
    reducedMotion.matches ||
    document.documentElement.dataset.performance === 'low'
  );
}
function gentlyReveal(node) {
  if (reduceMotion()) {
    node.getAnimations?.().forEach((animation) => animation.cancel());
    return;
  }
  if (typeof node.animate === 'function')
    node.animate([{ opacity: 0.55 }, { opacity: 1 }], {
      duration: 240,
      easing: 'ease-out',
    });
}

// Brings the list in line with freshly rendered cards while keeping existing
// nodes: unchanged cards are untouched and changed values patch in place. On a
// background update, changed values and moved cards fade in gently, focus stays
// put and the first card below the toolbar keeps its place on screen.
function reconcileCards(list, cards, { background = false } = {}) {
  const focused = document.activeElement;
  const focusedKey = focused?.closest('.otc-card')?.dataset.key;
  const focusedControl = CONTROLS.find((name) =>
    focused?.classList.contains(name),
  );
  const line =
    document.querySelector('.toolbar')?.getBoundingClientRect().bottom ?? 0;
  const anchor =
    background && scrollY > 0
      ? [...list.children].find(
          (node) => node.getBoundingClientRect().bottom > line,
        )
      : null;
  const anchorTop = anchor?.getBoundingClientRect().top;
  const existing = new Map(
    [...list.children].map((node) => [node.dataset.key, node]),
  );
  cards.forEach((next, index) => {
    const old = existing.get(next.dataset.key);
    let card = next;
    if (old && old.outerHTML === next.outerHTML) card = old;
    else if (old && old.dataset.mode === next.dataset.mode) {
      const before = new Map(
        [...old.querySelectorAll('[data-metric]')].map((node) => [
          node.dataset.metric,
          node.textContent,
        ]),
      );
      updateNode(old, next);
      card = old;
      for (const node of card.querySelectorAll('[data-metric]'))
        if (
          before.has(node.dataset.metric) &&
          node.textContent !== before.get(node.dataset.metric)
        )
          gentlyReveal(node);
    } else if (old) old.replaceWith(next);
    else if (background) gentlyReveal(next);
    if (list.children[index] !== card) {
      list.insertBefore(card, list.children[index] || null);
      if (background && old) gentlyReveal(card);
    }
    existing.delete(card.dataset.key);
  });
  for (const unused of existing.values()) unused.remove();
  if (anchor?.isConnected) {
    const shift = anchor.getBoundingClientRect().top - anchorTop;
    if (Math.abs(shift) > 0.5) window.scrollBy(0, shift);
  }
  if (focusedKey && focusedControl && document.activeElement !== focused)
    [...list.children]
      .find((card) => card.dataset.key === focusedKey)
      ?.querySelector(`.${focusedControl}`)
      ?.focus({ preventScroll: true });
}

export {
  element,
  icon,
  stat,
  metric,
  setText,
  updateNode,
  gentlyReveal,
  reduceMotion,
  reconcileCards,
};
