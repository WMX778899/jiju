/**
 * AnimeDB - 纯云端存储层
 * 数据全部在 GitHub 仓库 data.json，不存 localStorage
 * 所有设备看到同一份数据
 */

function _utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

class AnimeDB {
  /** 内存缓存（一次会话有效） */
  static _cache = [];
  static _loaded = false;
  static _repo = 'WMX778899/jiju';

  /** 同步状态回调 */
  static _syncListeners = [];
  static _syncStatus = 'local';
  static _undoPushTimer = null;

  // ===== 初始化：从 GitHub API 拉取最新数据（无缓存，实时）=====
  static async init(repoOverride) {
    const repo = repoOverride || this._repo;
    if (!repo) { this._loaded = true; return this._cache; }
    const [owner, name] = repo.split('/');

    // 公开仓库的 API 读取不需要 token（60次/小时，足够用）
    const cfg = this.getGitHubConfig();
    const headers = {};
    if (cfg && cfg.token) headers['Authorization'] = `Bearer ${cfg.token}`;

    try {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${name}/contents/data.json`,
        { headers }
      );
      if (res.ok) {
        const d = await res.json();
        // 解码 base64 内容
        const decoded = (() => {
          const raw = atob(d.content);
          const bytes = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
          return new TextDecoder().decode(bytes);
        })();
        const remote = JSON.parse(decoded);
        const entries = Array.isArray(remote) ? remote : (remote.entries || []);
        this._cache = entries;
        this._repo = repo;
        if (cfg && cfg.token) { cfg._sha = d.sha; this.saveGitHubConfig(cfg); }
        this._setStatus('connected', '云端');
      }
    } catch { /* 首次使用 / 网络不通 → 空列表 */ }

    this._loaded = true;
    return this._cache;
  }

  /** 确保已初始化 */
  static _ensureLoaded() {
    if (!this._loaded) throw new Error('数据尚未加载，请先调用 init()');
  }

  // ===== GitHub 配置（仅 token/repo 存 localStorage）=====
  static GITHUB_CONFIG_KEY = 'anilist_github_config';

  static getGitHubConfig() {
    try {
      const raw = localStorage.getItem(this.GITHUB_CONFIG_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  static saveGitHubConfig(config) {
    localStorage.setItem(this.GITHUB_CONFIG_KEY, JSON.stringify(config));
  }

  // ===== 读取 =====
  static getAll() {
    this._ensureLoaded();
    return [...this._cache];
  }
  static getById(id) {
    this._ensureLoaded();
    return this._cache.find(e => e.id === id) || null;
  }

  static search({ query = '', type = 'all', status = 'all' } = {}) {
    this._ensureLoaded();
    let data = this._cache;
    const q = query.trim().toLowerCase();
    if (q) data = data.filter(e => e.title.toLowerCase().includes(q));
    if (type !== 'all') data = data.filter(e => e.type === type);
    if (status !== 'all') data = data.filter(e => e.status === status);
    return data;
  }

  static getStats() {
    this._ensureLoaded();
    return {
      all: this._cache.length,
      watching: this._cache.filter(e => e.status === 'watching').length,
      want_to_watch: this._cache.filter(e => e.status === 'want_to_watch').length,
      completed: this._cache.filter(e => e.status === 'completed').length,
      on_hold: this._cache.filter(e => e.status === 'on_hold').length,
    };
  }

  // ===== 写入 =====
  static add({ title, type = 'anime', status = 'want_to_watch', rating = 0, notes = '' }) {
    this._ensureLoaded();
    const entry = {
      id: this._genId(),
      title: title.trim(),
      type,
      status,
      rating: Math.min(5, Math.max(0, Number(rating) || 0)),
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
    };
    this._cache.unshift(entry);
    this._pushAfterChange();
    return entry;
  }

  static update(id, updates) {
    this._ensureLoaded();
    const idx = this._cache.findIndex(e => e.id === id);
    if (idx === -1) return null;
    const allowed = ['title', 'type', 'status', 'rating', 'notes'];
    for (const key of allowed) {
      if (key in updates) {
        let val = updates[key];
        if (key === 'title') val = String(val).trim();
        if (key === 'rating') val = Math.min(5, Math.max(0, Number(val) || 0));
        if (key === 'notes') val = String(val).trim();
        this._cache[idx][key] = val;
      }
    }
    this._pushAfterChange();
    return this._cache[idx];
  }

  static delete(id) {
    this._ensureLoaded();
    const idx = this._cache.findIndex(e => e.id === id);
    if (idx === -1) return false;
    this._cache.splice(idx, 1);
    this._pushToGithub(true);  // 立即推
    this.scheduleUndoPush();   // 5 分钟后二次确认
    return true;
  }

  static undoAdd(entry) {
    this._ensureLoaded();
    if (!entry || !entry.id) return null;
    if (this._cache.some(e => e.id === entry.id)) return entry;
    this._cache.unshift(entry);
    this.cancelUndoPush();
    this._pushToGithub(true);
    return entry;
  }

  // ===== 导出 / 导入 =====
  static exportData() {
    this._ensureLoaded();
    return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), entries: this._cache }, null, 2);
  }

  static importData(jsonStr) {
    this._ensureLoaded();
    let parsed;
    try { parsed = JSON.parse(jsonStr); } catch { throw new Error('JSON 格式错误'); }
    let entries;
    if (Array.isArray(parsed)) entries = parsed;
    else if (parsed && Array.isArray(parsed.entries)) entries = parsed.entries;
    else throw new Error('数据格式不正确');
    entries = entries.filter(e => e && e.title && e.title.trim());
    if (entries.length === 0) throw new Error('没有找到有效的条目数据');
    entries = entries.map(e => ({
      id: e.id || this._genId(),
      title: e.title.trim(),
      type: ['anime', 'drama', 'movie'].includes(e.type) ? e.type : 'anime',
      status: ['watching', 'want_to_watch', 'completed', 'on_hold'].includes(e.status) ? e.status : 'want_to_watch',
      rating: Math.min(5, Math.max(0, Number(e.rating) || 0)),
      notes: (e.notes || '').trim(),
      createdAt: e.createdAt || new Date().toISOString(),
    }));
    this._cache = entries;
    this._pushToGithub(true);
    return entries.length;
  }

  // ===== 重置 =====
  static reset() {
    this._ensureLoaded();
    this._cache = [];
    this._pushToGithub(true);
  }

  // ===== 云端推送核心 =====
  /** 手动推送（显示结果） */
  static async push() {
    this._ensureLoaded();
    await this._pushToGithub(false);
  }

  static _pushAfterChange() {
    this._pushToGithub(true).catch(() => {});
  }

  static async _pushToGithub(silent) {
    const cfg = this.getGitHubConfig();
    if (!cfg || !cfg.token || !cfg.repo) {
      if (!silent && typeof showToast === 'function') {
        showToast('⚠️ 未配置 GitHub Token，数据仅保留在当前会话', 'error');
      }
      return;
    }

    const [owner, name] = cfg.repo.split('/');
    const content = _utf8ToBase64(
      JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), entries: this._cache }, null, 2)
    );

    // 获取最新 sha
    let sha = cfg._sha;
    if (!sha) {
      try {
        const r = await fetch(
          `https://api.github.com/repos/${owner}/${name}/contents/data.json`,
          { headers: { Authorization: `Bearer ${cfg.token}` } }
        );
        if (r.ok) { const d = await r.json(); sha = d.sha; cfg._sha = sha; this.saveGitHubConfig(cfg); }
      } catch {}
    }

    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const body = { message: '📝 AniList 数据同步', content };
        if (sha) body.sha = sha;

        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(
          `https://api.github.com/repos/${owner}/${name}/contents/data.json`,
          {
            method: 'PUT',
            headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
          }
        );
        clearTimeout(t);

        if (res.ok) {
          const r = await res.json();
          cfg._sha = r.content.sha;
          this.saveGitHubConfig(cfg);
          this._setStatus('connected', '云端');
          if (!silent && typeof showToast === 'function') showToast('☁️ 已同步到云端');
          return;
        }

        // 409 → 重新获取 sha 再试
        if (res.status === 409) {
          try {
            const r = await fetch(
              `https://api.github.com/repos/${owner}/${name}/contents/data.json`,
              { headers: { Authorization: `Bearer ${cfg.token}` } }
            );
            if (r.ok) { const d = await r.json(); sha = d.sha; cfg._sha = sha; this.saveGitHubConfig(cfg); }
          } catch {}
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }

        lastErr = new Error(`GitHub ${res.status}`);
      } catch (e) {
        lastErr = e;
      }
      if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
    }

    this._setStatus('error');
    if (!silent && typeof showToast === 'function') {
      showToast('❌ 同步失败: ' + (lastErr ? lastErr.message : '网络错误'), 'error');
    }
    throw lastErr || new Error('同步失败');
  }

  // ===== 撤销定时器 =====
  static scheduleUndoPush() {
    this.cancelUndoPush();
    this._undoPushTimer = setTimeout(() => {
      this._undoPushTimer = null;
      this._pushToGithub(true).catch(() => {});
    }, 5 * 60 * 1000);
  }

  static cancelUndoPush() {
    if (this._undoPushTimer) { clearTimeout(this._undoPushTimer); this._undoPushTimer = null; }
  }

  // ===== 工具 =====
  static _genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  static _setStatus(s, msg) {
    this._syncStatus = s;
    this._notify();
    if (typeof updateSyncUI === 'function') updateSyncUI(s, msg);
  }

  static onSync(fn) {
    this._syncListeners.push(fn);
    return () => { this._syncListeners = this._syncListeners.filter(f => f !== fn); };
  }
  static _notify() {
    this._syncListeners.forEach(fn => { try { fn(this._syncStatus); } catch {} });
  }
}
