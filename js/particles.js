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
    this.mouse = { x: -999, y: -999 };
    this.time = 0;
    this.resize();
    this.initParticles();
    this.initStars();
    this.bindEvents();
    this.animate();
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  initParticles() {
    const count = Math.min(120, Math.floor((this.canvas.width * this.canvas.height) / 12000));
    this.particles = Array.from({ length: count }, () => ({
      x: Math.random() * this.canvas.width,
      y: Math.random() * this.canvas.height,
      vx: (Math.random() - 0.5) * 1.5,
      vy: (Math.random() - 0.5) * 1.5,
      size: Math.random() * 2.5 + 0.5,
      alpha: Math.random() * 0.5 + 0.1,
      pulse: Math.random() * Math.PI * 2,
      pulseSpeed: Math.random() * 0.02 + 0.005,
      hue: Math.random() < 0.7 ? 270 + Math.random() * 30 : (Math.random() < 0.5 ? 330 : 220),
    }));
  }

  initStars() {
    this.stars = Array.from({ length: 30 }, () => ({
      x: Math.random() * this.canvas.width,
      y: Math.random() * this.canvas.height,
      size: Math.random() * 1.2 + 0.3,
      alpha: Math.random() * 0.5 + 0.1,
      speed: Math.random() * 0.02 + 0.005,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  bindEvents() {
    const resizeFn = () => {
      this.resize();
      this.initParticles();
      this.initStars();
    };
    window.addEventListener('resize', resizeFn);

    document.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
    document.addEventListener('mouseleave', () => {
      this.mouse.x = -999;
      this.mouse.y = -999;
    });
  }

  animate() {
    const { ctx, canvas, particles, stars, mouse } = this;
    this.time += 0.005;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const s of stars) {
      const flicker = Math.sin(this.time * 3 + s.phase) * 0.3 + 0.7;
      const a = s.alpha * flicker;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 180, 255, ${a})`;
      ctx.fill();
    }

    for (const p of particles) {
      p.pulse += p.pulseSpeed;
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;

      const dx = mouse.x - p.x;
      const dy = mouse.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 180) {
        const force = (180 - dist) / 180;
        p.vx += (dx / dist) * force * 0.025;
        p.vy += (dy / dist) * force * 0.025;
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (speed > 2.5) { p.vx = (p.vx / speed) * 2.5; p.vy = (p.vy / speed) * 2.5; }
      }

      const breathe = Math.sin(p.pulse) * 0.3 + 0.7;
      const currentSize = p.size * breathe;

      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, currentSize * 4);
      gradient.addColorStop(0, `hsla(${p.hue}, 80%, 70%, ${p.alpha * 0.4})`);
      gradient.addColorStop(1, `hsla(${p.hue}, 80%, 70%, 0)`);
      ctx.beginPath();
      ctx.arc(p.x, p.y, currentSize * 4, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      const coreAlpha = Math.sin(p.pulse) * 0.1 + 0.3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, currentSize, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 80%, 75%, ${p.alpha + coreAlpha})`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x - currentSize * 0.2, p.y - currentSize * 0.2, currentSize * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha * 0.3})`;
      ctx.fill();
    }

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

  const count = 10;
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
      filter: blur(${0.5 + Math.random() * 1.5}px);
    `;
    container.appendChild(el);
  }

  document.body.appendChild(container);
}
