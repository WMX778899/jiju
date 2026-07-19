/**
 * AniList 主应用逻辑
 * 处理 UI 渲染、事件绑定、交互
 */

// ============================================================
// 工具函数
// ============================================================

const TYPE_ICONS = { anime: '🎌', drama: '📺', movie: '🎬' };
const TYPE_LABELS = { anime: '动漫', drama: '剧集', movie: '电影' };
const STATUS_LABELS = {
  watching: '▶ 在看',
  want_to_watch: '⏳ 想看',
  completed: '✅ 看完',
  on_hold: '💤 搁置',
};

const STATUS_CLASSES = {
  watching: 'status-watching',
  want_to_watch: 'status-want_to_watch',
  completed: 'status-completed',
  on_hold: 'status-on_hold',
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

// ============================================================
// 粒子背景动画
// ============================================================

class ParticleBackground {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.mouse = { x: -999, y: -999 };
    this.resize();
    this.initParticles();
    this.bindEvents();
    this.animate();
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  initParticles() {
    const count = Math.min(80, Math.floor((this.canvas.width * this.canvas.height) / 15000));
    this.particles = Array.from({ length: count }, () => ({
      x: Math.random() * this.canvas.width,
      y: Math.random() * this.canvas.height,
      vx: (Math.random() - 0.5) * 1.2,
      vy: (Math.random() - 0.5) * 1.2,
      size: Math.random() * 2 + 0.5,
      alpha: Math.random() * 0.4 + 0.1,
    }));
  }

  bindEvents() {
    const resizeFn = () => {
      this.resize();
      this.initParticles();
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
    const { ctx, canvas, particles, mouse } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;

      // 鼠标吸引效果
      const dx = mouse.x - p.x;
      const dy = mouse.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 150) {
        const force = (150 - dist) / 150;
        p.vx += (dx / dist) * force * 0.02;
        p.vy += (dy / dist) * force * 0.02;
        // 限制速度
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (speed > 2) { p.vx = (p.vx / speed) * 2; p.vy = (p.vy / speed) * 2; }
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(168, 85, 247, ${p.alpha})`;
      ctx.fill();
    }

    // 连线
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = dx * dx + dy * dy;
        if (dist < 15000) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(168, 85, 247, ${0.08 * (1 - dist / 15000)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(() => this.animate());
  }
}

// ============================================================
// 主应用
// ============================================================

class AniListApp {
  constructor() {
    // 当前状态
    this.editingId = null;
    this.deletingId = null;
    this.currentType = 'all';
    this.currentStatus = 'all';
    this.currentSort = 'newest';
    this.searchQuery = '';

    this.initParticleBg();
    this.cacheDom();
    this.bindEvents();
    this.render();
  }

  initParticleBg() {
    const canvas = document.getElementById('particleCanvas');
    if (canvas) new ParticleBackground(canvas);
  }

  cacheDom() {
    this.$ = (id) => document.getElementById(id);

    this.listContainer = this.$('listContainer');
    this.emptyState = this.$('emptyState');
    this.emptyText = this.$('emptyText');

    // 搜索筛选
    this.searchInput = this.$('searchInput');
    this.searchClear = this.$('searchClear');
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
    // 搜索
    this.searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.render();
    });
    this.searchClear.addEventListener('click', () => {
      this.searchInput.value = '';
      this.searchQuery = '';
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

    // 统计栏点击筛选
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
    AnimeDB.delete(this.deletingId);
    this.deletingId = null;
    this.closeModal(this.deleteModal);
    showToast('已删除 🗑️');
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
    // 获取并筛选数据
    let entries = AnimeDB.search({
      query: this.searchQuery,
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
      if (this.searchQuery || this.currentType !== 'all' || this.currentStatus !== 'all') {
        this.emptyText.textContent = '没有符合条件的结果 🧐';
      } else {
        this.emptyText.textContent = '还没有记录，点 + 添加吧 🎬';
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
    this.$('statAll').textContent = stats.all;
    this.$('statWatching').textContent = stats.watching;
    this.$('statWant').textContent = stats.want_to_watch;
    this.$('statCompleted').textContent = stats.completed;
    this.$('statHold').textContent = stats.on_hold;

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

    return `
      <div class="card" data-id="${entry.id}" style="animation-delay: ${index * 0.04}s">
        <div class="card-header">
          <div class="card-type-badge">${TYPE_ICONS[entry.type] || '🎬'}</div>
          <div class="card-title">${this.escapeHtml(entry.title)}</div>
          <button class="card-delete-btn header-btn" title="删除" style="flex-shrink:0">
            <i class="fas fa-times"></i>
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
          <span class="card-date">${formatDate(entry.createdAt)}</span>
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
// 启动
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  new AniListApp();
});
