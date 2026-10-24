// CrazyBattle — живой фон (неон-тема).
// 1) курсорный свет: CSS-переменные --mx / --my на <html> (работает всегда, кроме reduced-motion);
// 2) канвас под интерфейсом: частицы-«нейросеть», импульсы бегут по связям, падающие звёзды.
// При prefers-reduced-motion канвас не запускается, остаётся статичный CSS-фон.
(function () {
  const root = document.documentElement;
  const reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // ---------- курсорный свет ----------
  if (!reduced) {
    let raf = 0, sx = 0, sy = 0;
    window.addEventListener("mousemove", (e) => {
      sx = e.clientX; sy = e.clientY;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          root.style.setProperty("--mx", sx + "px");
          root.style.setProperty("--my", sy + "px");
        });
      }
    });
  }

  const canvas = document.getElementById("fx-bg");
  if (!canvas || !canvas.getContext || reduced) return;

  const ctx = canvas.getContext("2d");
  const COLORS = ["255,46,154", "31,227,255", "155,92,255"];
  let W = 0, H = 0;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  let pts = [], edges = [], pulses = [], stars = [];
  let nextStar = 1500;
  const mouse = { x: -9999, y: -9999 };

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const n = Math.round(Math.min(110, Math.max(36, (W * H) / 20000)));
    pts = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.7 + 0.6,
      c: COLORS[(Math.random() * COLORS.length) | 0],
      p: Math.random() * Math.PI * 2,
    }));
    pulses = [];
  }

  function spawnStar() {
    const fromTop = Math.random() < 0.7;
    const x = fromTop ? Math.random() * W : -40;
    const y = fromTop ? -40 : Math.random() * H * 0.5;
    const dir = Math.random() < 0.5 ? 1 : -1;
    stars.push({
      x, y,
      vx: dir * (7 + Math.random() * 5),
      vy: 3 + Math.random() * 3,
      c: COLORS[(Math.random() * COLORS.length) | 0],
      life: 1,
    });
  }

  function frame(t) {
    ctx.clearRect(0, 0, W, H);

    // движение точек + уход от курсора
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy; p.p += 0.012;
      const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy;
      if (d2 < 16000) { p.x += dx * 0.014; p.y += dy * 0.014; }
      if (p.x < -20) p.x = W + 20; if (p.x > W + 20) p.x = -20;
      if (p.y < -20) p.y = H + 20; if (p.y > H + 20) p.y = -20;
    }

    // связи между близкими точками (запоминаем, по ним бегут импульсы)
    const LINK = 140;
    edges.length = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      for (let j = i + 1; j < pts.length; j++) {
        const b = pts[j];
        const dx = a.x - b.x, dy = a.y - b.y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < LINK) {
          const k = 1 - d / LINK;
          edges.push([a, b, k]);
          ctx.strokeStyle = `rgba(${a.c},${k * 0.26})`;
          ctx.lineWidth = 0.7;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }

    // импульсы: яркие точки бегут по связям
    if (edges.length && pulses.length < 16 && Math.random() < 0.09) {
      pulses.push({ e: edges[(Math.random() * edges.length) | 0], t: 0, s: 0.012 + Math.random() * 0.018, c: COLORS[(Math.random() * COLORS.length) | 0] });
    }
    pulses = pulses.filter((p) => {
      p.t += p.s;
      if (p.t >= 1) return false;
      const [a, b] = p.e;
      const x = a.x + (b.x - a.x) * p.t, y = a.y + (b.y - a.y) * p.t;
      const tail = Math.min(1, p.t + 0.12), tx = a.x + (b.x - a.x) * tail, ty = a.y + (b.y - a.y) * tail;
      ctx.strokeStyle = `rgba(${p.c},0.7)`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.fillStyle = `rgba(${p.c},0.25)`; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,0.9)`; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill();
      return true;
    });

    // точки с мерцанием
    for (const p of pts) {
      const g = 0.55 + 0.45 * Math.sin(p.p);
      ctx.fillStyle = `rgba(${p.c},${0.35 + 0.45 * g})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }

    // падающие звёзды
    if (t > nextStar) { spawnStar(); nextStar = t + 3500 + Math.random() * 4500; }
    stars = stars.filter((s) => {
      s.x += s.vx; s.y += s.vy; s.life -= 0.012;
      if (s.life <= 0 || s.x > W + 120 || s.y > H + 120 || s.x < -120) return false;
      const L = 90;
      const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * L / 8, s.y - s.vy * L / 8);
      g.addColorStop(0, `rgba(255,255,255,${0.9 * s.life})`);
      g.addColorStop(0.15, `rgba(${s.c},${0.7 * s.life})`);
      g.addColorStop(1, `rgba(${s.c},0)`);
      ctx.strokeStyle = g; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * L / 8, s.y - s.vy * L / 8); ctx.stroke();
      return true;
    });

    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize);
  window.addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
  window.addEventListener("mouseleave", () => { mouse.x = mouse.y = -9999; });
  resize();
  requestAnimationFrame(frame);
})();
