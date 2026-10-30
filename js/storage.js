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
  static _pushQueue = Promise.resolve();
  static _pendingPush = null;
  /** 数据变更回调（回滚后通知界面刷新） */
  static _changeListeners = [];

  // ===== 初始化：从 GitHub 拉取最新数据 =====
  /**
   * @param {string} repoOverride 仓库 owner/name
   * @param {{force?: boolean}} options force=true 时跳过首屏缓存，必须等云端返回
   *   （「从云端下载」按钮用，避免拿缓存冒充云端数据）
   */
  static async init(repoOverride, { force = false } = {}) {
    const repo = repoOverride || this._repo;
    if (!repo) {
      this._loaded = true;
      this._setStatus('error', '加载失败');
      throw new Error('未配置云端仓库');
    }

    // 首屏优先：上次成功加载的快照先顶上，云端在后台校正（force 时跳过）
    if (!force) {
      const cached = this._readCache(repo);
      if (cached) {
        this._cache = cached;
        this._repo = repo;
        this._loaded = true;
        this._setStatus('syncing');
        this._refresh(repo);
        return this._cache;
      }
    }

    try {
      const entries = await this._fetchCloud(repo);
      this._cache = entries;
      this._repo = repo;
      this._loaded = true;
      this._writeCache(entries);
      this._setStatus('connected', '云端');
      return this._cache;
    } catch (error) {
      this._loaded = true;
      this._setStatus('error', '加载失败');
      throw error;
    }
  }

  /** 后台刷新：拿到云端数据后整体替换并通知界面重绘；失败时保留缓存内容 */
  static _refresh(repo) {
    return this._fetchCloud(repo)
      .then((entries) => {
        this._cache = entries;
        this._writeCache(entries);
        this._setStatus('connected', '云端');
        this._emitChange();
      })
      .catch(() => this._setStatus('error', '刷新失败'));
  }

  /**
   * 三个数据源并发拉取，谁先成功用谁：
   * GitHub API（实时，配了 Token 才可靠）/ raw CDN / jsDelivr。
   * 旧实现是串行 fallback，前一个不通时整页要等到超时才继续。
   * 若页面 <head> 已预取（同仓库），直接复用那三个请求，省掉一段等待；
   * 预取只供第一次加载使用，见 _takePrefetch。
   */
  static _fetchCloud(repo) {
    const [owner, name] = repo.split('/');
    const cfg = this.getGitHubConfig();
    const headers = {};
    if (cfg && cfg.token) headers['Authorization'] = `Bearer ${cfg.token}`;

    const pre = this._takePrefetch(repo);

    const api = pre
      ? this._withDeadline(pre.api, 10000)
      : this._fetchWithTimeout(`https://api.github.com/repos/${owner}/${name}/contents/data.json`, { headers }, 10000);
    const raw = pre
      ? this._withDeadline(pre.raw, 6000)
      : this._fetchWithTimeout(`https://raw.githubusercontent.com/${owner}/${name}/main/data.json`, { cache: 'no-cache' }, 6000);
    const jsd = pre
      ? this._withDeadline(pre.jsdelivr, 6000)
      : this._fetchWithTimeout(`https://cdn.jsdelivr.net/gh/${owner}/${name}@main/data.json`, { cache: 'no-cache' }, 6000);

    return this._race([
      () => this._loadFromApi(api, cfg),
      () => this._loadFromJson(raw),
      () => this._loadFromJson(jsd),
    ]);
  }

  /**
   * 预取只能被消费一次：Response 的 body 读完就废了。
   * 取走即清空，第二次加载（如「从云端下载」）会重新发请求，
   * 否则每个源都复用同一批已读的 Response，报 body stream already read。
   */
  static _takePrefetch(repo) {
    if (typeof window === 'undefined') return null;
    const pre = window.__prefetch;
    if (!pre || pre.repo !== repo) return null;
    window.__prefetch = null;
    return pre;
  }

  /** 并发竞速：第一个成功的结果胜出，全部失败才报错 */
  static _race(sources) {
    return new Promise((resolve, reject) => {
      let failed = 0;
      let lastError = null;
      sources.forEach((load) => {
        Promise.resolve()
          .then(load)
          .then(resolve)
          .catch((error) => {
            lastError = error;
            failed += 1;
            if (failed === sources.length) reject(lastError || new Error('无法加载云端数据'));
          });
      });
    });
  }

  static async _loadFromApi(response, cfg) {
    const res = await response;
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const d = await res.json();
    const raw = atob(d.content);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (cfg && cfg.token) { cfg._sha = d.sha; this.saveGitHubConfig(cfg); }
    return this._normalize(data);
  }

  static async _loadFromJson(response) {
    const res = await response;
    if (!res.ok) throw new Error(`CDN ${res.status}`);
    return this._normalize(await res.json());
  }

  static _normalize(data) {
    const entries = Array.isArray(data) ? data : data && data.entries;
    if (!Array.isArray(entries)) throw new Error('云端数据格式不正确');
    return entries;
  }

  static _fetchWithTimeout(url, options = {}, ms = 6000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { ...options, signal: controller.signal })
      .finally(() => clearTimeout(timer));
  }

  /** 给已经发出的请求（如 <head> 里的预取）补一个超时上限 */
  static _withDeadline(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('请求超时')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  // ===== 首屏缓存（只用于加速首屏，云端始终为准）=====
  static CACHE_KEY = 'anilist_data_cache_v1';
  static CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

  static _readCache(repo) {
    try {
      const raw = localStorage.getItem(this.CACHE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || obj.repo !== repo || !Array.isArray(obj.entries)) return null;
      if (obj.savedAt && Date.now() - obj.savedAt > this.CACHE_TTL) return null;
      return obj.entries;
    } catch { return null; }
  }

  static _writeCache(entries) {
    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify({
        repo: this._repo,
        savedAt: Date.now(),
        entries,
      }));
    } catch { /* 隐私模式 / 配额不足：忽略，不影响主流程 */ }
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
  static add({ title, type = 'anime', status = 'want_to_watch', rating = 0 }) {
    this._ensureLoaded();
    const normalizedTitle = String(title ?? '').trim();
    this._assertUniqueTitle(normalizedTitle, type);
    const entry = {
      id: this._genId(),
      title: normalizedTitle,
      type,
      status,
      rating: Math.min(5, Math.max(0, Number(rating) || 0)),
      createdAt: new Date().toISOString(),
    };
    this._cache.push(entry);
    this._writeCache(this._cache);
    this._pushWithRollback(() => {
      const i = this._cache.indexOf(entry);
      if (i !== -1) this._cache.splice(i, 1);
    });
    return entry;
  }

  static update(id, updates) {
    this._ensureLoaded();
    const idx = this._cache.findIndex(e => e.id === id);
    if (idx === -1) return null;
    const entry = this._cache[idx];
    const snapshot = { ...entry };
    const nextTitle = 'title' in updates ? String(updates.title ?? '').trim() : entry.title;
    const nextType = 'type' in updates ? updates.type : entry.type;
    this._assertUniqueTitle(nextTitle, nextType, id);
    const allowed = ['title', 'type', 'status', 'rating'];
    for (const key of allowed) {
      if (key in updates) {
        let val = updates[key];
        if (key === 'title') val = String(val ?? '').trim();
        if (key === 'rating') val = Math.min(5, Math.max(0, Number(val) || 0));
        entry[key] = val;
      }
    }
    this._writeCache(this._cache);
    this._pushWithRollback(() => {
      const cur = this._cache.findIndex(e => e.id === id);
      if (cur !== -1) this._cache[cur] = snapshot;
    });
    return entry;
  }

  static delete(id) {
    this._ensureLoaded();
    const idx = this._cache.findIndex(e => e.id === id);
    if (idx === -1) return false;
    const [removed] = this._cache.splice(idx, 1);
    this._writeCache(this._cache);
    this._pushWithRollback(() => {
      this._cache.splice(Math.min(idx, this._cache.length), 0, removed);
    });
    return true;
  }

  static undoAdd(entry) {
    this._ensureLoaded();
    if (!entry || !entry.id) return null;
    if (this._cache.some(e => e.id === entry.id)) return entry;
    this._cache.push(entry);
    this._writeCache(this._cache);
    this._pushWithRollback(() => {
      const i = this._cache.indexOf(entry);
      if (i !== -1) this._cache.splice(i, 1);
    });
    return entry;
  }

  // ===== 云端推送核心 =====
  /** 手动推送（显示结果） */
  static async push() {
    this._ensureLoaded();
    await this._enqueuePush(false);
  }

  /**
   * 乐观写入：先改本地缓存，再推送云端。
   * 推送失败时执行回滚并通知界面刷新，保证内存状态与服务器一致，避免刷新后数据丢失。
   */
  static _pushWithRollback(rollback) {
    this._enqueuePush(false).catch(() => {
      rollback();
      this._writeCache(this._cache);
      this._emitChange();
    });
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
      const err = new Error('未配置 GitHub Token');
      err.code = 'NO_TOKEN';
      throw err;
    }

    const [owner, name] = cfg.repo.split('/');
    function githubError(status) {
      const message = status === 401
        ? 'GitHub 401：Token 无效或已过期，请重新生成并保存 Token'
        : status === 403
          ? 'GitHub 403：Token 没有仓库写入权限，请检查 Contents 权限'
          : `GitHub ${status}`;
      const error = new Error(message);
      error.code = status === 401 ? 'GITHUB_AUTH' : 'GITHUB_API';
      error.status = status;
      return error;
    }

    // 每次推送前重新获取最新 sha（不依赖可能过期的缓存）
    async function fetchLatestSha() {
      try {
        const r = await fetch(
          `https://api.github.com/repos/${owner}/${name}/contents/data.json`,
          { headers: { Authorization: `Bearer ${cfg.token}` } }
        );
        if (r.status === 401) throw githubError(401);
        if (r.ok) { const d = await r.json(); return d.sha; }
      } catch (error) {
        if (error && error.code === 'GITHUB_AUTH') throw error;
      }
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

        lastErr = githubError(res.status);
        if (res.status === 401 || res.status === 403) break;
      } catch (e) {
        lastErr = e;
        if (e && e.code === 'GITHUB_AUTH') break;
      }
      if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
    }

    this._setStatus('error');
    if (!silent && typeof showToast === 'function') {
      showToast('❌ 同步失败: ' + (lastErr ? lastErr.message : '网络错误'), 'error');
    }
    throw lastErr || new Error('同步失败');
  }

  // ===== 工具 =====
  static _assertUniqueTitle(title, type, excludedId = null) {
    const comparableTitle = String(title).replace(/\s/g, '');
    const duplicate = this._cache.some(entry => (
      entry.id !== excludedId &&
      entry.type === type &&
      String(entry.title).replace(/\s/g, '') === comparableTitle
    ));
    if (duplicate) {
      const error = new Error('该模块中已存在完全相同的剧名');
      error.code = 'DUPLICATE_TITLE';
      throw error;
    }
  }

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

  static onChange(fn) {
    this._changeListeners.push(fn);
    return () => { this._changeListeners = this._changeListeners.filter(f => f !== fn); };
  }
  static _emitChange() {
    this._changeListeners.forEach(fn => { try { fn(); } catch {} });
  }
}
