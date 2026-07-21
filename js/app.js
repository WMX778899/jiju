/**
 * AniList 涓诲簲鐢ㄩ€昏緫
 * 澶勭悊 UI 娓叉煋銆佷簨浠剁粦瀹氥€佷氦浜?
 */

// ============================================================
// 宸ュ叿鍑芥暟
// ============================================================

const TYPE_ICONS = { anime: 'tv', drama: 'clapperboard', movie: 'film' };
const TYPE_LABELS = { anime: '鍔ㄦ极', drama: '鍓ч泦', movie: '鐢靛奖' };
const STATUS_LABELS = {
  watching: '<i class="fa-solid fa-play"></i> 鍦ㄧ湅',
  want_to_watch: '<i class="fa-regular fa-clock"></i> 鎯崇湅',
  completed: '<i class="fa-solid fa-check"></i> 鐪嬪畬',
  on_hold: '<i class="fa-solid fa-pause"></i> 鎼佺疆',
};

const STATUS_CLASSES = {
  watching: 'status-watching',
  want_to_watch: 'status-want_to_watch',
  completed: 'status-completed',
  on_hold: 'status-on_hold',
};

/** 鏍煎紡鍖栨棩鏈?*/
function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 1) return '浠婂ぉ';
  if (diffDays === 1) return '鏄ㄥぉ';
  if (diffDays < 7) return `${diffDays}澶╁墠`;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 鎺掑簭鍑芥暟 */
function sortEntries(entries, sortBy) {
  const sorted = [...entries];
  switch (sortBy) {
    case 'oldest':
      sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      break;
    case 'title':
      sorted.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
      break;
    case 'rating':
      sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0) || new Date(b.createdAt) - new Date(a.createdAt));
      break;
    case 'newest':
    default:
      sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      break;
  }
  return sorted;
}

/** 鏄剧ず Toast 娑堟伅 */
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

/** 鎾ら攢 Toast 瀹氭椂鍣ㄧ鐞?*/
const _undoTimers = new Map();

/**
 * 鏄剧ず甯︽挙閿€鎸夐挳鐨?Toast
 * @param {string} entryId - 琚垹闄ゆ潯鐩殑 ID
 * @param {Function} onUndo - 鐐瑰嚮鎾ら攢鏃剁殑鍥炶皟
 * @param {Function} onExpire - 瓒呮椂鏈挙閿€鏃剁殑娓呯悊鍥炶皟
 */
function showUndoToast(entryId, onUndo, onExpire) {
  // 娓呴櫎涔嬪墠鐨勫悓鍚嶅畾鏃跺櫒
  if (_undoTimers.has(entryId)) {
    clearTimeout(_undoTimers.get(entryId));
    _undoTimers.delete(entryId);
  }

  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast undo-toast';

  const msg = document.createElement('span');
  msg.textContent = '宸插垹闄わ紙5鍒嗛挓鍐呭彲鎾ら攢锛?;
  msg.className = 'undo-msg';

  const btn = document.createElement('button');
  btn.className = 'undo-btn';
  btn.textContent = '鎾ら攢';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onUndo(entryId);
    removeUndoToast(toast, entryId);
  });

  toast.appendChild(msg);
  toast.appendChild(btn);
  container.appendChild(toast);

  // 5鍒嗛挓鍚庤嚜鍔ㄦ秷澶憋紙鎾ら攢绐楀彛鏈燂級
  const timer = setTimeout(() => {
    removeUndoToast(toast, entryId);
    if (onExpire) onExpire(entryId);
  }, 300000);
  _undoTimers.set(entryId, timer);
}

function removeUndoToast(toast, entryId) {
  if (_undoTimers.has(entryId)) {
    clearTimeout(_undoTimers.get(entryId));
    _undoTimers.delete(entryId);
  }
  if (toast.parentNode) {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 250);
  }
}

// ============================================================
// 榧犳爣鍏夋檿璺熼殢
// ============================================================

function createGlowCursor() {
  const el = document.createElement('div');
  el.id = 'glowCursor';
  document.body.appendChild(el);
  let raf = null;
  let mx = -999, my = -999;

  document.addEventListener('mousemove', (e) => {
    mx = e.clientX;
    my = e.clientY;
    if (!raf) {
      raf = requestAnimationFrame(() => {
        el.style.left = mx + 'px';
        el.style.top = my + 'px';
        raf = null;
      });
    }
  });
}

// ============================================================
// 褰╃焊搴嗙鏁堟灉
// ============================================================

function fireConfetti() {
  const container = document.createElement('div');
  container.className = 'confetti-container';
  document.body.appendChild(container);

  const colors = ['#a855f7', '#ec4899', '#f59e0b', '#22c55e', '#60a5fa', '#f472b6', '#c084fc'];
  const shapes = ['鈻?, '鈼?, '鈻?, '鈽?, '鈾?];

  for (let i = 0; i < 50; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    const color = colors[Math.floor(Math.random() * colors.length)];
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    const size = Math.random() * 8 + 6;
    const left = Math.random() * 100;
    const delay = Math.random() * 1.2;
    const duration = Math.random() * 1.5 + 2;

    piece.textContent = shape;
    piece.style.cssText = `
      left: ${left}%;
      font-size: ${size}px;
      color: ${color};
      animation-delay: ${delay}s;
      animation-duration: ${duration}s;
      text-shadow: 0 0 6px ${color}44;
    `;
    container.appendChild(piece);
  }

  setTimeout(() => container.remove(), 4500);
}

// ============================================================
// 绮掑瓙鑳屾櫙鍔ㄧ敾锛堝寮虹増锛?
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
      // 棰滆壊锛氱传鑹茬郴涓轰富锛屽伓灏斿甫绮夎壊/钃濊壊
      hue: Math.random() < 0.7 ? 270 + Math.random() * 30 : (Math.random() < 0.5 ? 330 : 220),
    }));
  }

  initStars() {
    // 杩滃闂儊鐨勫皬鏄熸槦
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

    // 缁樺埗闂儊鏄熸槦锛堣儗鏅眰锛?
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

      // 榧犳爣鍚稿紩/寮瑰紑鏁堟灉
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

      // 绮掑瓙鍛煎惛鏁堟灉
      const breathe = Math.sin(p.pulse) * 0.3 + 0.7;
      const currentSize = p.size * breathe;

      // 缁樺埗绮掑瓙鍏夋檿锛堝鍙戝厜锛?
      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, currentSize * 4);
      gradient.addColorStop(0, `hsla(${p.hue}, 80%, 70%, ${p.alpha * 0.4})`);
      gradient.addColorStop(1, `hsla(${p.hue}, 80%, 70%, 0)`);
      ctx.beginPath();
      ctx.arc(p.x, p.y, currentSize * 4, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      // 缁樺埗绮掑瓙鏍稿績
      const coreAlpha = Math.sin(p.pulse) * 0.1 + 0.3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, currentSize, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 80%, 75%, ${p.alpha + coreAlpha})`;
      ctx.fill();

      // 绮掑瓙鏍稿績楂樺厜
      ctx.beginPath();
      ctx.arc(p.x - currentSize * 0.2, p.y - currentSize * 0.2, currentSize * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha * 0.3})`;
      ctx.fill();
    }

    // 杩炵嚎锛堝甫鍛煎惛鏁堟灉锛?
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
// 鑳屾櫙鍔ㄦ极鍓奖
// ============================================================

const ANIME_SILHOUETTES = [
  // 1. 馃崠 鑽夊附锛堣矾椋烇級
  `<svg viewBox="0 0 120 100" fill="currentColor">
    <ellipse cx="60" cy="82" rx="56" ry="12"/>
    <path d="M22,76 Q22,35 60,25 Q98,35 98,76"/>
  </svg>`,
  // 2. 鈿?璧涗簹浜哄彂鍨?+ 鍏夌幆锛堟偀绌猴級
  `<svg viewBox="0 0 100 120" fill="currentColor">
    <circle cx="50" cy="60" r="26"/>
    <polygon points="50,0 52,22 72,10 60,28 88,22 66,38 92,42 68,52 90,65 68,62 64,80 56,68 44,80 36,62 22,65 42,52 28,42 52,38 40,28 22,22 48,28 40,10 52,22"/>
    <circle cx="50" cy="12" r="18" fill="none" stroke="currentColor" stroke-width="4" opacity="0.5"/>
  </svg>`,
  // 3. 鈿?鐨崱涓?
  `<svg viewBox="0 0 100 100" fill="currentColor">
    <ellipse cx="50" cy="60" rx="32" ry="28"/>
    <polygon points="20,36 5,2 32,28"/>
    <polygon points="80,36 95,2 68,28"/>
    <polygon points="20,28 12,10 28,24"/>
    <polygon points="80,28 88,10 72,24"/>
  </svg>`,
  // 4. 馃寵 姘存墜鏈堜寒锛堜父瀛愬ご + 鏈堬級
  `<svg viewBox="0 0 100 110" fill="currentColor">
    <ellipse cx="50" cy="55" rx="24" ry="30"/>
    <circle cx="20" cy="32" r="16"/>
    <circle cx="80" cy="32" r="16"/>
    <path d="M58,8 A35,35 0 1,0 58,78 A28,35 0 1,1 58,8" opacity="0.4"/>
  </svg>`,
  // 5. 馃寑 鎵嬮噷鍓戯紙鐏奖锛?
  `<svg viewBox="0 0 100 100" fill="currentColor">
    <polygon points="50,2 54,46 98,50 54,54 50,98 46,54 2,50 46,46"/>
    <circle cx="50" cy="50" r="8" fill="var(--bg-primary)"/>
  </svg>`,
  // 6. 馃惐 鐚€筹紙鍔ㄦ极钀岀郴锛?
  `<svg viewBox="0 0 100 100" fill="currentColor">
    <ellipse cx="50" cy="60" rx="34" ry="30"/>
    <polygon points="20,40 28,8 42,36"/>
    <polygon points="80,40 72,8 58,36"/>
    <ellipse cx="50" cy="68" rx="10" ry="6"/>
  </svg>`,
  // 7. 馃巰 铦磋澏缁擄紙榄旀硶灏戝コ锛?
  `<svg viewBox="0 0 100 80" fill="currentColor">
    <path d="M50,40 Q20,10 10,30 Q5,50 50,40"/>
    <path d="M50,40 Q80,10 90,30 Q95,50 50,40"/>
    <ellipse cx="50" cy="40" rx="6" ry="8"/>
    <path d="M48,48 L42,72 M52,48 L58,72" stroke="currentColor" stroke-width="3" fill="none"/>
  </svg>`,
  // 8. 馃悏 榫欑彔
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
  // 妫€鏌ュ鍣ㄦ槸鍚﹀凡瀛樺湪
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

// ============================================================
// 涓诲簲鐢?
// ============================================================

class AniListApp {
  constructor() {
    // 褰撳墠鐘舵€?
    this.editingId = null;
    this.deletingId = null;
    this.currentType = 'all';
    this.currentStatus = 'all';
    this.currentSort = 'newest';
    this.searchQuery = '';
    this.prevStats = { all: 0, watching: 0, want_to_watch: 0, completed: 0, on_hold: 0 };
    /** 寰呮挙閿€鐨勫垹闄よ褰?{ id -> entryData } */
    this.pendingDeletes = {};

    this.initParticleBg();
    this.initAnimeBg();
    this.initGlowCursor();
    this.cacheDom();
    this.bindEvents();
    this.render();
    // 鏆撮湶缁欏叏灞€锛岀敤浜庤繙绋嬪悓姝ユ椂鑷姩鍒锋柊
    window.__anilistApp = this;
  }

  initParticleBg() {
    const canvas = document.getElementById('particleCanvas');
    if (canvas) new ParticleBackground(canvas);
  }

  initGlowCursor() {
    createGlowCursor();
  }

  initAnimeBg() {
    createAnimeSilhouettes();
  }

  cacheDom() {
    this.$ = (id) => document.getElementById(id);

    this.listContainer = this.$('listContainer');
    this.emptyState = this.$('emptyState');
    this.emptyText = this.$('emptyText');

    // 鎼滅储绛涢€?
    this.searchInput = this.$('searchInput');
    this.searchClear = this.$('searchClear');
    this.typeFilter = this.$('typeFilter');
    this.statusFilter = this.$('statusFilter');
    this.sortSelect = this.$('sortSelect');

    // 缁熻
    this.statsBar = this.$('statsBar');

    // 娴姩鎸夐挳
    this.fabAdd = this.$('fabAdd');

    // 琛ㄥ崟妯℃€佹
    this.formModal = this.$('formModal');
    this.modalTitle = this.$('modalTitle');
    this.modalClose = this.$('modalClose');
    this.formCancel = this.$('formCancel');
    this.animeForm = this.$('animeForm');
    this.formId = this.$('formId');
    this.formTitle = this.$('formTitle');
    this.formType = this.$('formType');
    this.formStatus = this.$('formStatus');
    this.formRating = this.$('formRating');
    this.formNotes = this.$('formNotes');
    this.formSubmit = this.$('formSubmit');
    this.starRatingEl = this.$('starRating');

    // 鍒犻櫎妯℃€佹
    this.deleteModal = this.$('deleteModal');
    this.deleteTitle = this.$('deleteTitle');
    this.deleteConfirm = this.$('deleteConfirm');
    this.deleteCancel = this.$('deleteCancel');
    this.deleteClose = this.$('deleteClose');

    this.resetBtn = this.$('resetBtn');
  }

  bindEvents() {
    // 鎼滅储
    this.searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.render();
    });
    this.searchClear.addEventListener('click', () => {
      this.searchInput.value = '';
      this.searchQuery = '';
      this.render();
    });

    // 绛涢€?
    this.typeFilter.addEventListener('change', (e) => {
      this.currentType = e.target.value;
      this.render();
    });
    this.statusFilter.addEventListener('change', (e) => {
      this.currentStatus = e.target.value;
      this.render();
    });
    this.sortSelect.addEventListener('change', (e) => {
      this.currentSort = e.target.value;
      this.render();
    });

    // 缁熻鏍忕偣鍑荤瓫閫?
    this.statsBar.addEventListener('click', (e) => {
      const statItem = e.target.closest('.stat-item');
      if (!statItem) return;
      const status = statItem.dataset.status;
      if (status === 'all') {
        this.statusFilter.value = 'all';
      } else {
        this.statusFilter.value = status;
      }
      this.currentStatus = this.statusFilter.value;
      this.render();
    });

    // 娴姩鎸夐挳 鈫?鎵撳紑娣诲姞琛ㄥ崟
    this.fabAdd.addEventListener('click', () => this.openForm());

    // 琛ㄥ崟鎻愪氦
    this.animeForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleFormSubmit();
    });

    // 鍏抽棴琛ㄥ崟
    const closeForm = () => this.closeModal(this.formModal);
    this.modalClose.addEventListener('click', closeForm);
    this.formCancel.addEventListener('click', closeForm);

    // 鏄熸槦璇勫垎
    this.starRatingEl.addEventListener('click', (e) => {
      const star = e.target.closest('.star');
      if (!star) return;
      const value = parseInt(star.dataset.value, 10);
      this.setRating(value);
    });

    this.starRatingEl.addEventListener('mouseover', (e) => {
      const star = e.target.closest('.star');
      if (!star) return;
      const value = parseInt(star.dataset.value, 10);
      this.previewRating(value);
    });

    this.starRatingEl.addEventListener('mouseleave', () => {
      this.previewRating(null);
    });

    // 鍏抽棴鍒犻櫎寮圭獥
    const closeDelete = () => this.closeModal(this.deleteModal);
    this.deleteClose.addEventListener('click', closeDelete);
    this.deleteCancel.addEventListener('click', closeDelete);
    this.deleteConfirm.addEventListener('click', () => this.handleDelete());
    this.deleteModal.addEventListener('click', (e) => {
      if (e.target === this.deleteModal) closeDelete();
    });

    this.resetBtn.addEventListener('click', () => this.handleReset());

    // 鐐瑰嚮妯℃€佹澶栭儴鍏抽棴
    this.formModal.addEventListener('click', (e) => {
      if (e.target === this.formModal) this.closeModal(this.formModal);
    });

    // Escape 閿?
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.formModal.classList.contains('open')) this.closeModal(this.formModal);
        if (this.deleteModal.classList.contains('open')) this.closeModal(this.deleteModal);
      }
    });
  }

  // ===== 鏄熸槦璇勫垎 =====
  setRating(value) {
    this.formRating.value = value;
    const stars = this.starRatingEl.querySelectorAll('.star');
    stars.forEach((star, i) => {
      star.classList.toggle('active', i < value);
      star.textContent = i < value ? '鈽? : '鈽?;
    });
  }

  previewRating(value) {
    const stars = this.starRatingEl.querySelectorAll('.star');
    const current = parseInt(this.formRating.value, 10);
    stars.forEach((star, i) => {
      if (value === null) {
        star.textContent = i < current ? '鈽? : '鈽?;
      } else {
        star.textContent = i < value ? '鈽? : '鈽?;
      }
    });
  }

  // ===== 鎵撳紑琛ㄥ崟 =====
  openForm(entry = null) {
    this.formModal.classList.add('open');
    document.body.style.overflow = 'hidden';

    if (entry) {
      // 缂栬緫妯″紡
      this.editingId = entry.id;
      this.modalTitle.textContent = '缂栬緫鏉＄洰';
      this.formSubmit.innerHTML = '<i class="fas fa-check"></i> 淇濆瓨淇敼';
      this.formId.value = entry.id;
      this.formTitle.value = entry.title;
      this.formType.value = entry.type;
      this.formStatus.value = entry.status;
      this.formNotes.value = entry.notes || '';
      this.setRating(entry.rating || 0);
    } else {
      // 娣诲姞妯″紡
      this.editingId = null;
      this.modalTitle.textContent = '娣诲姞鏉＄洰';
      this.formSubmit.innerHTML = '<i class="fas fa-check"></i> 淇濆瓨';
      this.animeForm.reset();
      this.formId.value = '';
      this.formRating.value = '0';
      this.setRating(0);
    }

    // 鑱氱劍鍚嶇О杈撳叆
    setTimeout(() => this.formTitle.focus(), 100);
  }

  // ===== 鍏抽棴妯℃€佹 =====
  closeModal(el) {
    el.classList.remove('open');
    document.body.style.overflow = '';
  }

  // ===== 琛ㄥ崟鎻愪氦 =====
  handleFormSubmit() {
    const title = this.formTitle.value.trim();
    if (!title) {
      showToast('璇疯緭鍏ュ悕绉?, 'error');
      this.formTitle.focus();
      return;
    }

    const data = {
      title,
      type: this.formType.value,
      status: this.formStatus.value,
      rating: parseInt(this.formRating.value, 10) || 0,
      notes: this.formNotes.value.trim(),
    };

    if (this.editingId) {
      AnimeDB.update(this.editingId, data);
      showToast('宸叉洿鏂?鉁?);
    } else {
      AnimeDB.add(data);
      showToast('宸叉坊鍔?馃帀');
      // 娣诲姞鏃舵斁褰╃焊搴嗙
      setTimeout(fireConfetti, 200);
    }

    this.closeModal(this.formModal);
    this.render();
  }

  // ===== 鍒犻櫎纭 =====
  confirmDelete(id) {
    const entry = AnimeDB.getById(id);
    if (!entry) return;
    this.deletingId = id;
    this.deleteTitle.textContent = `銆?{entry.title}銆峘;
    this.deleteModal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  handleDelete() {
    if (!this.deletingId) return;

    const entry = AnimeDB.getById(this.deletingId);
    if (!entry) { this.deletingId = null; return; }

    // 淇濆瓨瀹屾暣鏁版嵁鐢ㄤ簬鍙兘鐨勬挙閿€
    this.pendingDeletes[this.deletingId] = { ...entry };

    // 鍗＄墖娣″嚭鍔ㄧ敾
    const card = this.listContainer.querySelector(`.card[data-id="${this.deletingId}"]`);
    if (card) card.classList.add('removing');

    setTimeout(() => {
      const id = this.deletingId;
      AnimeDB.delete(id);
      this.deletingId = null;
      this.closeModal(this.deleteModal);
      // 鏄剧ず甯︽挙閿€鐨?Toast
      showUndoToast(
        id,
        (undoId) => this.handleUndoDelete(undoId),
        (expiredId) => { delete this.pendingDeletes[expiredId]; }
      );
      this.render();
    }, 250);
  }

  /** 鎾ら攢鍒犻櫎 */
  handleUndoDelete(id) {
    const data = this.pendingDeletes[id];
    if (!data) {
      showToast('宸叉棤娉曟挙閿€', 'error');
      return;
    }
    delete this.pendingDeletes[id];
    // 鐢ㄥ師濮?ID 閲嶆柊娣诲姞
    AnimeDB.undoAdd(data);
    showToast('宸叉仮澶?鈫╋笍');
    this.render();
  }

  // ===== 閲嶇疆 =====
  handleReset() {
    if (confirm('纭畾瑕佹竻闄ゆ墍鏈夋暟鎹悧锛熸鎿嶄綔涓嶅彲鎾ら攢锛?)) {
      AnimeDB.reset();
      showToast('宸查噸缃暟鎹?);
      this.render();
    }
  }

  // ===== 娓叉煋 =====
  render() {
    // 鑾峰彇骞剁瓫閫夋暟鎹?
    let entries = AnimeDB.search({
      query: this.searchQuery,
      type: this.currentType,
      status: this.currentStatus,
    });

    // 鎺掑簭
    entries = sortEntries(entries, this.currentSort);

    // 娓叉煋缁熻
    this.renderStats();

    // 绌虹姸鎬?
    const allEmpty = AnimeDB.getAll().length === 0;
    if (entries.length === 0) {
      this.listContainer.innerHTML = '';
      this.emptyState.classList.add('visible');
      if (this.searchQuery || this.currentType !== 'all' || this.currentStatus !== 'all') {
        this.emptyText.innerHTML = '<i class="fa-solid fa-search" style="opacity:0.4;margin-right:4px"></i> 娌℃湁绗﹀悎鏉′欢鐨勭粨鏋?;
      } else {
        this.emptyText.innerHTML = '<i class="fa-solid fa-pen" style="opacity:0.4;margin-right:4px"></i> 杩樻病鏈夎褰曪紝鐐?+ 娣诲姞鍚?;
      }
      return;
    }

    this.emptyState.classList.remove('visible');

    // 娓叉煋鍗＄墖
    this.listContainer.innerHTML = entries.map((entry, i) => this.createCard(entry, i)).join('');

    // 缁戝畾鍗＄墖浜嬩欢锛堝鎵橈級
    this.listContainer.querySelectorAll('.card').forEach((card) => {
      // 鐐瑰嚮鍗＄墖缂栬緫
      card.addEventListener('click', (e) => {
        // 濡傛灉鐐瑰嚮鐨勬槸瀛愬厓绱犵殑鎸夐挳绛夛紝涓嶈Е鍙戠紪杈?
        if (e.target.closest('.card-delete-btn')) return;
        const id = card.dataset.id;
        const entry = AnimeDB.getById(id);
        if (entry) this.openForm(entry);
      });

      // 鍒犻櫎鎸夐挳
      const deleteBtn = card.querySelector('.card-delete-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.confirmDelete(card.dataset.id);
        });
      }
    });
  }

  renderStats() {
    const stats = AnimeDB.getStats();
    const statMap = { all: 'statAll', watching: 'statWatching', want_to_watch: 'statWant', completed: 'statCompleted', on_hold: 'statHold' };

    for (const [key, id] of Object.entries(statMap)) {
      const el = this.$(id);
      const newVal = stats[key];
      if (el.textContent !== String(newVal)) {
        el.textContent = newVal;
        el.classList.remove('pop');
        // 瑙﹀彂閲嶆帓浠ラ噸鏂版挱鏀惧姩鐢?
        void el.offsetWidth;
        el.classList.add('pop');
      }
    }

    // 楂樹寒褰撳墠绛涢€?
    const activeStatus = this.currentStatus === 'all' ? 'all' : this.currentStatus;
    this.statsBar.querySelectorAll('.stat-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.status === activeStatus);
    });
  }

  createCard(entry, index) {
    const stars = '鈽?.repeat(entry.rating) + '鈽?.repeat(5 - entry.rating);
    const notesHtml = entry.notes
      ? `<div class="card-notes">${this.escapeHtml(entry.notes)}</div>`
      : '';

    const typeIcon = TYPE_ICONS[entry.type] || 'film';
    const typeColors = { anime: '#f472b6', drama: '#60a5fa', movie: '#f59e0b' };
    const typeColor = typeColors[entry.type] || '#a855f7';

    return `
      <div class="card" data-id="${entry.id}" style="animation-delay: ${index * 0.04}s">
        <div class="card-header">
          <div class="card-type-badge" style="background: ${typeColor}18; color: ${typeColor}">
            <i class="fa-solid fa-${typeIcon}"></i>
            <span class="card-type-badge-text">${TYPE_LABELS[entry.type] || entry.type}</span>
          </div>
          <div class="card-title">${this.escapeHtml(entry.title)}</div>
          <button class="card-delete-btn header-btn" title="鍒犻櫎" style="flex-shrink:0">
            <i class="fa-regular fa-trash-can"></i>
          </button>
        </div>
        <div>
          <span class="card-status ${STATUS_CLASSES[entry.status] || ''}">
            ${STATUS_LABELS[entry.status] || entry.status}
          </span>
        </div>
        ${notesHtml}
        <div class="card-footer">
          <div class="card-rating">
            ${Array.from({ length: 5 }, (_, i) =>
              `<span class="${i < entry.rating ? 'star-filled' : ''}">${i < entry.rating ? '鈽? : '鈽?}</span>`
            ).join('')}
          </div>
          <span class="card-date"><i class="fa-regular fa-calendar"></i> ${formatDate(entry.createdAt)}</span>
        </div>
      </div>
    `;
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

// ============================================================
// 鍚屾鐘舵€佹寚绀哄櫒
// ============================================================

function updateSyncUI(status, msg) {
  const el = document.getElementById('syncStatus');
  const text = document.getElementById('syncText');
  if (!el || !text) return;
  el.className = 'sync-status sync-' + status;
  const icon = el.querySelector('i');
  const icons = {
    local: 'fa-solid fa-cloud-slash',
    syncing: 'fa-solid fa-cloud-arrow-up',
    connected: 'fa-solid fa-cloud-check',
    error: 'fa-solid fa-cloud-exclamation',
  };
  if (icons[status]) icon.className = icons[status];
  text.textContent = msg || { local: '鏈湴', syncing: '鍚屾涓€?, connected: '宸插悓姝?, error: '鍚屾澶辫触' }[status] || '鏈湴';
}

function showGitHubStatus(msg, isError) {
  const el = document.getElementById('githubStatus');
  if (el) {
    el.textContent = msg;
    el.style.color = isError ? 'var(--danger)' : 'var(--success)';
  }
}

// ============================================================
// 鍚姩
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  // 浠?GitHub CDN 鎷夊彇鏁版嵁锛堜笉鍐嶄粠 localStorage锛?
  const defaultRepo = typeof GITHUB_DEFAULT_REPO !== 'undefined' ? GITHUB_DEFAULT_REPO : '';

  // URL 鍙傛暟 token锛堣法璁惧棣栨閰嶇疆锛?
  const urlParams = new URLSearchParams(window.location.search);
  const urlToken = urlParams.get('token');
  let cfg = AnimeDB.getGitHubConfig();

  if (urlToken) {
    AnimeDB.saveGitHubConfig({ token: urlToken, repo: cfg ? cfg.repo : defaultRepo });
    cfg = AnimeDB.getGitHubConfig();
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);
  }

  // 浠庝簯绔姞杞芥暟鎹?
  updateSyncUI('syncing');
  try {
    await AnimeDB.init(defaultRepo);
  } catch { updateSyncUI('local'); }

  // 鍚姩搴旂敤
  new AniListApp();

  // ===== GitHub 鍚屾寮圭獥浜嬩欢 =====
  const githubBtn = document.getElementById('githubBtn');
  const githubModal = document.getElementById('githubModal');
  const githubClose = document.getElementById('githubClose');
  const githubCancel = document.getElementById('githubCancel');
  const githubPushBtn = document.getElementById('githubPushBtn');
  const githubPullBtn = document.getElementById('githubPullBtn');

  if (githubBtn && githubModal) {
    const openGithubModal = () => {
      const c = AnimeDB.getGitHubConfig();
      document.getElementById('githubToken').value = c ? (c.token || '') : '';
      document.getElementById('githubRepo').value = c ? (c.repo || '') : (defaultRepo || '');
      githubModal.classList.add('open');
      document.body.style.overflow = 'hidden';
    };
    const closeGithubModal = () => {
      // 鍏抽棴鏃惰褰?session 鏍囪锛岄伩鍏嶆湰浼氳瘽鍙嶅寮瑰紩瀵?
      sessionStorage.setItem('anilist_gh_dismissed', '1');
      // 鎭㈠鏍囬锛堝鏋滄槸棣栨閰嶇疆寮曞寮圭獥锛?
      const titleEl = githubModal.querySelector('.modal-title');
      if (titleEl && titleEl.dataset.origTitle) {
        titleEl.innerHTML = titleEl.dataset.origTitle;
      }
      githubModal.classList.remove('open');
      document.body.style.overflow = '';
    };

    githubBtn.addEventListener('click', openGithubModal);
    githubClose.addEventListener('click', closeGithubModal);
    githubCancel.addEventListener('click', closeGithubModal);
    githubModal.addEventListener('click', (e) => {
      if (e.target === githubModal) closeGithubModal();
    });

    // 涓婁紶鍒颁簯绔?
    githubPushBtn.addEventListener('click', async () => {
      const token = document.getElementById('githubToken').value.trim();
      const repo = document.getElementById('githubRepo').value.trim();
      if (!token || !repo) {
        showGitHubStatus('璇峰～鍐?Token 鍜屼粨搴撳悕', true);
        return;
      }
      AnimeDB.saveGitHubConfig({ token, repo });
      showGitHubStatus('姝ｅ湪涓婁紶鈥?);
      updateSyncUI('syncing');
      try {
        await AnimeDB.push();
        showGitHubStatus('鉁?涓婁紶鎴愬姛锛?);
        updateSyncUI('connected', '浜戠');
      } catch (e) {
        showGitHubStatus('鉂?' + e.message, true);
        updateSyncUI('error');
      }
    });

    // 浠庝簯绔笅杞?
    githubPullBtn.addEventListener('click', async () => {
      const token = document.getElementById('githubToken').value.trim();
      const repo = document.getElementById('githubRepo').value.trim();
      if (!repo) {
        showGitHubStatus('璇峰～鍐欎粨搴撳悕', true);
        return;
      }
      AnimeDB.saveGitHubConfig({ token, repo });
      showGitHubStatus('姝ｅ湪涓嬭浇鈥?);
      updateSyncUI('syncing');
      try {
        await AnimeDB.init(repo);
        const count = AnimeDB.getAll().length;
        showGitHubStatus(`鉁?宸插姞杞?${count} 鏉′簯绔暟鎹甡);
        updateSyncUI('connected', '浜戠');
        const app = window.__anilistApp;
        if (app) app.render();
      } catch (e) {
        showGitHubStatus('鉂?' + e.message, true);
        updateSyncUI('error');
      }
    });

    // ===== 鏂拌澶囧紩瀵硷細鏈厤 token 鏃惰嚜鍔ㄥ脊鍑洪厤缃獥鍙?=====
    (function autoPromptGitHub() {
      const cfg = AnimeDB.getGitHubConfig();
      const hasToken = cfg && cfg.token;
      const dismissed = sessionStorage.getItem('anilist_gh_dismissed');
      if (hasToken || dismissed) return;

      setTimeout(() => {
        const titleEl = githubModal.querySelector('.modal-title');
        if (titleEl) {
          titleEl.dataset.origTitle = titleEl.innerHTML;
          titleEl.innerHTML = '<i class="fa-brands fa-github"></i> 棣栨閰嶇疆 路 浜戝悓姝?;
        }
        showGitHubStatus('馃攽 棣栨浣跨敤璇峰～鍐?GitHub Personal Access Token锛屼粎闇€閰嶇疆涓€娆?, false);
        openGithubModal();
      }, 1200);
    })();
  }

  // Escape 閿叧闂?
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modals = document.querySelectorAll('.modal-overlay.open');
      modals.forEach(m => m.classList.remove('open'));
      document.body.style.overflow = '';
    }
  });
});






