/**
 * AnimeDB - localStorage 数据存储层
 * 支持 CRUD、搜索、筛选、排序、导入导出
 */
class AnimeDB {
  static STORAGE_KEY = 'anilist_entries';
  static DEFAULT_DATA = [];

  // ===== 获取所有数据 =====
  static getAll() {
    try {
      const raw = localStorage.getItem(AnimeDB.STORAGE_KEY);
      if (!raw) return [...AnimeDB.DEFAULT_DATA];
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [...AnimeDB.DEFAULT_DATA];
    } catch {
      return [...AnimeDB.DEFAULT_DATA];
    }
  }

  // ===== 保存全部数据 =====
  static _save(data) {
    localStorage.setItem(AnimeDB.STORAGE_KEY, JSON.stringify(data));
  }

  // ===== 生成短 ID =====
  static _genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ===== 添加条目 =====
  static add({ title, type = 'anime', status = 'want_to_watch', rating = 0, notes = '' }) {
    const data = AnimeDB.getAll();
    const entry = {
      id: AnimeDB._genId(),
      title: title.trim(),
      type,
      status,
      rating: Math.min(5, Math.max(0, Number(rating) || 0)),
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
    };
    data.unshift(entry);
    AnimeDB._save(data);
    return entry;
  }

  // ===== 撤销删除：用原始 ID 恢复条目 =====
  static undoAdd(entry) {
    if (!entry || !entry.id) return null;
    const data = AnimeDB.getAll();
    // 检查是否已存在相同 ID（避免重复恢复）
    const exists = data.some(e => e.id === entry.id);
    if (exists) return entry;
    data.unshift(entry);
    AnimeDB._save(data);
    return entry;
  }

  // ===== 根据 ID 获取 =====
  static getById(id) {
    return AnimeDB.getAll().find(e => e.id === id) || null;
  }

  // ===== 更新条目 =====
  static update(id, updates) {
    const data = AnimeDB.getAll();
    const idx = data.findIndex(e => e.id === id);
    if (idx === -1) return null;
    const allowed = ['title', 'type', 'status', 'rating', 'notes'];
    for (const key of allowed) {
      if (key in updates) {
        let val = updates[key];
        if (key === 'title') val = String(val).trim();
        if (key === 'rating') val = Math.min(5, Math.max(0, Number(val) || 0));
        if (key === 'notes') val = String(val).trim();
        data[idx][key] = val;
      }
    }
    AnimeDB._save(data);
    return data[idx];
  }

  // ===== 删除条目 =====
  static delete(id) {
    const data = AnimeDB.getAll();
    const idx = data.findIndex(e => e.id === id);
    if (idx === -1) return false;
    data.splice(idx, 1);
    AnimeDB._save(data);
    return true;
  }

  // ===== 搜索与筛选 =====
  static search({ query = '', type = 'all', status = 'all' } = {}) {
    let data = AnimeDB.getAll();
    const q = query.trim().toLowerCase();

    if (q) {
      data = data.filter(e => e.title.toLowerCase().includes(q));
    }
    if (type !== 'all') {
      data = data.filter(e => e.type === type);
    }
    if (status !== 'all') {
      data = data.filter(e => e.status === status);
    }

    return data;
  }

  // ===== 获取统计 =====
  static getStats() {
    const data = AnimeDB.getAll();
    return {
      all: data.length,
      watching: data.filter(e => e.status === 'watching').length,
      want_to_watch: data.filter(e => e.status === 'want_to_watch').length,
      completed: data.filter(e => e.status === 'completed').length,
      on_hold: data.filter(e => e.status === 'on_hold').length,
    };
  }

  // ===== 导出：JSON 字符串 =====
  static exportData() {
    const data = AnimeDB.getAll();
    return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), entries: data }, null, 2);
  }

  // ===== 导入：解析 JSON 并覆盖 =====
  static importData(jsonStr) {
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new Error('JSON 格式错误，无法解析');
    }

    let entries;
    if (Array.isArray(parsed)) {
      // 直接数组格式兼容
      entries = parsed;
    } else if (parsed && Array.isArray(parsed.entries)) {
      entries = parsed.entries;
    } else {
      throw new Error('数据格式不正确，请检查 JSON 结构');
    }

    // 校验每条记录
    entries = entries.filter(e => e && e.title && e.title.trim());
    if (entries.length === 0) {
      throw new Error('没有找到有效的条目数据');
    }

    // 补齐缺失字段
    entries = entries.map(e => ({
      id: e.id || AnimeDB._genId(),
      title: e.title.trim(),
      type: ['anime', 'drama', 'movie'].includes(e.type) ? e.type : 'anime',
      status: ['watching', 'want_to_watch', 'completed', 'on_hold'].includes(e.status) ? e.status : 'want_to_watch',
      rating: Math.min(5, Math.max(0, Number(e.rating) || 0)),
      notes: (e.notes || '').trim(),
      createdAt: e.createdAt || new Date().toISOString(),
    }));

    AnimeDB._save(entries);
    return entries.length;
  }

  // ===== 重置 =====
  static reset() {
    localStorage.removeItem(AnimeDB.STORAGE_KEY);
  }
}
