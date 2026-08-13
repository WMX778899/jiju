const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadAnimeDB(overrides = {}) {
  const storage = new Map();
  const context = {
    AbortController,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    clearTimeout,
    console,
    fetch: overrides.fetch || (() => { throw new Error('Unexpected fetch'); }),
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    },
    setTimeout: overrides.setTimeout || setTimeout,
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'storage.js'), 'utf8');
  vm.runInContext(`${source}\n;globalThis.AnimeDB = AnimeDB;`, context);
  return { AnimeDB: context.AnimeDB, storage };
}

test('push queue serializes writes and coalesces pending requests', async () => {
  const { AnimeDB } = loadAnimeDB();
  let active = 0;
  let maxActive = 0;
  const calls = [];
  let releaseFirst;
  const firstBlocked = new Promise(resolve => { releaseFirst = resolve; });
  let markFirstStarted;
  const firstStarted = new Promise(resolve => { markFirstStarted = resolve; });

  AnimeDB._pushToGithub = async silent => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    calls.push(silent);
    if (calls.length === 1) {
      markFirstStarted();
      await firstBlocked;
    }
    active -= 1;
  };

  const first = AnimeDB._enqueuePush(false);
  await firstStarted;
  const second = AnimeDB._enqueuePush(true);
  const coalesced = AnimeDB._enqueuePush(false);

  assert.strictEqual(second, coalesced);
  releaseFirst();
  await Promise.all([first, second, coalesced]);
  assert.equal(maxActive, 1);
  assert.deepEqual(calls, [false, false]);
});

test('a 409 retry rebuilds content from the latest cache', async () => {
  const putEntries = [];
  let putCount = 0;
  let AnimeDB;
  const immediateRetryTimer = (fn, delay) => (
    delay === 15000 ? setTimeout(fn, delay) : setTimeout(fn, 0)
  );
  const loaded = loadAnimeDB({
    setTimeout: immediateRetryTimer,
    fetch: async (_url, options = {}) => {
      if (!options.method) {
        return { ok: true, json: async () => ({ sha: `sha-${putCount}` }) };
      }
      const request = JSON.parse(options.body);
      const decoded = JSON.parse(Buffer.from(request.content, 'base64').toString('utf8'));
      putEntries.push(decoded.entries);
      putCount += 1;
      if (putCount === 1) {
        AnimeDB._cache = [{ id: 'new', title: 'New value' }];
        return { ok: false, status: 409 };
      }
      return { ok: true, json: async () => ({ content: { sha: 'sha-final' } }) };
    },
  });
  AnimeDB = loaded.AnimeDB;
  AnimeDB._cache = [{ id: 'old', title: 'Old value' }];
  AnimeDB._loaded = true;
  AnimeDB.saveGitHubConfig({ token: 'test-token', repo: 'owner/repo' });

  await AnimeDB._enqueuePush(true);

  assert.equal(putEntries.length, 2);
  assert.equal(putEntries[0][0].id, 'old');
  assert.equal(putEntries[1][0].id, 'new');
});

test('init reports failure when every remote source is unavailable', async () => {
  const { AnimeDB } = loadAnimeDB({
    fetch: async () => ({ ok: false, status: 503 }),
  });
  const previous = [{ id: 'local', title: 'Keep this cache' }];
  AnimeDB._cache = previous;

  await assert.rejects(
    AnimeDB.init('owner/repo'),
    /CDN 503/
  );

  assert.equal(AnimeDB._syncStatus, 'error');
  assert.strictEqual(AnimeDB._cache, previous);
  assert.equal(AnimeDB._loaded, true);
});

test('new entries and restored deletions are appended after existing entries', () => {
  const { AnimeDB } = loadAnimeDB();
  AnimeDB._loaded = true;
  AnimeDB._cache = [{ id: 'existing', title: 'Existing entry' }];
  AnimeDB._pushAfterChange = () => {};
  AnimeDB._enqueuePush = () => Promise.resolve();

  const added = AnimeDB.add({ title: 'New entry' });
  const restored = AnimeDB.undoAdd({ id: 'restored', title: 'Restored entry' });

  assert.equal(added.title, 'New entry');
  assert.equal(added.status, 'want_to_watch');
  assert.equal(restored.title, 'Restored entry');
  assert.equal(
    AnimeDB.getAll().map(entry => entry.id).join(','),
    `existing,${added.id},restored`
  );
});

test('titles are unique across statuses for the same type when spaces differ', () => {
  const { AnimeDB } = loadAnimeDB();
  AnimeDB._loaded = true;
  AnimeDB._cache = [];
  AnimeDB._pushAfterChange = () => {};

  const first = AnimeDB.add({ title: 'A  Title', status: 'want_to_watch' });
  const differentTitle = AnimeDB.add({ title: 'Another Title', status: 'want_to_watch' });
  const differentType = AnimeDB.add({ title: 'A Title', type: 'movie', status: 'watching' });

  assert.equal(first.title, 'A  Title');
  assert.equal(differentTitle.title, 'Another Title');
  assert.equal(differentType.type, 'movie');
  assert.throws(
    () => AnimeDB.add({ title: ' A Title ', status: 'watching' }),
    error => error.code === 'DUPLICATE_TITLE'
  );
  assert.throws(
    () => AnimeDB.update(differentTitle.id, { title: 'A\tTitle', type: 'anime' }),
    error => error.code === 'DUPLICATE_TITLE'
  );
  assert.throws(
    () => AnimeDB.update(differentType.id, { type: 'anime' }),
    error => error.code === 'DUPLICATE_TITLE'
  );
  const updated = AnimeDB.update(first.id, { status: 'completed' });
  assert.equal(updated.status, 'completed');
});
