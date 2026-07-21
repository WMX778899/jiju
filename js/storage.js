/**
 * AnimeDB - 绾簯绔瓨鍌ㄥ眰
 * 鏁版嵁鍏ㄩ儴鍦?GitHub 浠撳簱 data.json锛屼笉瀛?localStorage
 * 鎵€鏈夎澶囩湅鍒板悓涓€浠芥暟鎹?
 */

function _utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

class AnimeDB {
  /** 鍐呭瓨缂撳瓨锛堜竴娆′細璇濇湁鏁堬級 */
  static _cache = [];
  static _loaded = false;
  static _repo = 'WMX778899/jiju';

  /** localStorage 澶囦唤閿悕 */
  static BACKUP_KEY = 'anilist_backup';

  /** 鍚屾鐘舵€佸洖璋?*/
  static _syncListeners = [];
  static _syncStatus = 'local';
  static _undoPushTimer = null;

  // ===== 鍒濆鍖栵細浠?GitHub 鎷夊彇鏈€鏂版暟鎹?=====
  static async init(repoOverride) {
    const repo = repoOverride || this._repo;
    if (!repo) { this._loaded = true; return this._cache; }
    const [owner, name] = repo.split('/');

    const cfg = this.getGitHubConfig();
    const headers = {};
    if (cfg && cfg.token) headers['Authorization'] = `Bearer ${cfg.token}`;

    // 鍏堝皾璇?GitHub API锛堝疄鏃讹級
    // 濡傛灉澶辫触鍒?fallback 鍒?raw CDN锛堝彲鑳芥湁缂撳瓨寤惰繜锛?
    let data = null;
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
      }
    } catch { /* API 涓嶉€氾紝璧?CDN 澶囬€?*/ }

    // API 澶辫触鏃跺皾璇曞涓?CDN 澶囬€?
    const cdns = [
      `https://raw.githubusercontent.com/${owner}/${name}/main/data.json`,
      `https://cdn.jsdelivr.net/gh/${owner}/${name}@main/data.json`,
    ];
    for (const url of cdns) {
      if (data) break;
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (res.ok) data = await res.json();
      } catch {}
    }

    if (data) {
      const entries = Array.isArray(data) ? data : (data.entries || []);
      this._cache = entries;
      this._repo = repo;
      this._setStatus(data ? 'connected' : 'local', data ? '浜戠' : '鏈湴');
    } else {
      // 浜戠鍏ㄤ笉鍙揪鏃讹紝浠?localStorage 澶囦唤鎭㈠
      try {
        const backup = localStorage.getItem(this.BACKUP_KEY);
        if (backup) {
          const parsed = JSON.parse(backup);
          const entries = Array.isArray(parsed) ? parsed : (parsed.entries || []);
          if (entries.length > 0) { this._cache = entries; }
        }
      } catch {}
      this._setStatus('local', '鏈湴');
    }

    this._loaded = true;
    return this._cache;
  }

  /** 纭繚宸插垵濮嬪寲 */
  static _ensureLoaded() {
    if (!this._loaded) throw new Error('鏁版嵁灏氭湭鍔犺浇锛岃鍏堣皟鐢?init()');
  }

  // ===== GitHub 閰嶇疆锛堜粎 token/repo 瀛?localStorage锛?====
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

  // ===== 璇诲彇 =====
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

  // ===== 鍐欏叆 =====
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
    this._backupToLocal();
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
    this._backupToLocal();
    this._pushAfterChange();
    return this._cache[idx];
  }

  static delete(id) {
    this._ensureLoaded();
    const idx = this._cache.findIndex(e => e.id === id);
    if (idx === -1) return false;
    this._cache.splice(idx, 1);
    this._backupToLocal();
    this._pushToGithub(false);  // 绔嬪嵆鎺紝鏄剧ず缁撴灉
    this.scheduleUndoPush();   // 5 鍒嗛挓鍚庝簩娆＄‘璁?
    return true;
  }

  static undoAdd(entry) {
    this._ensureLoaded();
    if (!entry || !entry.id) return null;
    if (this._cache.some(e => e.id === entry.id)) return entry;
    this._cache.unshift(entry);
    this._backupToLocal();
    this.cancelUndoPush();
    this._pushToGithub(false);
    return entry;
  }

  // ===== 瀵煎嚭 / 瀵煎叆 =====
  static exportData() {
    this._ensureLoaded();
    return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), entries: this._cache }, null, 2);
  }

  static importData(jsonStr) {
    this._ensureLoaded();
    let parsed;
    try { parsed = JSON.parse(jsonStr); } catch { throw new Error('JSON 鏍煎紡閿欒'); }
    let entries;
    if (Array.isArray(parsed)) entries = parsed;
    else if (parsed && Array.isArray(parsed.entries)) entries = parsed.entries;
    else throw new Error('鏁版嵁鏍煎紡涓嶆纭?);
    entries = entries.filter(e => e && e.title && e.title.trim());
    if (entries.length === 0) throw new Error('娌℃湁鎵惧埌鏈夋晥鐨勬潯鐩暟鎹?);
    entries = entries.map(e => ({
      id: e.id || this._genId(),
      title: e.title.trim(),
      type: ['anime', 'drama', 'movie'].includes(e.type) ? e.type : 'anime',
      status: ['watching', 'want_to_watch', 'completed'].includes(e.status) ? e.status : 'want_to_watch',
      rating: Math.min(5, Math.max(0, Number(e.rating) || 0)),
      notes: (e.notes || '').trim(),
      createdAt: e.createdAt || new Date().toISOString(),
    }));
    this._cache = entries;
    this._pushToGithub(false);
    return entries.length;
  }

  // ===== 鏈湴澶囦唤锛堢綉缁滀笉閫氭椂鍒锋柊涓嶄涪鏁版嵁锛?====
  static _backupToLocal() {
    try {
      localStorage.setItem(this.BACKUP_KEY, JSON.stringify({
        version: 1, updatedAt: new Date().toISOString(), entries: this._cache
      }));
    } catch {}
  }

  // ===== 浜戠鎺ㄩ€佹牳蹇?=====
  /** 鎵嬪姩鎺ㄩ€侊紙鏄剧ず缁撴灉锛?*/
  static async push() {
    this._ensureLoaded();
    await this._pushToGithub(false);
  }

  static _pushAfterChange() {
    // 涓嶉潤榛樷€斺€攑ush 澶辫触瑕佸憡鐭ョ敤鎴凤紝鍚﹀垯鍒锋柊鏁版嵁灏变涪浜?
    this._pushToGithub(false).catch(() => {});
  }

  static async _pushToGithub(silent) {
    const cfg = this.getGitHubConfig();
    if (!cfg || !cfg.token || !cfg.repo) {
      // 娌℃湁 token 鏃朵竴瀹氳鎻愮ず鈥斺€斿惁鍒欑敤鎴蜂笉鐭ラ亾鏁版嵁娌′繚瀛?
      if (typeof showToast === 'function') {
        showToast('鈿狅笍 鏈厤缃?Token锛岀偣鍙充笂瑙?GitHub 鍥炬爣閰嶇疆', 'error');
      }
      this._setStatus('error');
      return;
    }

    const [owner, name] = cfg.repo.split('/');
    const content = _utf8ToBase64(
      JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), entries: this._cache }, null, 2)
    );

    // 姣忔鎺ㄩ€佸墠閲嶆柊鑾峰彇鏈€鏂?sha锛堜笉渚濊禆鍙兘杩囨湡鐨勭紦瀛橈級
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
        // 姣忔灏濊瘯閮借幏鍙栨渶鏂?sha锛岄伩鍏?409
        const sha = await fetchLatestSha();
        const body = { message: '馃摑 AniList 鏁版嵁鍚屾', content };
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
          this._setStatus('connected', '浜戠');
          if (!silent && typeof showToast === 'function') showToast('鈽侊笍 宸插悓姝ュ埌浜戠');
          return;
        }

        // 409 鈫?sha 宸茶繃鏈燂紝涓嬫寰幆閲嶆柊鑾峰彇
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
      showToast('鉂?鍚屾澶辫触: ' + (lastErr ? lastErr.message : '缃戠粶閿欒'), 'error');
    }
    throw lastErr || new Error('鍚屾澶辫触');
  }

  // ===== 鎾ら攢瀹氭椂鍣?=====
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

  // ===== 宸ュ叿 =====
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

