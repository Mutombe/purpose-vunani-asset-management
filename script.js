// Shared by every page; each block below checks that its elements exist first.
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Mobile nav
const toggle = document.getElementById('navToggle');
const links = document.getElementById('navLinks');
if (toggle && links) {
  const setMenu = open => {
    links.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open);
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.classList.toggle('menu-open', open); // locks page scroll
  };
  toggle.addEventListener('click', () => setMenu(!links.classList.contains('open')));
  links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
}

// Credentials strip: drifts on its own, pauses under the pointer or finger,
// and can be dragged (mouse, with momentum) or swiped (touch, native scroll).
const strip = document.getElementById('strip');
if (strip) {
  const track = strip.querySelector('.strip__track');
  const originals = [...track.children];
  originals.forEach(li => {
    const copy = li.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    copy.querySelectorAll('a').forEach(a => { a.tabIndex = -1; });
    track.appendChild(copy);
  });
  const SPEED = reduceMotion ? 0 : 32; // px per second
  let loop = 0, pos = 0, vel = 0, last = 0, hover = false, touchHold = false, visible = true, running = false;
  const measure = () => { loop = track.children[originals.length].offsetLeft - track.children[0].offsetLeft; };
  measure();
  addEventListener('resize', measure);

  const wrap = () => {
    if (!loop) return;
    if (pos >= loop) pos -= loop;
    else if (pos < 0) pos += loop;
  };
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    // someone scrolled it natively (touch swipe, trackpad): carry on from there
    if (Math.abs(strip.scrollLeft - Math.round(pos)) > 2) pos = strip.scrollLeft;
    if (!drag) {
      pos += vel * dt;
      vel *= Math.pow(0.04, dt); // momentum decays over roughly a second
      if (Math.abs(vel) < 4) vel = 0;
      if (!hover && !touchHold) pos += SPEED * dt;
    }
    wrap();
    strip.scrollLeft = pos;
    if (visible && !document.hidden) requestAnimationFrame(tick);
    else running = false;
  }
  const start = () => { if (!running) { running = true; last = performance.now(); requestAnimationFrame(tick); } };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); }).observe(strip);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
  strip.scrollLeft = pos = 1;
  start();

  strip.addEventListener('mouseenter', () => { hover = true; });
  strip.addEventListener('mouseleave', () => { hover = false; });
  strip.addEventListener('focusin', () => { hover = true; });
  strip.addEventListener('focusout', () => { hover = false; });
  let touchTimer;
  strip.addEventListener('touchstart', () => { touchHold = true; clearTimeout(touchTimer); }, { passive: true });
  strip.addEventListener('touchend', () => { touchTimer = setTimeout(() => { touchHold = false; }, 2500); });

  // Mouse drag with momentum
  let drag = null, justDragged = false;
  strip.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag = { x: e.clientX, pos, moved: false, lastX: e.clientX, lastT: performance.now(), v: 0 };
    vel = 0;
  });
  addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 5) { drag.moved = true; strip.classList.add('is-drag'); strip.setPointerCapture?.(e.pointerId); }
    if (!drag.moved) return;
    const now = performance.now(), dt = (now - drag.lastT) / 1000;
    if (dt > 0) drag.v = 0.8 * (-(e.clientX - drag.lastX) / dt) + 0.2 * drag.v;
    drag.lastX = e.clientX; drag.lastT = now;
    pos = drag.pos - dx;
    wrap();
    strip.scrollLeft = pos;
  });
  addEventListener('pointerup', () => {
    if (!drag) return;
    if (drag.moved) {
      vel = Math.max(-2500, Math.min(2500, drag.v));
      justDragged = true;
      setTimeout(() => { justDragged = false; }, 0);
    }
    strip.classList.remove('is-drag');
    drag = null;
  });
  strip.addEventListener('click', e => { if (justDragged) { e.preventDefault(); e.stopPropagation(); } }, true);
  strip.addEventListener('dragstart', e => e.preventDefault());

  // On touch screens the first tap opens a pill to show its detail, the second follows the link
  let lastPointer = 'mouse';
  strip.addEventListener('pointerdown', e => { lastPointer = e.pointerType; }, true);
  strip.addEventListener('click', e => {
    const cred = e.target.closest('.cred');
    if (!cred || lastPointer !== 'touch' || cred.classList.contains('is-peek')) return;
    e.preventDefault();
    strip.querySelectorAll('.is-peek').forEach(c => c.classList.remove('is-peek'));
    cred.classList.add('is-peek');
    requestAnimationFrame(measure);
  });
  document.addEventListener('pointerdown', e => {
    if (!e.target.closest('.strip')) strip.querySelectorAll('.is-peek').forEach(c => c.classList.remove('is-peek'));
  });
}

// Scroll reveal (also triggers the chart, network, staircase and step animations)
const io = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  });
}, { threshold: 0.18 });
document.querySelectorAll('.reveal').forEach(el => io.observe(el));

// Fast scrolls can carry an element past the viewport between observer callbacks,
// so also reveal anything that is already above the fold.
let sweeping = false;
addEventListener('scroll', () => {
  if (sweeping) return;
  sweeping = true;
  requestAnimationFrame(() => {
    document.querySelectorAll('.reveal:not(.in)').forEach(el => {
      if (el.getBoundingClientRect().top < innerHeight) { el.classList.add('in'); io.unobserve(el); }
    });
    sweeping = false;
  });
}, { passive: true });

// Photo framing: pick each photo's crop on the visitor's actual screen so the
// subject box (data-focus="L T R B", % of the image) stays fully in frame and
// clear of anything marked data-obstacle in the same [data-photo-scope].
function obstacleRects(img) {
  const scope = img.closest('[data-photo-scope]');
  if (!scope) return [];
  const slide = img.closest('.slide');
  const out = [];
  scope.querySelectorAll('[data-obstacle]').forEach(el => {
    const other = el.closest('.slide');
    if (other && other !== slide) return;           // another slide's caption
    if (!el.getClientRects().length) return;        // display:none
    if (el.dataset.obstacle === 'text') {
      const r = document.createRange();
      r.selectNodeContents(el);
      out.push(...[...r.getClientRects()].filter(q => q.width && q.height));
    } else {
      out.push(el.getBoundingClientRect());
    }
  });
  return out;
}

function frameImg(img) {
  const nw = img.naturalWidth || +img.getAttribute('width');
  const nh = img.naturalHeight || +img.getAttribute('height');
  const W = img.offsetWidth, H = img.offsetHeight;
  if (!nw || !nh || !W || !H) return;
  // unscaled layout box (reveal and zoom animations may be scaling the element)
  const br = img.getBoundingClientRect();
  const fx = br.left + br.width / 2 - W / 2, fy = br.top + br.height / 2 - H / 2;
  const [L, T, R, B] = img.dataset.focus.split(/\s+/).map(Number);
  const s = Math.max(W / nw, H / nh), rw = nw * s, rh = nh * s;
  const obs = obstacleRects(img).map(o => ({
    l: Math.max(o.left - fx, 0), t: Math.max(o.top - fy, 0),
    r: Math.min(o.right - fx, W), b: Math.min(o.bottom - fy, H)
  })).filter(o => o.r > o.l && o.b > o.t);
  const sw = (R - L) / 100 * rw, sh = (B - T) / 100 * rh, area = sw * sh;
  const N = 64;
  let best = null;
  for (let i = 0; i <= N; i++) {
    const px = (W - rw) * i / N;
    for (let j = 0; j <= N; j++) {
      const py = (H - rh) * j / N;
      const l = px + L / 100 * rw, t = py + T / 100 * rh, r = l + sw, b = t + sh;
      const iw = Math.max(0, Math.min(r, W) - Math.max(l, 0));
      const ih = Math.max(0, Math.min(b, H) - Math.max(t, 0));
      const outside = 1 - iw * ih / area;
      let cov = 0;
      for (const o of obs) {
        cov += Math.max(0, Math.min(r, o.r) - Math.max(l, o.l)) * Math.max(0, Math.min(b, o.b) - Math.max(t, o.t));
      }
      const covered = Math.min(1, cov / area);
      const dx = ((l + r) / 2 - W / 2) / W, dy = ((t + b) / 2 - H / 2) / H;
      const cost = 1000 * (outside + covered) + dx * dx + dy * dy;
      if (!best || cost < best.cost) best = { cost, px, py };
    }
  }
  img.style.objectPosition = `${best.px.toFixed(1)}px ${best.py.toFixed(1)}px`;
}

const framed = [...document.querySelectorAll('img[data-focus]')];
function frameAll() { framed.forEach(frameImg); }
framed.forEach(img => { if (!img.complete) img.addEventListener('load', () => frameImg(img)); });
frameAll();
document.fonts && document.fonts.ready.then(frameAll);
addEventListener('load', () => setTimeout(frameAll, 1100));
let frameTimer;
addEventListener('resize', () => { clearTimeout(frameTimer); frameTimer = setTimeout(frameAll, 120); });

// Arrow-key movement within a row of tabs
function tabKeys(tabs, select) {
  tabs.forEach((t, i) => t.addEventListener('keydown', e => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    let next = step === undefined ? null : (i + step + tabs.length) % tabs.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    select(next);
    tabs[next].focus();
  }));
}

// Portfolio donut: example profiles, and hover or focus a slice or legend row for detail
const PROFILES = { // illustrative mixes, in percent
  conservative: { fi: 55, eq: 15, pr: 10, ca: 20 },
  balanced: { fi: 40, eq: 28, pr: 18, ca: 14 },
  growth: { fi: 22, eq: 48, pr: 20, ca: 10 }
};
const CLASSES = { fi: 'Fixed income', eq: 'Equities', pr: 'Property', ca: 'Cash & deposits' };
document.querySelectorAll('[data-donut]').forEach(folio => {
  const segs = [...folio.querySelectorAll('.seg')];
  const rows = [...folio.querySelectorAll('.folio__legend li')];
  const tabs = [...folio.querySelectorAll('[data-profile]')];
  const value = folio.querySelector('[data-donut-value]');
  const label = folio.querySelector('[data-donut-label]');
  let mix;

  function highlight(key) {
    folio.classList.toggle('has-hi', !!key);
    segs.concat(rows).forEach(el => el.classList.toggle('is-hi', el.dataset.key === key));
    value.textContent = key ? `${mix[key]}%` : '4';
    label.textContent = key ? CLASSES[key] : 'asset classes';
  }
  function setProfile(i) {
    tabs.forEach((t, j) => { t.setAttribute('aria-selected', i === j); t.tabIndex = i === j ? 0 : -1; });
    mix = PROFILES[tabs[i].dataset.profile];
    let off = 0;
    segs.forEach(seg => {
      const k = seg.dataset.key;
      seg.style.setProperty('--len', mix[k]);
      seg.style.setProperty('--off', off);
      off += mix[k];
    });
    rows.forEach(r => { r.querySelector('b').textContent = `${mix[r.dataset.key]}%`; });
    highlight(null);
  }
  tabs.forEach((t, i) => t.addEventListener('click', () => setProfile(i)));
  tabKeys(tabs, setProfile);
  segs.concat(rows).forEach(el => {
    el.addEventListener('mouseenter', () => highlight(el.dataset.key));
    el.addEventListener('mouseleave', () => highlight(null));
    el.addEventListener('focus', () => highlight(el.dataset.key));
    el.addEventListener('blur', () => highlight(null));
    el.addEventListener('click', () => highlight(el.dataset.key)); // touch screens have no hover
  });
  setProfile(Math.max(0, tabs.findIndex(t => t.getAttribute('aria-selected') === 'true')));
});

// Network map: pick a city to read about it
document.querySelectorAll('[data-net]').forEach(tile => {
  const nodes = [...tile.querySelectorAll('.node')];
  const box = tile.querySelector('.net__info');
  const city = tile.querySelector('[data-net-city]');
  const info = tile.querySelector('[data-net-info]');
  function pick(node) {
    if (node.classList.contains('is-on')) return;
    nodes.forEach(n => { n.classList.toggle('is-on', n === node); n.setAttribute('aria-pressed', n === node); });
    city.textContent = node.dataset.city;
    info.textContent = node.dataset.info;
    box.classList.remove('is-swap');
    void box.offsetWidth; // restart the swap animation
    box.classList.add('is-swap');
  }
  nodes.forEach(n => {
    n.setAttribute('aria-label', n.dataset.city);
    n.setAttribute('aria-pressed', n.classList.contains('is-on'));
    ['click', 'mouseenter', 'focus'].forEach(ev => n.addEventListener(ev, () => pick(n)));
  });
});

// Investment cycle: a five-part dial synced with the tabs; advances on its own until touched
const SVG = 'http://www.w3.org/2000/svg';
document.querySelectorAll('[data-cycle]').forEach(cycle => {
  const ring = cycle.querySelector('.cycle__ring');
  const tabs = [...cycle.querySelectorAll('[data-step]')];
  const panels = [...cycle.querySelectorAll('.cycle__panel')];
  const num = cycle.querySelector('[data-cycle-n]');
  const title = cycle.querySelector('[data-cycle-title]');
  const n = tabs.length, C = 160, R = 128, GAP = 5;
  const el = (name, attrs) => {
    const e = document.createElementNS(SVG, name);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    return ring.appendChild(e);
  };
  const at = (deg, r) => [C + r * Math.cos(deg * Math.PI / 180), C + r * Math.sin(deg * Math.PI / 180)];
  el('circle', { class: 'cycle__track', cx: C, cy: C, r: R });
  el('circle', { class: 'cycle__inner', cx: C, cy: C, r: 92 });
  const arcs = [], lbls = [];
  for (let i = 0; i < n; i++) {
    const a0 = -90 + i * 360 / n + GAP / 2, a1 = -90 + (i + 1) * 360 / n - GAP / 2;
    const [x0, y0] = at(a0, R), [x1, y1] = at(a1, R), [lx, ly] = at((a0 + a1) / 2, R);
    const arc = el('path', { class: 'cycle__arc', d: `M${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}` });
    arc.addEventListener('click', () => select(i, true));
    arcs.push(arc);
    const t = el('text', { class: 'cycle__lbl', x: lx.toFixed(2), y: ly.toFixed(2) });
    t.textContent = String(i + 1).padStart(2, '0');
    lbls.push(t);
  }
  // Each tab carries a line that traces its rounded border, starting where the
  // top-left corner begins to curve; when the line meets its tail the cycle moves on
  const traces = tabs.map(t => {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'cycle__trace');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('pathLength', '100');
    svg.appendChild(path);
    t.appendChild(svg);
    path.addEventListener('animationend', () => { if (auto && inView && t.getAttribute('aria-selected') === 'true') select((current + 1) % n); });
    return path;
  });
  const drawTraces = () => tabs.forEach((t, i) => {
    const w = t.offsetWidth, h = t.offsetHeight, k = 1; // inset so the stroke sits on the border
    if (!w || !h) return;
    const r = Math.min(parseFloat(getComputedStyle(t).borderTopLeftRadius) || 0, h / 2, w / 2) - k / 2;
    const x0 = k, y0 = k, x1 = w - k, y1 = h - k;
    traces[i].setAttribute('d', `M${x0} ${y0 + r}A${r} ${r} 0 0 1 ${x0 + r} ${y0}H${x1 - r}A${r} ${r} 0 0 1 ${x1} ${y0 + r}V${y1 - r}A${r} ${r} 0 0 1 ${x1 - r} ${y1}H${x0 + r}A${r} ${r} 0 0 1 ${x0} ${y1 - r}Z`);
  });
  drawTraces();
  if ('ResizeObserver' in window) new ResizeObserver(drawTraces).observe(tabs[0].parentElement);

  tabs.forEach((t, i) => {
    t.id = t.id || `cycle-tab-${i}`;
    panels[i].id = panels[i].id || `cycle-panel-${i}`;
    t.setAttribute('aria-controls', panels[i].id);
    panels[i].setAttribute('aria-labelledby', t.id);
  });

  let current = 0, auto = !reduceMotion;
  function select(i, byUser) {
    current = i;
    tabs.forEach((t, j) => { t.setAttribute('aria-selected', i === j); t.tabIndex = i === j ? 0 : -1; });
    panels.forEach((p, j) => p.classList.toggle('is-on', i === j));
    arcs.forEach((a, j) => a.classList.toggle('is-on', i === j));
    lbls.forEach((l, j) => l.classList.toggle('is-on', i === j));
    num.textContent = String(i + 1).padStart(2, '0');
    title.textContent = tabs[i].textContent.replace(/\d+/, '').trim();
    if (byUser) { auto = false; cycle.classList.remove('is-auto'); }
  }
  let inView = false;
  new IntersectionObserver(([e]) => {
    inView = e.isIntersecting;
    cycle.classList.remove('is-auto');
    if (inView && auto) {
      drawTraces();
      void cycle.offsetWidth; // restart the trace on the current tab
      cycle.classList.add('is-auto');
    }
  }, { threshold: 0.35 }).observe(cycle);
  tabs.forEach((t, i) => t.addEventListener('click', () => select(i, true)));
  tabKeys(tabs, i => select(i, true));
  select(0);
});

// About timeline years
document.querySelectorAll('[data-years]').forEach(years => {
  const tabs = [...years.querySelectorAll('[data-year]')];
  const panels = [...years.querySelectorAll('.years__panel')];
  const bar = years.querySelector('.years__bar');
  function select(i) {
    tabs.forEach((t, j) => { t.setAttribute('aria-selected', i === j); t.tabIndex = i === j ? 0 : -1; });
    panels.forEach((p, j) => p.classList.toggle('is-on', i === j));
    bar.style.setProperty('--i', i);
  }
  tabs.forEach((t, i) => t.addEventListener('click', () => select(i)));
  tabKeys(tabs, select);
  select(0);
});

// Count-up statistics
const counters = document.querySelectorAll('[data-count]');
if (counters.length && !reduceMotion) {
  const cio = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    cio.unobserve(e.target);
    const el = e.target, end = +el.dataset.count, pre = el.dataset.prefix || '', suf = el.dataset.suffix || '';
    const t0 = performance.now();
    const step = now => {
      const p = Math.min(1, (now - t0) / 1400), eased = 1 - Math.pow(1 - p, 3);
      el.textContent = pre + Math.round(end * eased) + suf;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }), { threshold: 0.6 });
  counters.forEach(c => cio.observe(c));
}

// Carousel
const carousel = document.getElementById('carousel');
if (carousel) {
  const slides = [...carousel.querySelectorAll('.slide')];
  const dotsWrap = carousel.querySelector('.carousel__dots');
  const count = document.createElement('div');
  count.className = 'carousel__count num';
  count.setAttribute('data-obstacle', '');
  count.setAttribute('aria-hidden', 'true');
  carousel.appendChild(count);
  let current = 0, timer;

  slides.forEach((_, i) => {
    const b = document.createElement('button');
    b.setAttribute('aria-label', `Slide ${i + 1}`);
    b.addEventListener('click', () => go(i));
    dotsWrap.appendChild(b);
  });
  const dots = [...dotsWrap.children];

  function go(i) {
    slides[current].classList.remove('is-active');
    dots[current].classList.remove('on');
    current = (i + slides.length) % slides.length;
    slides[current].classList.add('is-active');
    void dots[current].offsetWidth; // restart progress animation
    dots[current].classList.add('on');
    count.innerHTML = `${String(current + 1).padStart(2, '0')}<small> / ${String(slides.length).padStart(2, '0')}</small>`;
    const img = slides[current].querySelector('img[data-focus]');
    if (img) frameImg(img);
    clearTimeout(timer);
    timer = setTimeout(() => go(current + 1), 6000);
  }
  carousel.querySelector('.carousel__btn--prev').addEventListener('click', () => go(current - 1));
  carousel.querySelector('.carousel__btn--next').addEventListener('click', () => go(current + 1));
  go(0);
}

// Fee calculator: the slider runs on a log scale from 10,000 to 25,000,000
const range = document.getElementById('calcRange');
if (range) {
  const MIN = 1e4, MAX = 2.5e7;
  const BANDS = [ // [upper limit, annual fee %], from the published equities schedule
    [500000, 1.1], [1499999, 1.0], [3000000, 0.9], [10000000, 0.7], [Infinity, 0.5]
  ];
  const outAmount = document.getElementById('calcAmount');
  const outRate = document.getElementById('calcRate');
  const outFee = document.getElementById('calcFee');
  const rows = [...document.querySelectorAll('.fees tbody tr')];
  const steps = [...document.querySelectorAll('.stairs__step')];
  const fmt = n => Math.round(n).toLocaleString('en-US');

  const niceAmount = v => {
    // round to two significant figures so the readout feels deliberate
    const p = Math.pow(10, Math.floor(Math.log10(v)) - 1);
    return Math.round(v / p) * p;
  };
  function updateCalc() {
    const t = range.value / range.max;
    const amount = niceAmount(MIN * Math.pow(MAX / MIN, t));
    const band = BANDS.findIndex(([limit]) => amount <= limit);
    const rate = BANDS[band][1];
    outAmount.textContent = fmt(amount);
    outRate.textContent = `${rate.toFixed(1)}%`;
    outFee.textContent = fmt(amount * rate / 100);
    range.style.setProperty('--p', `${t * 100}%`);
    range.setAttribute('aria-valuetext', `${fmt(amount)}, fee band ${rate}%`);
    rows.forEach((r, i) => r.classList.toggle('on', i === band));
    steps.forEach((s, i) => { s.classList.toggle('is-on', i === band); s.setAttribute('aria-pressed', i === band); });
  }
  range.addEventListener('input', updateCalc);
  // the staircase chart sets the slider to a typical amount in that band
  steps.forEach(s => s.addEventListener('click', () => {
    range.value = Math.round(Math.log(+s.dataset.amount / MIN) / Math.log(MAX / MIN) * range.max);
    updateCalc();
  }));
  updateCalc();
}

// Solutions jump bar: highlight the section in view
const jump = document.querySelector('.jump');
if (jump) {
  const jumpLinks = [...jump.querySelectorAll('a')];
  const jio = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    jumpLinks.forEach(a => a.classList.toggle('is-on', a.hash === `#${e.target.id}`));
  }), { rootMargin: '-35% 0px -60% 0px' });
  jumpLinks.forEach(a => { const t = document.querySelector(a.hash); if (t) jio.observe(t); });
}

// Documents: search and category filter
const finder = document.querySelector('[data-finder]');
if (finder) {
  const q = finder.querySelector('[data-finder-q]');
  const chips = [...finder.querySelectorAll('[data-finder-cat]')];
  const count = finder.querySelector('[data-finder-count]');
  const empty = document.querySelector('[data-finder-empty]');
  const groups = [...document.querySelectorAll('.docs__group[data-cat]')];
  let cat = 'all';
  function apply() {
    const term = q.value.trim().toLowerCase();
    let total = 0;
    groups.forEach(g => {
      const heading = g.querySelector('h3').textContent.toLowerCase();
      let shown = 0;
      g.querySelectorAll('.doc').forEach(d => {
        const ok = (cat === 'all' || g.dataset.cat === cat) &&
          (!term || d.textContent.toLowerCase().includes(term) || heading.includes(term));
        d.hidden = !ok;
        if (ok) shown++;
      });
      g.hidden = !shown;
      total += shown;
    });
    count.textContent = `${total} document${total === 1 ? '' : 's'}`;
    empty.hidden = total > 0;
  }
  q.addEventListener('input', apply);
  chips.forEach(c => c.addEventListener('click', () => {
    cat = c.dataset.finderCat;
    chips.forEach(o => o.setAttribute('aria-pressed', o === c));
    apply();
  }));
}

// Contact: office hours status in Harare time (CAT, UTC+2, no daylight saving)
const status = document.querySelector('[data-open-status]');
if (status) {
  const now = new Date();
  const hre = new Date(now.getTime() + (now.getTimezoneOffset() + 120) * 60000);
  const mins = hre.getHours() * 60 + hre.getMinutes(), day = hre.getDay();
  const open = day >= 1 && day <= 5 && mins >= 8 * 60 && mins < 17 * 60;
  status.textContent = open ? 'Open now' : 'Closed now';
  status.classList.add(open ? 'is-open' : 'is-closed');
}

// Contact: the enquiry form composes an email to the office
const form = document.querySelector('[data-enquiry]');
if (form) {
  const error = form.querySelector('[data-enquiry-error]');
  form.addEventListener('input', e => e.target.removeAttribute('aria-invalid'));
  form.addEventListener('submit', e => {
    e.preventDefault();
    const data = new FormData(form);
    const name = data.get('name').trim(), email = data.get('email').trim();
    const bad = [];
    if (!name) bad.push(form.elements.name);
    if (!/^\S+@\S+\.\S+$/.test(email)) bad.push(form.elements.email);
    bad.forEach(f => f.setAttribute('aria-invalid', 'true'));
    error.hidden = !bad.length;
    if (bad.length) { bad[0].focus(); return; }
    const interests = data.getAll('interest');
    const phone = data.get('phone').trim(), message = data.get('message').trim();
    const lines = [`Name: ${name}`, `Email: ${email}`];
    if (phone) lines.push(`Phone: ${phone}`);
    if (interests.length) lines.push(`Interested in: ${interests.join(', ')}`);
    if (message) lines.push('', message);
    const body = lines.join('\n');
    location.href = `mailto:pam@purpose.co.zw?subject=${encodeURIComponent(`Investment enquiry from ${name}`)}&body=${encodeURIComponent(body)}`;
  });
}

const yr = document.getElementById('yr');
if (yr) yr.textContent = new Date().getFullYear();
