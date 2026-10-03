/**
 * AniList 粒子背景 & 动漫剪影
 * 从 app.js 提取的共享模块，供 gate.html 和 app.html 共用
 */

// ============================================================
// 粒子背景动画（增强版）
// ============================================================

class ParticleBackground {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.stars = [];
    this.meteors = [];
    this.trail = [];      // 光标拖尾星尘
    this.rings = [];      // 粒子脉冲环
    this.shower = null;   // 流星雨状态
    this.pmX = -999;
    this.pmY = -999;
    this.aura = { x: -999, y: -999 };
    this.mouse = { x: -999, y: -999 };
    this.time = 0;
    this.isScrolling = false;
    this.scrollIdleTimer = null;
    // 移动端/触屏设备使用低配模式：更少的粒子、无光晕渐变、无两两连线，
    // 避免每帧大量 createRadialGradient/stroke 占用主线程导致滑动卡顿。
    this.lowPower = ParticleBackground.isLowPowerDevice();
    this.resize();
    this.initParticles();
    this.initStars();
    this.initNebula();
    this.bindEvents();
    this.animate();
  }

  static isLowPowerDevice() {
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return coarse || window.innerWidth < 768;
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  initParticles() {
    const maxCount = this.lowPower ? 36 : 120;
    const divisor = this.lowPower ? 24000 : 12000;
    const count = Math.min(maxCount, Math.floor((this.canvas.width * this.canvas.height) / divisor));
    this.particles = Array.from({ length: count }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 0.35 + 0.12;
      return {
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        hx: Math.cos(angle) * speed,
        hy: Math.sin(angle) * speed,
        size: Math.random() * 2.5 + 0.5,
        depth: 0.35 + Math.random() * 0.65,   // 深度：影响大小/亮度/视差
        alpha: Math.random() * 0.5 + 0.1,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: Math.random() * 0.02 + 0.005,
        hue: Math.random() < 0.7 ? 270 + Math.random() * 30 : (Math.random() < 0.5 ? 330 : 220),
      };
    });
  }

  initStars() {
    this.stars = Array.from({ length: this.lowPower ? 12 : 30 }, () => ({
      x: Math.random() * this.canvas.width,
      y: Math.random() * this.canvas.height,
      size: Math.random() * 1.2 + 0.3,
      alpha: Math.random() * 0.5 + 0.1,
      speed: 0.02 + Math.random() * 0.005,
      depth: 0.15 + Math.random() * 0.4,   // 星星更远，视差更弱
      phase: Math.random() * Math.PI * 2,
      driftX: (Math.random() - 0.5) * 0.06,
      driftY: (Math.random() - 0.5) * 0.06,
    }));
  }

  bindEvents() {
    const resizeFn = () => {
      this.resize();
      this.initParticles();
      this.initStars();
    };
    window.addEventListener('resize', resizeFn);

    // 触屏设备没有鼠标跟随，不必监听，减少触摸滑动时的事件开销
    if (!this.lowPower) {
      document.addEventListener('mousemove', (e) => {
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
        // 光晕首次出现时直接吸附到光标，避免从屏幕边缘飘过来
        if (this.aura.x < -900) { this.aura.x = e.clientX; this.aura.y = e.clientY; }
      });
      document.addEventListener('mouseleave', () => {
        this.mouse.x = -999;
        this.mouse.y = -999;
      });
    }

    // Keep decorative canvas work out of the touch-scroll critical path.
    window.addEventListener('scroll', () => {
      this.isScrolling = true;
      clearTimeout(this.scrollIdleTimer);
      this.scrollIdleTimer = setTimeout(() => {
        this.isScrolling = false;
      }, 120);
    }, { passive: true });
  }

  initNebula() {
    // 预渲染的星云光斑精灵：每帧只需 3 次 drawImage，开销极低，
    // 却能给深色背景加一层缓慢漂移的色彩纵深
    this.nebula = [];
    const hues = [268, 285, 320];
    for (let i = 0; i < 3; i++) {
      const size = 512;
      const sprite = document.createElement('canvas');
      sprite.width = sprite.height = size;
      const sctx = sprite.getContext('2d');
      const g = sctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, `hsla(${hues[i]}, 75%, 62%, 0.5)`);
      g.addColorStop(0.4, `hsla(${hues[i]}, 75%, 58%, 0.2)`);
      g.addColorStop(1, `hsla(${hues[i]}, 75%, 55%, 0)`);
      sctx.fillStyle = g;
      sctx.fillRect(0, 0, size, size);
      this.nebula.push({
        sprite: sprite,
        x: Math.random(), y: Math.random(),   // 比例坐标
        r: 260 + Math.random() * 200,
        alpha: 0.05 + Math.random() * 0.04,
        speed: 0.08 + Math.random() * 0.1,
        phase: Math.random() * Math.PI * 2,
        range: 40 + Math.random() * 60
      });
    }
  }

  drawMeteors(ctx) {
    // 流星雨：每隔一段时间，同一方向落下一簇流星
    if (!this.shower && Math.random() < 0.0012) {
      this.shower = {
        dir: Math.random() < 0.5 ? 1 : -1,
        count: 5 + (Math.random() * 3 | 0),
        gap: 0,
        base: 4 + Math.random() * 3
      };
    }
    if (this.shower) {
      this.shower.gap--;
      if (this.shower.gap <= 0 && this.shower.count > 0) {
        this.shower.count--;
        this.shower.gap = 8 + Math.random() * 14;
        const speed = this.shower.base + Math.random() * 2.5;
        this.meteors.push({
          x: this.canvas.width * (0.15 + Math.random() * 0.7),
          y: -20 - Math.random() * 60,
          vx: this.shower.dir * speed * (0.8 + Math.random() * 0.4),
          vy: speed * (0.5 + Math.random() * 0.3),
          life: 0,
          maxLife: 70 + Math.random() * 40
        });
      }
      if (this.shower.count <= 0) this.shower = null;
    }

    // 随机零散流星（同时最多 2 颗，流星雨期间不额外生成）
    if (Math.random() < 0.004 && this.meteors.length < 2) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const speed = 5 + Math.random() * 4;
      this.meteors.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height * 0.35,
        vx: dir * speed * (0.8 + Math.random() * 0.4),
        vy: speed * (0.45 + Math.random() * 0.3),
        life: 0,
        maxLife: 55 + Math.random() * 40
      });
    }
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.x += m.vx;
      m.y += m.vy;
      m.life++;
      const fade = Math.sin(Math.PI * m.life / m.maxLife);
      if (m.life >= m.maxLife || m.x < -80 || m.x > this.canvas.width + 80 || m.y > this.canvas.height + 40) {
        this.meteors.splice(i, 1);
        continue;
      }
      const tailX = m.x - m.vx * 8;
      const tailY = m.y - m.vy * 8;
      const g = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
      g.addColorStop(0, `rgba(225, 210, 255, ${(0.85 * fade).toFixed(3)})`);
      g.addColorStop(1, 'rgba(225, 210, 255, 0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
      ctx.fillStyle = `rgba(255, 255, 255, ${(0.9 * fade).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  animate() {
    if (this.isScrolling) {
      requestAnimationFrame(() => this.animate());
      return;
    }

    const { ctx, canvas, particles, stars, mouse } = this;
    this.time += 0.005;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // 加色混合：深色背景上让光晕/星光呈现真实的发光质感
    ctx.globalCompositeOperation = 'lighter';

    // 星云光斑：缓慢漂移 + 呼吸 + 色相微漂移，给画面加色彩纵深
    const hueShift = Math.sin(this.time * 0.05) * 14;
    for (const n of this.nebula) {
      const nx = n.x * canvas.width + Math.cos(this.time * n.speed + n.phase) * n.range;
      const ny = n.y * canvas.height + Math.sin(this.time * n.speed * 0.8 + n.phase * 1.3) * n.range * 0.6;
      ctx.filter = `hue-rotate(${hueShift.toFixed(1)}deg)`;
      ctx.globalAlpha = n.alpha * (0.75 + 0.25 * Math.sin(this.time * 0.4 + n.phase * 2));
      ctx.drawImage(n.sprite, nx - n.r, ny - n.r, n.r * 2, n.r * 2);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
    }

    for (const s of stars) {
      // 轻微漂移 + 多层闪烁，让星光更接近真实
      s.x += s.driftX;
      s.y += s.driftY;
      if (s.x < 0) s.x = canvas.width;
      if (s.x > canvas.width) s.x = 0;
      if (s.y < 0) s.y = canvas.height;
      if (s.y > canvas.height) s.y = 0;

      // 星星深度视差（幅度比粒子小，因为更远）
      const sdx = mouse.x > -900 ? (mouse.x - canvas.width / 2) * s.depth * 0.02 : 0;
      const sdy = mouse.y > -900 ? (mouse.y - canvas.height / 2) * s.depth * 0.02 : 0;
      const sx = s.x - sdx;
      const sy = s.y - sdy;

      const twinkle = Math.sin(this.time * 3 + s.phase);
      const flicker = twinkle * twinkle * 0.4 + 0.6;
      const a = s.alpha * flicker;
      ctx.beginPath();
      ctx.arc(sx, sy, s.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 180, 255, ${a})`;
      ctx.fill();

      // 亮星在闪烁峰值时带十字星芒
      if (s.size > 0.75 && flicker > 0.85) {
        const flare = ((flicker - 0.85) / 0.15) * s.alpha * 0.6;
        const fl = s.size * 6;
        ctx.strokeStyle = `rgba(220, 205, 255, ${flare.toFixed(3)})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(sx - fl, sy);
        ctx.lineTo(sx + fl, sy);
        ctx.moveTo(sx, sy - fl);
        ctx.lineTo(sx, sy + fl);
        ctx.stroke();
      }
    }

    this.drawMeteors(ctx);

    // 鼠标跟随光晕：带惯性滞后，柔光缀在光标后方（低配/触屏无鼠标不绘制）
    if (!this.lowPower && this.mouse.x > -900) {
      this.aura.x += (this.mouse.x - this.aura.x) * 0.08;
      this.aura.y += (this.mouse.y - this.aura.y) * 0.08;
      const ag = ctx.createRadialGradient(this.aura.x, this.aura.y, 0, this.aura.x, this.aura.y, 110);
      ag.addColorStop(0, 'rgba(168, 85, 247, 0.10)');
      ag.addColorStop(0.5, 'rgba(168, 85, 247, 0.04)');
      ag.addColorStop(1, 'rgba(168, 85, 247, 0)');
      ctx.fillStyle = ag;
      ctx.fillRect(this.aura.x - 110, this.aura.y - 110, 220, 220);
    }

    // 全局风场 + 轻微浮力，模拟空气流动
    const windX = Math.sin(this.time * 0.4) * 0.02 + Math.cos(this.time * 0.23) * 0.015;
    const windY = Math.cos(this.time * 0.31) * 0.012 - 0.004;

    for (const p of particles) {
      p.pulse += p.pulseSpeed;
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < -10) p.x = canvas.width + 10;
      if (p.x > canvas.width + 10) p.x = -10;
      if (p.y < -10) p.y = canvas.height + 10;
      if (p.y > canvas.height + 10) p.y = -10;

      let fx = windX;
      let fy = windY;

      // 鼠标排斥：靠近时平滑推开，带惯性
      const dx = mouse.x - p.x;
      const dy = mouse.y - p.y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 < 180 * 180 && dist2 > 0.0001) {
        const dist = Math.sqrt(dist2);
        const force = (1 - dist / 180);
        fx -= (dx / dist) * force * 0.09;
        fy -= (dy / dist) * force * 0.09;
      }

      // 弹簧回弹：速度慢慢回到自然漂移速度（惯性 + 阻尼）
      fx += (p.hx - p.vx) * 0.02;
      fy += (p.hy - p.vy) * 0.02;

      p.vx += fx;
      p.vy += fy;

      // 空气阻尼，让运动更柔和、不突兀
      p.vx *= 0.98;
      p.vy *= 0.98;

      const breathe = Math.sin(p.pulse) * 0.3 + 0.7;
      const currentSize = p.size * breathe;

      // 深度视差：远近不同的粒子随光标轻微偏移，制造空间层次
      const pdx = mouse.x > -900 ? (mouse.x - canvas.width / 2) * (p.depth - 0.5) * 0.045 : 0;
      const pdy = mouse.y > -900 ? (mouse.y - canvas.height / 2) * (p.depth - 0.5) * 0.045 : 0;
      const px = p.x + pdx;
      const py = p.y + pdy;
      const glowR = currentSize * 4 * (0.55 + p.depth * 0.45);

      // 光晕径向渐变是每帧最贵的操作，低配模式下跳过
      if (!this.lowPower) {
        const gradient = ctx.createRadialGradient(px, py, 0, px, py, glowR);
        gradient.addColorStop(0, `hsla(${p.hue}, 80%, 70%, ${p.alpha * 0.4})`);
        gradient.addColorStop(1, `hsla(${p.hue}, 80%, 70%, 0)`);
        ctx.beginPath();
        ctx.arc(px, py, glowR, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      const coreAlpha = Math.sin(p.pulse) * 0.1 + 0.3;
      ctx.beginPath();
      ctx.arc(px, py, currentSize, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 80%, 75%, ${p.alpha + coreAlpha})`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(px - currentSize * 0.2, py - currentSize * 0.2, currentSize * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha * 0.3})`;
      ctx.fill();
    }

    // 粒子两两连线是 O(n²) 且每条都要 stroke，低配模式下跳过
    if (!this.lowPower) {
      const lineGlow = Math.sin(this.time * 2) * 0.02 + 0.06;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = dx * dx + dy * dy;
          if (dist < 20000) {
            const alpha = lineGlow * (1 - dist / 20000);
            const hue = (particles[i].hue + particles[j].hue) / 2;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `hsla(${hue}, 70%, 65%, ${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }
    }

    // 光标拖尾星尘：光标快速划过时撒出渐隐光点
    if (!this.lowPower && mouse.x > -900) {
      const mvx = mouse.x - (this.pmX < -900 ? mouse.x : this.pmX);
      const mvy = mouse.y - (this.pmY < -900 ? mouse.y : this.pmY);
      if (Math.abs(mvx) + Math.abs(mvy) > 7 && this.trail.length < 46) {
        this.trail.push({
          x: mouse.x + (Math.random() - 0.5) * 18,
          y: mouse.y + (Math.random() - 0.5) * 18,
          vx: (Math.random() - 0.5) * 0.7 - mvx * 0.04,
          vy: (Math.random() - 0.5) * 0.7 - mvy * 0.04 - 0.25,
          life: 0,
          maxLife: 35 + Math.random() * 30,
          hue: 265 + Math.random() * 70,
          size: 0.8 + Math.random() * 1.4
        });
      }
      this.pmX = mouse.x;
      this.pmY = mouse.y;
    }
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const t = this.trail[i];
      t.x += t.vx;
      t.y += t.vy;
      t.life++;
      if (t.life >= t.maxLife) {
        this.trail.splice(i, 1);
        continue;
      }
      const ta = (1 - t.life / t.maxLife) * 0.5;
      const tg = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.size * 4);
      tg.addColorStop(0, `hsla(${t.hue}, 85%, 75%, ${ta.toFixed(3)})`);
      tg.addColorStop(1, `hsla(${t.hue}, 85%, 70%, 0)`);
      ctx.fillStyle = tg;
      ctx.fillRect(t.x - t.size * 4, t.y - t.size * 4, t.size * 8, t.size * 8);
    }

    // 粒子脉冲环：随机能量涟漪
    if (this.rings.length < 3 && Math.random() < 0.006 && particles.length) {
      const rp = particles[(Math.random() * particles.length) | 0];
      this.rings.push({
        x: rp.x, y: rp.y,
        r: rp.size + 2,
        life: 0,
        maxLife: 50 + Math.random() * 20,
        hue: rp.hue
      });
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.life++;
      ring.r += 0.7;
      if (ring.life >= ring.maxLife) {
        this.rings.splice(i, 1);
        continue;
      }
      const ra = ((1 - ring.life / ring.maxLife) * 0.32).toFixed(3);
      ctx.strokeStyle = `hsla(${ring.hue}, 80%, 72%, ${ra})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(() => this.animate());
  }
}

// ============================================================
// 背景动漫剪影
// ============================================================

const ANIME_SILHOUETTES = [
  `<svg viewBox="0 0 120 100" fill="currentColor">
    <ellipse cx="60" cy="82" rx="56" ry="12"/>
    <path d="M22,76 Q22,35 60,25 Q98,35 98,76"/>
  </svg>`,
  `<svg viewBox="0 0 100 120" fill="currentColor">
    <circle cx="50" cy="60" r="26"/>
    <polygon points="50,0 52,22 72,10 60,28 88,22 66,38 92,42 68,52 90,65 68,62 64,80 56,68 44,80 36,62 22,65 42,52 28,42 52,38 40,28 22,22 48,28 40,10 52,22"/>
    <circle cx="50" cy="12" r="18" fill="none" stroke="currentColor" stroke-width="4" opacity="0.5"/>
  </svg>`,
  `<svg viewBox="0 0 100 100" fill="currentColor">
    <ellipse cx="50" cy="60" rx="32" ry="28"/>
    <polygon points="20,36 5,2 32,28"/>
    <polygon points="80,36 95,2 68,28"/>
    <polygon points="20,28 12,10 28,24"/>
    <polygon points="80,28 88,10 72,24"/>
  </svg>`,
  `<svg viewBox="0 0 100 110" fill="currentColor">
    <ellipse cx="50" cy="55" rx="24" ry="30"/>
    <circle cx="20" cy="32" r="16"/>
    <circle cx="80" cy="32" r="16"/>
    <path d="M58,8 A35,35 0 1,0 58,78 A28,35 0 1,1 58,8" opacity="0.4"/>
  </svg>`,
  `<svg viewBox="0 0 100 100" fill="currentColor">
    <polygon points="50,2 54,46 98,50 54,54 50,98 46,54 2,50 46,46"/>
    <circle cx="50" cy="50" r="8" fill="var(--bg-primary)"/>
  </svg>`,
  `<svg viewBox="0 0 100 100" fill="currentColor">
    <ellipse cx="50" cy="60" rx="34" ry="30"/>
    <polygon points="20,40 28,8 42,36"/>
    <polygon points="80,40 72,8 58,36"/>
    <ellipse cx="50" cy="68" rx="10" ry="6"/>
  </svg>`,
  `<svg viewBox="0 0 100 80" fill="currentColor">
    <path d="M50,40 Q20,10 10,30 Q5,50 50,40"/>
    <path d="M50,40 Q80,10 90,30 Q95,50 50,40"/>
    <ellipse cx="50" cy="40" rx="6" ry="8"/>
    <path d="M48,48 L42,72 M52,48 L58,72" stroke="currentColor" stroke-width="3" fill="none"/>
  </svg>`,
  `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2.5">
    <circle cx="50" cy="50" r="44"/>
    <circle cx="50" cy="50" r="8" fill="currentColor"/>
    <circle cx="50" cy="50" r="4" fill="var(--bg-primary)"/>
    <circle cx="26" cy="30" r="5" fill="currentColor"/>
    <circle cx="74" cy="30" r="5" fill="currentColor"/>
    <circle cx="26" cy="70" r="5" fill="currentColor"/>
    <circle cx="74" cy="70" r="5" fill="currentColor"/>
  </svg>`,
];

const ANIME_FLOAT_ANIMS = ['silhouetteFloat', 'silhouetteFloat2', 'silhouetteFloat3'];
const ANIME_COLORS = ['#a855f7', '#ec4899', '#c084fc', '#f59e0b', '#60a5fa', '#f472b6'];

function createAnimeSilhouettes() {
  if (document.querySelector('.anime-bg-container')) return;

  const container = document.createElement('div');
  container.className = 'anime-bg-container';

  // 移动端减少剪影数量并关闭模糊滤镜，避免持续动画拖累滑动帧率
  const lowPower = ParticleBackground.isLowPowerDevice();
  const count = lowPower ? 4 : 10;
  const w = window.innerWidth;
  const h = window.innerHeight;

  for (let i = 0; i < count; i++) {
    const idx = i % ANIME_SILHOUETTES.length;
    const size = 80 + Math.random() * 180;
    const x = Math.random() * (w + 200) - 100;
    const y = Math.random() * (h + 200) - 100;
    const dur = 20 + Math.random() * 25;
    const delay = Math.random() * 15;
    const anim = ANIME_FLOAT_ANIMS[i % ANIME_FLOAT_ANIMS.length];
    const color = ANIME_COLORS[i % ANIME_COLORS.length];
    const opacity = 0.03 + Math.random() * 0.05;

    const el = document.createElement('div');
    el.className = 'anime-bg-silhouette';
    el.innerHTML = ANIME_SILHOUETTES[idx];
    el.style.cssText = `
      left: ${x}px; top: ${y}px;
      width: ${size}px; height: ${size}px;
      color: ${color};
      opacity: ${opacity};
      animation: ${anim} ${dur}s ease-in-out ${delay}s infinite;
      ${lowPower ? '' : `filter: blur(${0.5 + Math.random() * 1.5}px);`}
    `;
    container.appendChild(el);
  }

  document.body.appendChild(container);
}
