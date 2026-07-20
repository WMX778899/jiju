/**
 * AnimeDB - Cloudflare Worker 云同步数据存储层
 * 数据优先存本地（内存+localStorage），后台同步到 Cloudflare KV
 * 离线下完全可用，联网后自动同步
 */

const SYNC_STATUS = {
  LOCAL: 'local',
  SYNCING: 'syncing',
  CONNECTED: 'connected',
  ERROR: 'error',
};

class AnimeDB {
  static STORAGE_KEY = 'anilist_entries';
  static DEFAULT_DATA = [];

  /** 内存缓存（同步读写） */
  static _cache = null;
  /** Worker API 地址 */
  static _apiUrl = '';
  /** 同步状态回调 */
  static _syncListeners = [];
  /** 当前状态 */
  static _syncStatus = SYNC_STATUS.LOCAL;
  /** 是否正在同步中（防重入） */
  static _syncing = false;

  // ===== 初始化 =====
  static async init(apiUrl) {
    this._apiUrl = apiUrl;
    this._loadCache();
    this._setStatus(SYNC_STATUS.SYNCING);

    // 从云端拉取数据
    try {
      const res = await fetch(`${apiUrl}/entries`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const cloudData = await res.json();
      if (cloudData && typeof cloudData === 'object') {
        this._mergeEntries(Object.values(cloudData));
      }
      this._setStatus(SYNC_STATUS.CONNECTED);
    } catch (e) {
      console.warn('云端同步失败，使用本地数据:', e.message);
      this._setStatus(SYNC_STATUS.ERROR);
    }
  }

  /** 合并云端数据到本地 */
  static _mergeEntries(entries) {
    const idMap = new Map();
    this._cache.forEach(e => idMap.set(e.id, e));
    let changed = false;
    for (const entry of entries) {
      if (!entry || !entry.id) continue;
      if (!idMap.has(entry.id)) {
        this._cache.unshift(entry);
        changed = true;
      }
    }
    if (changed) {
      this._saveLocal();
      this._notify();
    }
  }

  /** 从 localStorage 加载到缓存 */
  static _loadCache() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      this._cache = raw ? JSON.parse(raw) : [...this.DEFAULT_DATA];
    } catch {
      this._cache = [...this.DEFAULT_DATA];
    }
  }

  /** 缓存写回 localStorage */
  static _saveLocal() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._cache));
  }

  // ===== 云端写入（异步） =====
  static async _cloudAdd(entry) {
    try {
      await fetch(`${this._apiUrl}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
    } catch (e) {
      console.warn('云端添加失败:', e.message);
    }
  }

  static async _cloudUpdate(id, entry) {
    try {
      await fetch(`${this._apiUrl}/entries/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
    } catch (e) {
      console.warn('云端更新失败:', e.message);
    }
  }

  static async _cloudDelete(id) {
    try {
      await fetch(`${this._apiUrl}/entries/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('云端删除失败:', e.message);
    }
  }

  static async _cloudReplace(entries) {
    try {
      const obj = {};
      entries.forEach(e => { obj[e.id] = e; });
      await fetch(`${this._apiUrl}/entries`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(obj),
      });
    } catch (e) {
      console.warn('云端全量替换失败:', e.message);
    }
  }

  static async _cloudClear() {
    try {
      await fetch(`${this._apiUrl}/entries`, { method: 'DELETE' });
    } catch (e) {
      console.warn('云端清空失败:', e.message);
    }
  }

  // ===== 同步状态 =====
  static getSyncStatus() { return this._syncStatus; }

  static onSync(fn) {
    this._syncListeners.push(fn);
    return () => {
      this._syncListeners = this._syncListeners.filter(f => f !== fn);
    };
  }

  static _setStatus(status) {
    this._syncStatus = status;
    this._notify();
  }

  static _notify() {
    this._syncListeners.forEach(fn => {
      try { fn(this._syncStatus); } catch (e) { /* ignore */ }
    });
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
    this._cloudAdd(entry);
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
    this._cloudUpdate(id, this._cache[idx]);
    return this._cache[idx];
  }

  static delete(id) {
    const idx = this._cache.findIndex(e => e.id === id);
    if (idx === -1) return false;
    this._cache.splice(idx, 1);
    this._saveLocal();
    this._cloudDelete(id);
    return true;
  }

  // ===== 撤销删除 =====
  static undoAdd(entry) {
    if (!entry || !entry.id) return null;
    if (this._cache.some(e => e.id === entry.id)) return entry;
    this._cache.unshift(entry);
    this._saveLocal();
    this._cloudAdd(entry);
    return entry;
  }

  // ===== 导出 =====
  static exportData() {
    return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), entries: this._cache }, null, 2);
  }

  // ===== 导入 =====
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
    this._cloudReplace(entries);
    return entries.length;
  }

  // ===== 重置 =====
  static reset() {
    this._cache = [];
    localStorage.removeItem(this.STORAGE_KEY);
    this._cloudClear();
  }
}
