/**
 * AnimeDB - localStorage 数据存储层 + GitHub API 云备份
 * 主存：localStorage（即时响应，离线可用）
 * 备份：GitHub API（手动/自动同步到仓库 data.json）
 */

/** UTF-8 安全的 base64 编码（支持中文） */
function _utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function _base64ToUtf8(base64) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

class AnimeDB {
  static STORAGE_KEY = 'anilist_entries';
  static DEFAULT_DATA = [];

  /** 内存缓存 */
  static _cache = null;
  /** 同步状态回调 */
  static _syncListeners = [];
  static _syncStatus = 'local';
  /** 撤销期后的二次上传定时器 */
  static _undoPushTimer = null;

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

  /** 从 GitHub 拉取数据（通过 raw CDN，全球加速、无需 token） */
  static async pullFromGitHub(repoOverride) {
    const cfg = this.getGitHubConfig();
    const repo = repoOverride || (cfg ? cfg.repo : null);
    if (!repo) throw new Error('未配置仓库');

    const [owner, name] = repo.split('/');
    // 使用 raw.githubusercontent.com CDN 读取，比 API 更快更稳定
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${name}/main/data.json`;
    const res = await fetch(rawUrl);
    if (!res.ok) {
      if (res.status === 404) throw new Error('仓库中还没有 data.json，请先上传');
      throw new Error(`读取失败: ${res.status}`);
    }

    const remote = await res.json();
    const entries = Array.isArray(remote) ? remote : (remote.entries || []);

    // 合并模式：云端为基准，保留本地有但云端没有的条目
    // 这样即使上传失败，本地新增的数据也不会被覆盖丢失
    if (entries.length > 0) {
      const cloudIds = new Set(entries.map(e => e.id));
      const merged = [...entries];
      for (const local of this._cache) {
        if (!cloudIds.has(local.id)) {
          merged.push(local);
        }
      }
      this._cache = merged;
      this._saveLocal();
      this._notify();
    }

    return { count: entries.length };
  }

  /** 上传数据到 GitHub（自动重试 + CORS 代理回退） */
  static async pushToGitHub() {
    const cfg = this.getGitHubConfig();
    if (!cfg || !cfg.token || !cfg.repo) throw new Error('未配置 GitHub');

    const [owner, repo] = cfg.repo.split('/');
    const content = _utf8ToBase64(
      JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), entries: this._cache }, null, 2)
    );

    /** 获取 sha */
    const ghFetch = async (path, opts) => {
      const url = `https://api.github.com/repos/${owner}/${repo}/${path}`;
      try { return await fetch(url, opts); } catch { return null; }
    };
    /** 通过 CORS 代理获取 sha（直连失败时回退） */
    const proxyFetch = async (path, opts) => {
      const url = `https://api.github.com/repos/${owner}/${repo}/${path}`;
      try {
        return await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`, opts);
      } catch { return null; }
    };

    /** 获取最新 sha（直连 → 代理回退） */
    const fetchSha = async () => {
      const opts = { headers: { Authorization: `Bearer ${cfg.token}` } };
      let r = await ghFetch('contents/data.json', opts);
      if (!r || !r.ok) r = await proxyFetch('contents/data.json', opts);
      if (r && r.ok) {
        try {
          const d = await r.json();
          cfg._sha = d.sha;
          this.saveGitHubConfig(cfg);
          return d.sha;
        } catch {}
      }
      return null;
    };

    /** 发起 PUT（直连 → 代理回退） */
    const sendPut = async (body, signal) => {
      const opts = {
        method: 'PUT',
        headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
        body, signal,
      };
      let r = await ghFetch('contents/data.json', opts);
      if (!r || (!r.ok && r.status === 0)) r = await proxyFetch('contents/data.json', opts);
      return r;
    };

    // 先探查文件是否存在（尝试获取 sha）
    const sha = await fetchSha();

    // 重试最多 5 次
    let lastErr;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        // 每次重试重新获取最新 sha（第一次已获取过，后续重试时重新获取）
        const currentSha = attempt === 0 ? sha : await fetchSha();

        const body = {
          message: `📝 AniList 数据同步 ${new Date().toLocaleString('zh-CN')}`,
          content,
        };
        if (currentSha) body.sha = currentSha;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await sendPut(JSON.stringify(body), controller.signal);
        clearTimeout(timeout);

        if (!res) {
          lastErr = new Error('无法连接到 GitHub，请检查网络');
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }

        if (res.ok) {
          const result = await res.json();
          cfg._sha = result.content.sha;
          this.saveGitHubConfig(cfg);
          return { sha: result.content.sha };
        }

        if (res.status === 409) {
          try {
            const errBody = await res.json();
            lastErr = new Error('冲突: ' + (errBody.message || 'sha 已过时'));
          } catch {}
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }

        lastErr = new Error(`GitHub API 错误: ${res.status}`);
      } catch (e) {
        lastErr = e;
        if (e.name === 'AbortError') lastErr = new Error('连接超时，请检查网络');
      }
      if (attempt < 4) await new Promise(r => setTimeout(r, 1000));
    }
    throw lastErr;
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

  // ===== 自动上传（每次修改后触发）=====

  /**
   * 立即上传到 GitHub（每次操作都触发，不做防抖）
   * 必须先通过 GitHub 弹窗配置 token（仅需一次，保存到 localStorage）
   */
  static autoPush() {
    const cfg = this.getGitHubConfig();
    if (!cfg || !cfg.token || !cfg.repo) return;

    this.pushToGitHub()
      .then(() => {
        if (typeof updateSyncUI === 'function') updateSyncUI('connected', '云端');
        if (typeof showToast === 'function') showToast('☁️ 已同步到云端');
      })
      .catch((e) => {
        if (typeof showToast === 'function') showToast('❌ 同步失败: ' + (e.message || '网络错误，数据已保存到本地'), 'error');
        if (typeof updateSyncUI === 'function') updateSyncUI('error');
      });
  }

  /**
   * 安排 5 分钟后的二次上传（删除撤销期结束后的确认上传）
   */
  static scheduleUndoPush() {
    this.cancelUndoPush();
    this._undoPushTimer = setTimeout(async () => {
      this._undoPushTimer = null;
      try {
        await this.pushToGitHub();
        if (typeof updateSyncUI === 'function') updateSyncUI('connected', '云端');
      } catch (e) {
        if (typeof updateSyncUI === 'function') updateSyncUI('error');
      }
    }, 5 * 60 * 1000);
  }

  static cancelUndoPush() {
    if (this._undoPushTimer) {
      clearTimeout(this._undoPushTimer);
      this._undoPushTimer = null;
    }
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
    this.autoPush();
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
    this.autoPush();
    return this._cache[idx];
  }

  static delete(id) {
    const idx = this._cache.findIndex(e => e.id === id);
    if (idx === -1) return false;
    this._cache.splice(idx, 1);
    this._saveLocal();
    this.autoPush();           // 立即上传（云端删除）
    this.scheduleUndoPush();   // 5 分钟后二次上传（确认删除）
    return true;
  }

  static undoAdd(entry) {
    if (!entry || !entry.id) return null;
    if (this._cache.some(e => e.id === entry.id)) return entry;
    this._cache.unshift(entry);
    this._saveLocal();
    this.cancelUndoPush();  // 取消 5 分钟后的二次上传
    this.autoPush();         // 立即上传恢复后的数据
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
