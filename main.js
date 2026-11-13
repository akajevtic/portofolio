(() => {
  'use strict';

  const root = document.documentElement;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = t => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animated = !reduce && !!(window.gsap && window.ScrollTrigger);
  // Without the animation libraries (or with reduced motion) the page stays fully visible and static.
  if (!animated) root.classList.remove('js');

  /* ---------- fit display type to container width ---------- */
  function fit() {
    $$('[data-fit]').forEach(el => {
      el.style.fontSize = '100px';
      const w = el.firstElementChild.getBoundingClientRect().width;
      if (w) el.style.fontSize = 100 * el.clientWidth / w + 'px';
    });
  }

  /* ---------- project figures ---------- */
  const keys = $('[data-keys]');
  if (keys) {
    ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].forEach((row, r) => [...row].forEach((ch, c) => {
      const x = 37 + [0, 16, 48][r] + c * 33, y = 98 + r * 36;
      const weak = 'BRWON'.includes(ch) ? ' weak' : '';
      keys.insertAdjacentHTML('beforeend',
        `<rect class="key${weak}" x="${x}" y="${y}" width="28" height="30" rx="5"/>` +
        `<text x="${x + 14}" y="${y + 19}" text-anchor="middle">${ch}</text>`);
    }));
  }
  $$('.art svg').forEach(svg => {
    let i = 0;
    $$('*', svg).forEach(n => {
      if (n.tagName === 'g' || n.tagName === 'tspan') return;
      const fade = n.matches('text, .fa, .weak, .nd, .dots circle');
      if (!fade && n.getTotalLength) n.setAttribute('pathLength', 1);
      n.classList.add(fade ? 'fd' : 'd');
      n.style.setProperty('--i', i++);
    });
  });

  /* ---------- Belgrade clock ---------- */
  const clock = $('[data-clock]');
  if (clock) {
    const fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Belgrade', timeZoneName: 'short' });
    const tick = () => {
      const p = fmt.formatToParts(new Date());
      const get = t => (p.find(x => x.type === t) || {}).value;
      clock.textContent = get('hour') + ':' + get('minute');
      if (get('timeZoneName')) clock.nextElementSibling.textContent = get('timeZoneName');
    };
    tick();
    setInterval(tick, 15000);
  }

  /* ---------- network canvas: sphere (hero) -> scatter -> ring (contact) ---------- */
  const net = (canvas => {
    const ctx = canvas.getContext('2d');
    let small = innerWidth < 700;
    const N = small ? 120 : 220;
    const s = { intro: animated ? 0 : 1, hero: 0, contact: 0, scroll: 0, mx: 0, my: 0, px: -9999, py: -9999 };
    const sph = [], far = [], tor = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - 2 * (i + .5) / N, r = Math.sqrt(1 - y * y), a = i * 2.399963;
      const p = [Math.cos(a) * r, y, Math.sin(a) * r];
      sph.push(p);
      const k = 2.4 + Math.random() * 2.6;
      far.push([p[0] * k + Math.random() - .5, p[1] * k + Math.random() - .5, p[2] * k]);
      // three orbit rings, each tilted 60 degrees from the last
      const v = (i / 3 | 0) / Math.ceil(N / 3) * Math.PI * 2, tilt = (i % 3) * Math.PI / 3;
      tor.push([1.3 * Math.cos(v), 1.3 * Math.sin(v) * Math.sin(tilt), 1.3 * Math.sin(v) * Math.cos(tilt)]);
    }
    const knn = (pts, k) => {
      const edges = [], adj = pts.map(() => []), seen = new Set();
      pts.forEach((p, i) => {
        pts.map((q, j) => [(p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2, j])
          .sort((a, b) => a[0] - b[0]).slice(1, k + 1).forEach(([, j]) => {
            const key = i < j ? i * N + j : j * N + i;
            if (seen.has(key)) return;
            seen.add(key); edges.push([i, j]); adj[i].push(j); adj[j].push(i);
          });
      });
      return { edges, adj };
    };
    const gA = knn(sph, 3), gC = knn(tor, 2);
    const PX = new Float32Array(N), PY = new Float32Array(N), PD = new Float32Array(N);
    const pulses = Array.from({ length: small ? 4 : 7 }, () => ({ a: Math.random() * N | 0, b: -1, t: 1, v: .0009 + Math.random() * .0009 }));
    const rot = { x: 0, y: 0 };
    let W = 0, H = 0, last = 0, heroH = 1, contactTop = 1e9, wasContact = false;

    function measure() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      W = innerWidth; H = innerHeight; small = W < 700;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      heroH = $('.hero').offsetHeight;
      contactTop = $('#contact').getBoundingClientRect().top + scrollY;
    }

    function frame(t) {
      const dt = Math.min(50, t - last); last = t;
      s.scroll = scrollY;
      s.hero = clamp(scrollY / (heroH * .85));
      s.contact = clamp((scrollY + H * .55 - contactTop) / (H * .5));
      const inContact = s.contact > 0;
      const b = ease(s.contact), m = inContact ? b : ease(s.hero);
      const alpha = inContact ? b : s.intro * (1 - m);
      ctx.clearRect(0, 0, W, H);
      if (alpha < .01) return;

      const from = inContact ? far : sph, to = inContact ? tor : far;
      const g = inContact ? gC : gA, gw = inContact ? m : 1 - m;
      const col = inContact ? '236,232,225' : '17,17,15';
      const acc = inContact ? '125,143,255' : '37,64,255'; // matches --accent in each mode
      const cx = inContact ? W * .5 : W * (small ? .5 : .7);
      const cy = inContact ? H * .5 : H * (small ? .33 : .42) - s.scroll * .35;
      const R = Math.min(W, H) * (inContact ? (small ? .3 : .36) : (small ? .36 : .37));
      rot.y += (s.mx * .5 - rot.y) * .04;
      rot.x += (s.my * .3 - rot.x) * .04;
      const ay = t * .00013 + rot.y, ax = (inContact ? .45 : .28) + rot.x;
      const cY = Math.cos(ay), sY = Math.sin(ay), cX = Math.cos(ax), sX = Math.sin(ax);

      for (let i = 0; i < N; i++) {
        const x = lerp(from[i][0], to[i][0], m), y = lerp(from[i][1], to[i][1], m), z = lerp(from[i][2], to[i][2], m);
        const x1 = x * cY + z * sY, z1 = z * cY - x * sY;
        const y1 = y * cX - z1 * sX, z2 = y * sX + z1 * cX;
        const k = 7 / Math.max(1.2, 7 - z2);
        let X = cx + x1 * R * k, Y = cy - y1 * R * k;
        const dx = X - s.px, dy = Y - s.py, d = Math.hypot(dx, dy);
        if (d < 150 && d > .01) { const f = (1 - d / 150) * 28; X += dx / d * f; Y += dy / d * f; }
        PX[i] = X; PY[i] = Y; PD[i] = clamp((z2 + 1.3) / 2.6);
      }

      ctx.lineWidth = 1;
      for (const [i, j] of g.edges) {
        const len = Math.hypot(PX[i] - PX[j], PY[i] - PY[j]);
        const la = gw * alpha * clamp(1 - len / (R * .8)) * (.1 + .34 * (PD[i] + PD[j]) / 2);
        if (la < .012) continue;
        ctx.strokeStyle = `rgba(${col},${la.toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(PX[i], PY[i]); ctx.lineTo(PX[j], PY[j]); ctx.stroke();
      }
      for (let i = 0; i < N; i++) {
        ctx.fillStyle = `rgba(${col},${(alpha * (.22 + .78 * PD[i])).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(PX[i], PY[i], .7 + 1.7 * PD[i], 0, 6.2832); ctx.fill();
      }

      // signals hopping node to node
      const pw = alpha * clamp(gw * 3 - 2);
      if (inContact !== wasContact) { wasContact = inContact; pulses.forEach(p => { p.t = 1; }); }
      if (pw > .02 && !reduce) {
        ctx.lineWidth = 1.6;
        for (const p of pulses) {
          p.t += p.v * dt;
          if (p.t >= 1 || p.b < 0) {
            if (p.b >= 0) p.a = p.b;
            const nb = g.adj[p.a];
            p.b = nb.length ? nb[Math.random() * nb.length | 0] : p.a;
            p.t = 0;
          }
          const t0 = Math.max(0, p.t - .35);
          const x = lerp(PX[p.a], PX[p.b], p.t), y = lerp(PY[p.a], PY[p.b], p.t);
          ctx.strokeStyle = `rgba(${acc},${(pw * .8).toFixed(3)})`;
          ctx.beginPath(); ctx.moveTo(lerp(PX[p.a], PX[p.b], t0), lerp(PY[p.a], PY[p.b], t0)); ctx.lineTo(x, y); ctx.stroke();
          ctx.fillStyle = `rgba(${acc},${pw.toFixed(3)})`;
          ctx.beginPath(); ctx.arc(x, y, 2.8, 0, 6.2832); ctx.fill();
        }
      }
    }

    addEventListener('pointermove', e => {
      s.mx = e.clientX / innerWidth * 2 - 1; s.my = e.clientY / innerHeight * 2 - 1;
      s.px = e.clientX; s.py = e.clientY;
    }, { passive: true });
    addEventListener('resize', measure);
    measure();

    if (reduce) {
      const still = () => frame(0);
      addEventListener('scroll', still, { passive: true });
      addEventListener('resize', still);
      still();
    } else {
      const loop = t => { if (!document.hidden) frame(t); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
    return { s, measure };
  })($('.net'));

  if (!animated) {
    fit();
    document.fonts.ready.then(() => { fit(); net.measure(); });
    addEventListener('resize', fit);
    return;
  }

  /* =====================  animated experience  ===================== */
  gsap.registerPlugin(ScrollTrigger);
  history.scrollRestoration = 'manual';
  scrollTo(0, 0);

  const lenis = window.Lenis ? new Lenis() : null;
  if (lenis) {
    lenis.on('scroll', ScrollTrigger.update);
    const top = $('.top');
    lenis.on('scroll', e => top.classList.toggle('is-away', e.direction > 0 && e.scroll > 200));
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
  }
  const goTo = target => lenis ? lenis.scrollTo(target, { duration: 1.5 }) : target.scrollIntoView({ behavior: 'smooth' });
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    const target = a && $(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    goTo(target);
  });

  /* ---------- text splitting ---------- */
  const wrap = (el, parts, sep) => {
    el.textContent = '';
    return parts.map(part => {
      const m = document.createElement('span'), i = document.createElement('span');
      m.className = 'wm'; i.className = 'wi'; i.textContent = part;
      m.append(i); el.append(m, sep);
      return i;
    });
  };
  const chars = sel => $$(sel).flatMap(w => wrap(w, [...w.textContent], ''));
  const heroChars = chars('.hero__name .w');
  const talkChars = chars('.contact__big .w');
  gsap.set([heroChars, talkChars], { yPercent: 115 });

  $$('[data-words]').forEach(el => {
    const words = wrap(el, el.textContent.trim().split(/\s+/), ' ');
    gsap.set(words, { yPercent: 115 });
    ScrollTrigger.create({
      trigger: el, start: 'top 90%', once: true,
      onEnter: () => gsap.to(words, { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: .09 })
    });
  });

  $$('[data-scrub]').forEach(el => {
    const words = wrap(el, el.textContent.trim().split(/\s+/), ' ');
    gsap.fromTo(words, { opacity: .13 }, {
      opacity: 1, ease: 'none', stagger: .05,
      scrollTrigger: { trigger: el, start: 'top 80%', end: 'bottom 50%', scrub: true }
    });
  });

  ScrollTrigger.batch('[data-reveal]', {
    start: 'top 94%', once: true,
    onEnter: els => gsap.to(els, { opacity: 1, y: 0, duration: .9, ease: 'power3.out', stagger: .08 })
  });

  $$('.art').forEach(art => ScrollTrigger.create({
    trigger: art, start: 'top 82%', once: true, onEnter: () => art.classList.add('is-in')
  }));

  $$('[data-count]').forEach(el => {
    const o = { v: 0 }, end = +el.dataset.count;
    ScrollTrigger.create({
      trigger: el, start: 'top 92%', once: true,
      onEnter: () => gsap.to(o, { v: end, duration: 1.4, ease: 'power2.out', onUpdate() { el.textContent = String(Math.round(o.v)).padStart(2, '0'); } })
    });
  });

  ScrollTrigger.create({
    trigger: '.contact__big', start: 'top 88%', once: true,
    onEnter: () => gsap.to(talkChars, { yPercent: 0, duration: 1.2, ease: 'expo.out', stagger: .05 })
  });

  gsap.to('.hero__name', { yPercent: -14, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });

  /* ---------- section index + ink mode ---------- */
  const idx = $$('.index a');
  ['#home', '#about', '#work', '#stack', '#contact'].forEach((id, i) => ScrollTrigger.create({
    trigger: id, start: 'top 50%', end: 'bottom 50%',
    onToggle: self => { if (self.isActive) idx.forEach((a, j) => a.classList.toggle('is-on', i === j)); }
  }));
  ScrollTrigger.create({
    trigger: '#contact', start: 'top 55%',
    onEnter: () => root.classList.add('is-ink'), onLeaveBack: () => root.classList.remove('is-ink')
  });

  /* ---------- marquee: drifts on its own, speeds up with scroll ---------- */
  const rows = $$('.marq__row').map(el => { el.innerHTML += el.innerHTML; return { el, half: 1 }; });
  let drift = 0;
  gsap.ticker.add(() => {
    drift += .7 + Math.abs(lenis ? lenis.velocity : 0) * .4;
    rows.forEach((r, i) => {
      const x = (drift * (i ? .8 : 1)) % r.half;
      r.el.style.transform = `translate3d(${i % 2 ? x - r.half : -x}px,0,0)`;
    });
  });

  /* ---------- trace line: one path through every [data-la] anchor, drawn by scroll ---------- */
  const trace = $('.trace'), line = $('.trace__line'), head = $('.trace__head');
  let tLen = 0, lut = null, cur = 0;
  function buildTrace() {
    const mr = $('#main').getBoundingClientRect();
    const pts = $$('[data-la]').map(a => { const r = a.getBoundingClientRect(); return [r.left - mr.left, r.top - mr.top]; });
    trace.setAttribute('viewBox', `0 0 ${mr.width} ${mr.height}`);
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += `C${p1[0] + (p2[0] - p0[0]) / 5} ${p1[1] + (p2[1] - p0[1]) / 5} ${p2[0] - (p3[0] - p1[0]) / 5} ${p2[1] - (p3[1] - p1[1]) / 5} ${p2[0]} ${p2[1]}`;
    }
    line.setAttribute('d', d);
    tLen = line.getTotalLength();
    line.style.strokeDasharray = tLen;
    // lut[i] = lowest point the path has reached by length i/n, so scroll position maps to a length
    const n = Math.ceil(tLen / 10);
    lut = new Float32Array(n + 1);
    let max = -Infinity;
    for (let i = 0; i <= n; i++) { max = Math.max(max, line.getPointAtLength(i / n * tLen).y); lut[i] = max; }
  }
  gsap.ticker.add(() => {
    if (!tLen) return;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    // the line leads the eye at 62% of the viewport, and reaches the very bottom by the end of the page
    const lead = .62 + .38 * clamp((scrollY - (maxScroll - innerHeight)) / innerHeight);
    const target = scrollY + innerHeight * lead;
    let lo = 0, hi = lut.length - 1;
    if (lut[hi] < target) lo = hi;
    else while (lo < hi) { const mid = (lo + hi) >> 1; if (lut[mid] < target) lo = mid + 1; else hi = mid; }
    cur += (lo / (lut.length - 1) * tLen - cur) * .09;
    line.style.strokeDashoffset = tLen - cur;
    const p = line.getPointAtLength(cur);
    head.setAttribute('cx', p.x); head.setAttribute('cy', p.y);
  });

  ScrollTrigger.addEventListener('refreshInit', fit);
  ScrollTrigger.addEventListener('refresh', () => {
    rows.forEach(r => { r.half = r.el.scrollWidth / 2 || 1; });
    buildTrace();
    net.measure();
  });

  /* ---------- cursor ---------- */
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const c = $('.cursor');
    const xTo = gsap.quickTo(c, 'x', { duration: .35, ease: 'power3' }), yTo = gsap.quickTo(c, 'y', { duration: .35, ease: 'power3' });
    addEventListener('pointermove', e => { root.classList.add('has-cursor'); xTo(e.clientX); yTo(e.clientY); }, { passive: true });
    document.addEventListener('pointerover', e => c.classList.toggle('is-hot', !!e.target.closest('a, button')));
  }

  /* ---------- loader + intro ---------- */
  const fontsReady = Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3500))]);
  const count = $('.loader__count'), st = { v: 0 };
  gsap.to(st, {
    v: 100, duration: 1.7, ease: 'power2.inOut',
    onUpdate() { count.textContent = String(Math.round(st.v)).padStart(3, '0'); },
    onComplete() { fontsReady.then(intro); }
  });
  function intro() {
    ScrollTrigger.refresh();
    gsap.timeline({
      onComplete() {
        if (lenis) lenis.start();
        const target = location.hash.length > 1 && $(location.hash);
        if (target) goTo(target);
      }
    })
      .to('.loader > *', { yPercent: -40, opacity: 0, duration: .5, ease: 'power2.in' })
      .to('.loader', { yPercent: -100, duration: 1, ease: 'expo.inOut' }, '-=.1')
      .set('.loader', { display: 'none' })
      .to(heroChars, { yPercent: 0, duration: 1.2, ease: 'expo.out', stagger: .045 }, '-=.55')
      .to('[data-intro]', { opacity: 1, y: 0, duration: .9, ease: 'power3.out', stagger: .08 }, '-=.9')
      .to(net.s, { intro: 1, duration: 1.6, ease: 'power2.out' }, '-=1.2');
  }
})();
