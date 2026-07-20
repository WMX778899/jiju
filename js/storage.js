/**
 * AnimeDB - localStorage 数据存储层 + GitHub API 云备份
 * 主存：localStorage（即时响应，离线可用）
 * 备份：GitHub API（手动/自动同步到仓库 data.json）
 */

class AnimeDB {
  static STORAGE_KEY = 'anilist_entries';
  static DEFAULT_DATA = [];

  /** 内存缓存 */
  static _cache = null;
  /** 同步状态回调 */
  static _syncListeners = [];
  static _syncStatus = 'local';

  // ===== 初始化 =====
  static init() {
    this._loadCache();
  }

  static _loadCache() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      this._cache = raw ? JSON.parse(raw) : [...this.DEFAULT_DATA];
    } catch {
      this._cache = [...this.DEFAULT_DATA];
    }
  }

  static _saveLocal() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._cache));
  }

  // ===== GitHub 同步配置 =====
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

  static clearGitHubConfig() {
    localStorage.removeItem(this.GITHUB_CONFIG_KEY);
  }

  /** 从 GitHub 拉取数据（合并到本地） */
  static async pullFromGitHub() {
    const cfg = this.getGitHubConfig();
    if (!cfg || !cfg.token || !cfg.repo) throw new Error('未配置 GitHub');

    const [owner, repo] = cfg.repo.split('/');
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/data.json`,
      { headers: { Authorization: `Bearer ${cfg.token}` } }
    );
    if (!res.ok) {
      if (res.status === 404) throw new Error('仓库中还没有 data.json，请先上传');
      throw new Error(`GitHub API 错误: ${res.status}`);
    }

    const data = await res.json();
    const content = atob(data.content);
    const remote = JSON.parse(content);
    const entries = Array.isArray(remote) ? remote : (remote.entries || []);

    // 合并到本地缓存（去重）
    if (entries.length > 0) {
      const idMap = new Map();
      this._cache.forEach(e => idMap.set(e.id, e));
      let changed = false;
      for (const entry of entries) {
        if (entry && entry.id && !idMap.has(entry.id)) {
          this._cache.unshift(entry);
          changed = true;
        }
      }
      if (changed) {
        this._saveLocal();
        this._notify();
      }
    }

    return { count: entries.length, sha: data.sha };
  }

  /** 上传数据到 GitHub */
  static async pushToGitHub() {
    const cfg = this.getGitHubConfig();
    if (!cfg || !cfg.token || !cfg.repo) throw new Error('未配置 GitHub');

    const [owner, repo] = cfg.repo.split('/');
    const content = btoa(unescape(encodeURIComponent(
      JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), entries: this._cache }, null, 2)
    )));

    // 先尝试获取已有文件的 sha
    let sha = cfg._sha;
    if (!sha) {
      try {
        const check = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/data.json`,
          { headers: { Authorization: `Bearer ${cfg.token}` } }
        );
        if (check.ok) {
          const existing = await check.json();
          sha = existing.sha;
          cfg._sha = sha;
          this.saveGitHubConfig(cfg);
        }
      } catch { /* 文件不存在，走新建 */ }
    }

    const body = {
      message: `📝 AniList 数据同步 ${new Date().toLocaleString('zh-CN')}`,
      content,
    };
    if (sha) body.sha = sha;

    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/data.json`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) throw new Error(`GitHub API 错误: ${res.status}`);

    const result = await res.json();
    // 保存 sha 以便下次增量更新
    cfg._sha = result.content.sha;
    this.saveGitHubConfig(cfg);

    return { sha: result.content.sha };
  }

  // ===== 同步状态 =====
  static getSyncStatus() { return this._syncStatus; }
  static setSyncStatus(s) { this._syncStatus = s; this._notify(); }

  static onSync(fn) {
    this._syncListeners.push(fn);
    return () => { this._syncListeners = this._syncListeners.filter(f => f !== fn); };
  }
  static _notify() {
    this._syncListeners.forEach(fn => { try { fn(this._syncStatus); } catch {} });
  }

  // ===== 生成短 ID =====
  static _genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ===== 读取 =====
  static getAll() { return [...this._cache]; }
  static getById(id) { return this._cache.find(e => e.id === id) || null; }

  static search({ query = '', type = 'all', status = 'all' } = {}) {
    let data = this._cache;
    const q = query.trim().toLowerCase();
    if (q) data = data.filter(e => e.title.toLowerCase().includes(q));
    if (type !== 'all') data = data.filter(e => e.type === type);
    if (status !== 'all') data = data.filter(e => e.status === status);
    return data;
  }

  static getStats() {
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
    this._saveLocal();
    return entry;
  }

  static update(id, updates) {
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
    this._saveLocal();
    return this._cache[idx];
  }

  static delete(id) {
    const idx = this._cache.findIndex(e => e.id === id);
    if (idx === -1) return false;
    this._cache.splice(idx, 1);
    this._saveLocal();
    return true;
  }

  static undoAdd(entry) {
    if (!entry || !entry.id) return null;
    if (this._cache.some(e => e.id === entry.id)) return entry;
    this._cache.unshift(entry);
    this._saveLocal();
    return entry;
  }

  // ===== 导出 / 导入 =====
  static exportData() {
    return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), entries: this._cache }, null, 2);
  }

  static importData(jsonStr) {
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
    this._saveLocal();
    return entries.length;
  }

  static reset() {
    this._cache = [];
    localStorage.removeItem(this.STORAGE_KEY);
  }
}
