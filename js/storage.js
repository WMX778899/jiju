/**
 * AnimeDB - 支持 Firebase 云同步的数据存储层
 * 数据优先存内存缓存 → localStorage 备份 → Firebase 云端
 * 跨设备实时同步，离线不丢数据
 */
class AnimeDB {
  static STORAGE_KEY = 'anilist_entries';
  static DEFAULT_DATA = [];

  /** 内存缓存，读写均走这里（同步） */
  static _cache = null;
  /** Firebase 数据库引用 */
  static _dbRef = null;
  /** 同步状态变化回调 */
  static _syncListeners = [];
  /** 当前同步状态 */
  static _syncStatus = 'local'; // 'local' | 'syncing' | 'connected' | 'error'

  // ===== 初始化 =====
  static async init(config) {
    // 1. 从 localStorage 加载（瞬间完成）
    this._loadCache();

    // 2. 初始化 Firebase
    try {
      const app = firebase.initializeApp(config);
      this._dbRef = firebase.database().ref('entries');
      this._setStatus('syncing');

      // 3. 一次性加载远端数据合并
      const snapshot = await this._dbRef.once('value');
      const fbData = snapshot.val();
      if (fbData) {
        this._mergeEntries(Object.values(fbData));
      }

      this._setStatus('connected');

      // 4. 监听实时变更（来自其他设备/浏览器）
      this._dbRef.on('value', (snap) => {
        const data = snap.val();
        if (!data) return;
        const fbEntries = Object.values(data);
        const sortedLocal = [...this._cache].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
        const sortedFb = fbEntries.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
        const localStr = JSON.stringify(sortedLocal);
        const fbStr = JSON.stringify(sortedFb);
        if (localStr !== fbStr) {
          this._cache = fbEntries;
          this._saveLocal();
          this._notify();
        }
      });
    } catch (e) {
      console.warn('Firebase 初始化失败，仅使用本地数据:', e);
      this._setStatus('error');
    }
  }

  /** 合并远端数据到本地缓存（去重） */
  static _mergeEntries(entries) {
    const idMap = new Map();
    this._cache.forEach(e => idMap.set(e.id, e));
    let changed = false;
    for (const entry of entries) {
      const existing = idMap.get(entry.id);
      if (!existing) {
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

  /** 单条数据同步到 Firebase */
  static _syncEntry(entry) {
    if (this._dbRef) {
      this._dbRef.child(entry.id).set(entry)
        .catch(e => console.warn('Firebase 同步失败:', e));
    }
  }

  /** 删除 Firebase 上的条目 */
  static _removeFromFirebase(id) {
    if (this._dbRef) {
      this._dbRef.child(id).remove()
        .catch(e => console.warn('Firebase 删除失败:', e));
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
  static getAll() {
    return [...this._cache];
  }

  static getById(id) {
    return this._cache.find(e => e.id === id) || null;
  }

  static search({ query = '', type = 'all', status = 'all' } = {}) {
    let data = this._cache;
    const q = query.trim().toLowerCase();
    if (q) data = data.filter(e => e.title.toLowerCase().includes(q));
    if (type !== 'all') data = data.filter(e => e.type === type);
    if (status !== 'all') data = data.filter(e => e.status === status);
    return data;
  }

  static getStats() {
    const data = this._cache;
    return {
      all: data.length,
      watching: data.filter(e => e.status === 'watching').length,
      want_to_watch: data.filter(e => e.status === 'want_to_watch').length,
      completed: data.filter(e => e.status === 'completed').length,
      on_hold: data.filter(e => e.status === 'on_hold').length,
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
    this._syncEntry(entry);
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
    this._syncEntry(this._cache[idx]);
    return this._cache[idx];
  }

  static delete(id) {
    const idx = this._cache.findIndex(e => e.id === id);
    if (idx === -1) return false;
    this._cache.splice(idx, 1);
    this._saveLocal();
    this._removeFromFirebase(id);
    return true;
  }

  // ===== 撤销删除：用原始 ID 恢复条目 =====
  static undoAdd(entry) {
    if (!entry || !entry.id) return null;
    const exists = this._cache.some(e => e.id === entry.id);
    if (exists) return entry;
    this._cache.unshift(entry);
    this._saveLocal();
    this._syncEntry(entry);
    return entry;
  }

  // ===== 导出 =====
  static exportData() {
    return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), entries: this._cache }, null, 2);
  }

  // ===== 导入（同时写入云端）=====
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
    // 全量同步到 Firebase
    if (this._dbRef) {
      const obj = {};
      entries.forEach(e => { obj[e.id] = e; });
      this._dbRef.set(obj).catch(e => console.warn('Firebase 导入同步失败:', e));
    }
    return entries.length;
  }

  // ===== 重置 =====
  static reset() {
    this._cache = [];
    localStorage.removeItem(this.STORAGE_KEY);
    if (this._dbRef) {
      this._dbRef.set(null).catch(e => console.warn('Firebase 重置失败:', e));
    }
  }
}
