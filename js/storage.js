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
  static _pushQueue = Promise.resolve();
  static _pendingPush = null;

  // ===== 初始化：从 GitHub 拉取最新数据 =====
  static async init(repoOverride) {
    const repo = repoOverride || this._repo;
    if (!repo) {
      this._loaded = true;
      this._setStatus('error', '加载失败');
      throw new Error('未配置云端仓库');
    }
    const [owner, name] = repo.split('/');

    const cfg = this.getGitHubConfig();
    const headers = {};
    if (cfg && cfg.token) headers['Authorization'] = `Bearer ${cfg.token}`;

    // 先尝试 GitHub API（实时）
    // 如果失败则 fallback 到 raw CDN（可能有缓存延迟）
    let data = null;
    let lastError = null;
    try {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${name}/contents/data.json`,
        { headers }
      );
      if (res.ok) {
        const d = await res.json();
        const decoded = (() => {
          const raw = atob(d.content);
          const bytes = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
          return new TextDecoder().decode(bytes);
        })();
        data = JSON.parse(decoded);
        if (cfg && cfg.token) { cfg._sha = d.sha; this.saveGitHubConfig(cfg); }
      } else {
        lastError = new Error(`GitHub API ${res.status}`);
      }
    } catch (error) {
      lastError = error;
      /* API 不通，走 CDN 备选 */
    }

    // API 失败时尝试多个 CDN 备选
    const cdns = [
      `https://raw.githubusercontent.com/${owner}/${name}/main/data.json`,
      `https://cdn.jsdelivr.net/gh/${owner}/${name}@main/data.json`,
    ];
    for (const url of cdns) {
      if (data) break;
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (res.ok) data = await res.json();
        else lastError = new Error(`CDN ${res.status}`);
      } catch (error) {
        lastError = error;
      }
    }

    if (data) {
      const entries = Array.isArray(data) ? data : data.entries;
      if (!Array.isArray(entries)) {
        this._loaded = true;
        this._setStatus('error', '加载失败');
        throw new Error('云端数据格式不正确');
      }
      this._cache = entries;
      this._repo = repo;
      this._setStatus('connected', '云端');
      this._loaded = true;
      return this._cache;
    }

    this._loaded = true;
    this._setStatus('error', '加载失败');
    throw lastError || new Error('无法加载云端数据');
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
    this._cache.push(entry);
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
    this._enqueuePush(false).catch(() => {});  // 立即推，显示结果
    this.scheduleUndoPush();   // 5 分钟后二次确认
    return true;
  }

  static undoAdd(entry) {
    this._ensureLoaded();
    if (!entry || !entry.id) return null;
    if (this._cache.some(e => e.id === entry.id)) return entry;
    this._cache.push(entry);
    this.cancelUndoPush();
    this._enqueuePush(false).catch(() => {});
    return entry;
  }

  // ===== 云端推送核心 =====
  /** 手动推送（显示结果） */
  static async push() {
    this._ensureLoaded();
    await this._enqueuePush(false);
  }

  static _pushAfterChange() {
    // 不静默——push 失败要告知用户，否则刷新数据就丢了
    this._enqueuePush(false).catch(() => {});
  }

  /**
   * 串行化云端写入，并合并尚未开始的连续请求。
   * 网络请求进行期间产生的新修改会进入下一批，确保最终写入最新缓存。
   */
  static _enqueuePush(silent) {
    if (this._pendingPush) {
      // 任一调用要求显示结果时，合并后的请求也不能静默。
      if (!silent) this._pendingPush.silent = false;
      return this._pendingPush.promise;
    }

    const pending = { silent: Boolean(silent), promise: null };
    const run = async () => {
      if (this._pendingPush === pending) this._pendingPush = null;
      return this._pushToGithub(pending.silent);
    };
    const promise = this._pushQueue.then(run, run);
    pending.promise = promise;
    this._pendingPush = pending;
    // 队列自身始终保持可继续执行；错误仍通过本次返回的 promise 交给调用方。
    this._pushQueue = promise.catch(() => {});
    return promise;
  }

  static async _pushToGithub(silent) {
    const cfg = this.getGitHubConfig();
    if (!cfg || !cfg.token || !cfg.repo) {
      // 没有 token 时一定要提示——否则用户不知道数据没保存
      if (typeof showToast === 'function') {
        showToast('⚠️ 未配置 Token，点右上角 GitHub 图标配置', 'error');
      }
      this._setStatus('error');
      return;
    }

    const [owner, name] = cfg.repo.split('/');
    // 每次推送前重新获取最新 sha（不依赖可能过期的缓存）
    async function fetchLatestSha() {
      try {
        const r = await fetch(
          `https://api.github.com/repos/${owner}/${name}/contents/data.json`,
          { headers: { Authorization: `Bearer ${cfg.token}` } }
        );
        if (r.ok) { const d = await r.json(); return d.sha; }
      } catch {}
      return null;
    }

    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // 每次尝试都获取最新 sha，避免 409
        const sha = await fetchLatestSha();
        // 重试时重新读取缓存，避免较早请求用旧快照覆盖后续修改。
        const content = _utf8ToBase64(
          JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), entries: this._cache }, null, 2)
        );
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

        // 409 → sha 已过期，下次循环重新获取
        if (res.status === 409) {
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
      this._enqueuePush(true).catch(() => {});
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
