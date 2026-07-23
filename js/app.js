/**
 * AniList 主应用逻辑
 * 处理 UI 渲染、事件绑定、交互
 */

// ============================================================
// 工具函数
// ============================================================

const TYPE_ICONS = { anime: 'tv', drama: 'clapperboard', movie: 'film' };
const TYPE_LABELS = { anime: '动漫', drama: '剧集', movie: '电影' };
const STATUS_LABELS = {
  watching: '<i class="fa-solid fa-play"></i> 在看',
  want_to_watch: '<i class="fa-regular fa-clock"></i> 想看',
  completed: '<i class="fa-solid fa-check"></i> 看完',
};

const STATUS_CLASSES = {
  watching: 'status-watching',
  want_to_watch: 'status-want_to_watch',
  completed: 'status-completed',
};

/** 格式化日期 */
function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 1) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return `${diffDays}天前`;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 排序函数 */
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

/** 显示 Toast 消息 */
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

/** 撤销 Toast 定时器管理 */
const _undoTimers = new Map();

/**
 * 显示带撤销按钮的 Toast
 * @param {string} entryId - 被删除条目的 ID
 * @param {Function} onUndo - 点击撤销时的回调
 * @param {Function} onExpire - 超时未撤销时的清理回调
 */
function showUndoToast(entryId, onUndo, onExpire) {
  // 清除之前的同名定时器
  if (_undoTimers.has(entryId)) {
    clearTimeout(_undoTimers.get(entryId));
    _undoTimers.delete(entryId);
  }

  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast undo-toast';

  const msg = document.createElement('span');
  msg.textContent = '已删除（5分钟内可撤销）';
  msg.className = 'undo-msg';

  const btn = document.createElement('button');
  btn.className = 'undo-btn';
  btn.textContent = '撤销';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onUndo(entryId);
    removeUndoToast(toast, entryId);
  });

  toast.appendChild(msg);
  toast.appendChild(btn);
  container.appendChild(toast);

  // 5分钟后自动消失（撤销窗口期）
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
// 鼠标光晕跟随
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
// 彩纸庆祝效果
// ============================================================

function fireConfetti() {
  const container = document.createElement('div');
  container.className = 'confetti-container';
  document.body.appendChild(container);

  const colors = ['#a855f7', '#ec4899', '#f59e0b', '#22c55e', '#60a5fa', '#f472b6', '#c084fc'];
  const shapes = ['■', '●', '▲', '★', '♦'];

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

// 粒子背景 + 动漫剪影已移至 js/particles.js

// ============================================================
// 主应用
// ============================================================

class AniListApp {
  constructor() {
    // 当前状态
    this.editingId = null;
    this.deletingId = null;
    this.currentType = 'all';
    this.currentStatus = 'want_to_watch';
    this.currentSort = 'newest';
    this.searchQuery = '';
    this.prevStats = { all: 0, watching: 0, want_to_watch: 0, completed: 0 };
    /** 待撤销的删除记录 { id -> entryData } */
    this.pendingDeletes = {};

    this.initParticleBg();
    this.initAnimeBg();
    this.initGlowCursor();
    this.cacheDom();
    this.statusFilter.value = this.currentStatus;
    this.bindEvents();
    this.render();
    // 暴露给全局，用于远程同步时自动刷新
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

    // 搜索
    this.searchInput = this.$('globalSearch');

    // 筛选
    this.typeFilter = this.$('typeFilter');
    this.statusFilter = this.$('statusFilter');
    this.sortSelect = this.$('sortSelect');

    // 统计
    this.statsBar = this.$('statsBar');

    // 浮动按钮
    this.fabAdd = this.$('fabAdd');

    // 表单模态框
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

    // 删除模态框
    this.deleteModal = this.$('deleteModal');
    this.deleteTitle = this.$('deleteTitle');
    this.deleteConfirm = this.$('deleteConfirm');
    this.deleteCancel = this.$('deleteCancel');
    this.deleteClose = this.$('deleteClose');

    // 导入导出
    this.exportBtn = this.$('exportBtn');
    this.importBtn = this.$('importBtn');
    this.importFileInput = this.$('importFileInput');
    this.resetBtn = this.$('resetBtn');
  }

  bindEvents() {
    // 全局搜索（按当前模块过滤）
    this.searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.render();
    });

    // 筛选
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

    // 统计栏点击筛选（点击搜索框时不切换）
    this.statsBar.addEventListener('click', (e) => {
      if (e.target.closest('.stat-search')) return;
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

    // 浮动按钮 → 打开添加表单
    this.fabAdd.addEventListener('click', () => this.openForm());

    // 表单提交
    this.animeForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleFormSubmit();
    });

    // 关闭表单
    const closeForm = () => this.closeModal(this.formModal);
    this.modalClose.addEventListener('click', closeForm);
    this.formCancel.addEventListener('click', closeForm);

    // 星星评分
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

    // 关闭删除弹窗
    const closeDelete = () => this.closeModal(this.deleteModal);
    this.deleteClose.addEventListener('click', closeDelete);
    this.deleteCancel.addEventListener('click', closeDelete);
    this.deleteConfirm.addEventListener('click', () => this.handleDelete());
    this.deleteModal.addEventListener('click', (e) => {
      if (e.target === this.deleteModal) closeDelete();
    });

    // 导出
    this.exportBtn.addEventListener('click', () => this.handleExport());

    // 导入
    this.importBtn.addEventListener('click', () => this.importFileInput.click());
    this.importFileInput.addEventListener('change', (e) => this.handleImport(e));

    // 重置
    this.resetBtn.addEventListener('click', () => this.handleReset());

    // 点击模态框外部关闭
    this.formModal.addEventListener('click', (e) => {
      if (e.target === this.formModal) this.closeModal(this.formModal);
    });

    // Escape 键
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.formModal.classList.contains('open')) this.closeModal(this.formModal);
        if (this.deleteModal.classList.contains('open')) this.closeModal(this.deleteModal);
      }
    });
  }

  // ===== 星星评分 =====
  setRating(value) {
    this.formRating.value = value;
    const stars = this.starRatingEl.querySelectorAll('.star');
    stars.forEach((star, i) => {
      star.classList.toggle('active', i < value);
      star.textContent = i < value ? '★' : '☆';
    });
  }

  previewRating(value) {
    const stars = this.starRatingEl.querySelectorAll('.star');
    const current = parseInt(this.formRating.value, 10);
    stars.forEach((star, i) => {
      if (value === null) {
        star.textContent = i < current ? '★' : '☆';
      } else {
        star.textContent = i < value ? '★' : '☆';
      }
    });
  }

  // ===== 打开表单 =====
  openForm(entry = null) {
    this.formModal.classList.add('open');
    document.body.style.overflow = 'hidden';

    if (entry) {
      // 编辑模式
      this.editingId = entry.id;
      this.modalTitle.textContent = '编辑条目';
      this.formSubmit.innerHTML = '<i class="fas fa-check"></i> 保存修改';
      this.formId.value = entry.id;
      this.formTitle.value = entry.title;
      this.formType.value = entry.type;
      this.formStatus.value = entry.status;
      this.formNotes.value = entry.notes || '';
      this.setRating(entry.rating || 0);
    } else {
      // 添加模式
      this.editingId = null;
      this.modalTitle.textContent = '添加条目';
      this.formSubmit.innerHTML = '<i class="fas fa-check"></i> 保存';
      this.animeForm.reset();
      this.formId.value = '';
      this.formRating.value = '0';
      this.setRating(0);
    }

    // 聚焦名称输入
    setTimeout(() => this.formTitle.focus(), 100);
  }

  // ===== 关闭模态框 =====
  closeModal(el) {
    el.classList.remove('open');
    document.body.style.overflow = '';
  }

  // ===== 表单提交 =====
  handleFormSubmit() {
    const title = this.formTitle.value.trim();
    if (!title) {
      showToast('请输入名称', 'error');
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
      showToast('已更新 ✨');
    } else {
      AnimeDB.add(data);
      showToast('已添加 🎉');
      // 添加时放彩纸庆祝
      setTimeout(fireConfetti, 200);
    }

    this.closeModal(this.formModal);
    this.render();
  }

  // ===== 删除确认 =====
  confirmDelete(id) {
    const entry = AnimeDB.getById(id);
    if (!entry) return;
    this.deletingId = id;
    this.deleteTitle.textContent = `「${entry.title}」`;
    this.deleteModal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  handleDelete() {
    if (!this.deletingId) return;

    const entry = AnimeDB.getById(this.deletingId);
    if (!entry) { this.deletingId = null; return; }

    // 保存完整数据用于可能的撤销
    this.pendingDeletes[this.deletingId] = { ...entry };

    // 卡片淡出动画
    const card = this.listContainer.querySelector(`.card[data-id="${this.deletingId}"]`);
    if (card) card.classList.add('removing');

    setTimeout(() => {
      const id = this.deletingId;
      AnimeDB.delete(id);
      this.deletingId = null;
      this.closeModal(this.deleteModal);
      // 显示带撤销的 Toast
      showUndoToast(
        id,
        (undoId) => this.handleUndoDelete(undoId),
        (expiredId) => { delete this.pendingDeletes[expiredId]; }
      );
      this.render();
    }, 250);
  }

  /** 撤销删除 */
  handleUndoDelete(id) {
    const data = this.pendingDeletes[id];
    if (!data) {
      showToast('已无法撤销', 'error');
      return;
    }
    delete this.pendingDeletes[id];
    // 用原始 ID 重新添加
    AnimeDB.undoAdd(data);
    showToast('已恢复 ↩️');
    this.render();
  }

  // ===== 导出 =====
  handleExport() {
    const json = AnimeDB.exportData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anilist-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('导出成功 📦');
  }

  // ===== 导入 =====
  handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const count = AnimeDB.importData(event.target.result);
        showToast(`导入成功！共 ${count} 条记录 📥`);
        this.render();
      } catch (err) {
        showToast(err.message || '导入失败', 'error');
      }
    };
    reader.onerror = () => {
      showToast('文件读取失败', 'error');
    };
    reader.readAsText(file);
    // 重置 input 以支持重复导入同文件
    this.importFileInput.value = '';
  }

  // ===== 重置 =====
  handleReset() {
    if (confirm('确定要清除所有数据吗？此操作不可撤销！')) {
      AnimeDB.reset();
      showToast('已重置数据');
      this.render();
    }
  }

  // ===== 渲染 =====
  render() {

    // 获取并筛选数据（搜索词应用于当前模块）
    const query = this.searchQuery;
    let entries = AnimeDB.search({
      query,
      type: this.currentType,
      status: this.currentStatus,
    });

    // 排序
    entries = sortEntries(entries, this.currentSort);

    // 渲染统计
    this.renderStats();

    // 空状态
    const allEmpty = AnimeDB.getAll().length === 0;
    if (entries.length === 0) {
      this.listContainer.innerHTML = '';
      this.emptyState.classList.add('visible');
      if (query || this.currentType !== 'all' || this.currentStatus !== 'all') {
        this.emptyText.innerHTML = '<i class="fa-solid fa-search" style="opacity:0.4;margin-right:4px"></i> 没有符合条件的结果';
      } else {
        this.emptyText.innerHTML = '<i class="fa-solid fa-pen" style="opacity:0.4;margin-right:4px"></i> 还没有记录，点 + 添加吧';
      }
      return;
    }

    this.emptyState.classList.remove('visible');

    // 渲染卡片
    this.listContainer.innerHTML = entries.map((entry, i) => this.createCard(entry, i)).join('');


    // 绑定卡片事件（委托）
    this.listContainer.querySelectorAll('.card').forEach((card) => {
      // 点击卡片编辑
      card.addEventListener('click', (e) => {
        // 如果点击的是子元素的按钮等，不触发编辑
        if (e.target.closest('.card-delete-btn')) return;
        const id = card.dataset.id;
        const entry = AnimeDB.getById(id);
        if (entry) this.openForm(entry);
      });

      // 删除按钮
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
    const statMap = { all: 'statAll', watching: 'statWatching', want_to_watch: 'statWant', completed: 'statCompleted' };

    for (const [key, id] of Object.entries(statMap)) {
      const el = this.$(id);
      const newVal = stats[key];
      if (el.textContent !== String(newVal)) {
        el.textContent = newVal;
        el.classList.remove('pop');
        // 触发重排以重新播放动画
        void el.offsetWidth;
        el.classList.add('pop');
      }
    }

    // 高亮当前筛选
    const activeStatus = this.currentStatus === 'all' ? 'all' : this.currentStatus;
    this.statsBar.querySelectorAll('.stat-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.status === activeStatus);
    });
  }

  createCard(entry, index) {
    const stars = '★'.repeat(entry.rating) + '☆'.repeat(5 - entry.rating);
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
          <button class="card-delete-btn header-btn" title="删除" style="flex-shrink:0">
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
              `<span class="${i < entry.rating ? 'star-filled' : ''}">${i < entry.rating ? '★' : '☆'}</span>`
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
// 同步状态指示器
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
  text.textContent = msg || { local: '本地', syncing: '同步中…', connected: '已同步', error: '同步失败' }[status] || '本地';
}

function showGitHubStatus(msg, isError) {
  const el = document.getElementById('githubStatus');
  if (el) {
    el.textContent = msg;
    el.style.color = isError ? 'var(--danger)' : 'var(--success)';
  }
}

// ============================================================
// 启动
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  // 从 GitHub CDN 拉取数据（不再从 localStorage）
  const defaultRepo = typeof GITHUB_DEFAULT_REPO !== 'undefined' ? GITHUB_DEFAULT_REPO : '';

  // URL 参数 token（跨设备首次配置）
  const urlParams = new URLSearchParams(window.location.search);
  const urlToken = urlParams.get('token');
  let cfg = AnimeDB.getGitHubConfig();

  if (urlToken) {
    AnimeDB.saveGitHubConfig({ token: urlToken, repo: cfg ? cfg.repo : defaultRepo });
    cfg = AnimeDB.getGitHubConfig();
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);
  }

  // 从云端加载数据
  updateSyncUI('syncing');
  try {
    await AnimeDB.init(defaultRepo);
  } catch { updateSyncUI('local'); }

  // 启动应用
  new AniListApp();

  // ===== GitHub 同步弹窗事件 =====
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
      document.getElementById('githubToken').type = 'password';
      githubModal.classList.add('open');
      document.body.style.overflow = 'hidden';
      // 重置 Token 密码门禁状态
      var rGate = document.getElementById('tokenRevealGate');
      var rBtn = document.getElementById('tokenRevealBtn');
      var rPwd = document.getElementById('tokenRevealPwd');
      if (rGate) rGate.style.display = 'none';
      if (rBtn) rBtn.style.display = '';
      if (rPwd) rPwd.value = '';
      var rErr = document.getElementById('tokenRevealErr');
      if (rErr) rErr.classList.remove('show');
    };
    const closeGithubModal = () => {
      // 关闭时记录 session 标记，避免本会话反复弹引导
      sessionStorage.setItem('anilist_gh_dismissed', '1');
      // 恢复标题（如果是首次配置引导弹窗）
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

    // 上传到云端
    githubPushBtn.addEventListener('click', async () => {
      const token = document.getElementById('githubToken').value.trim();
      const repo = document.getElementById('githubRepo').value.trim();
      if (!token || !repo) {
        showGitHubStatus('请填写 Token 和仓库名', true);
        return;
      }
      AnimeDB.saveGitHubConfig({ token, repo });
      showGitHubStatus('正在上传…');
      updateSyncUI('syncing');
      try {
        await AnimeDB.push();
        showGitHubStatus('✅ 上传成功！');
        updateSyncUI('connected', '云端');
      } catch (e) {
        showGitHubStatus('❌ ' + e.message, true);
        updateSyncUI('error');
      }
    });

    // 从云端下载
    githubPullBtn.addEventListener('click', async () => {
      const token = document.getElementById('githubToken').value.trim();
      const repo = document.getElementById('githubRepo').value.trim();
      if (!repo) {
        showGitHubStatus('请填写仓库名', true);
        return;
      }
      AnimeDB.saveGitHubConfig({ token, repo });
      showGitHubStatus('正在下载…');
      updateSyncUI('syncing');
      try {
        await AnimeDB.init(repo);
        const count = AnimeDB.getAll().length;
        showGitHubStatus(`✅ 已加载 ${count} 条云端数据`);
        updateSyncUI('connected', '云端');
        const app = window.__anilistApp;
        if (app) app.render();
      } catch (e) {
        showGitHubStatus('❌ ' + e.message, true);
        updateSyncUI('error');
      }
    });

    // ===== 新设备引导：未配 token 时自动弹出配置窗口 =====
    (function autoPromptGitHub() {
      const cfg = AnimeDB.getGitHubConfig();
      const hasToken = cfg && cfg.token;
      const dismissed = sessionStorage.getItem('anilist_gh_dismissed');
      if (hasToken || dismissed) return;

      setTimeout(() => {
        const titleEl = githubModal.querySelector('.modal-title');
        if (titleEl) {
          titleEl.dataset.origTitle = titleEl.innerHTML;
          titleEl.innerHTML = '<i class="fa-brands fa-github"></i> 首次配置 · 云同步';
        }
        showGitHubStatus('🔑 首次使用请填写 GitHub Personal Access Token，仅需配置一次', false);
        openGithubModal();
      }, 1200);
    })();
  }

  // Escape 键关闭
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modals = document.querySelectorAll('.modal-overlay.open');
      modals.forEach(m => m.classList.remove('open'));
      document.body.style.overflow = '';
    }
  });
});
