const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadSorting() {
  const context = { document: { addEventListener() {} } };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  vm.runInContext(`${source}\n;globalThis.sortEntries = sortEntries; globalThis.resolveSortBy = resolveSortBy;`, context);
  return context;
}

test('default order follows each module convention', () => {
  const { sortEntries, resolveSortBy } = loadSorting();
  const entries = [
    { id: 'old', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'new', createdAt: '2026-02-01T00:00:00.000Z' },
  ];

  const idsFor = status => sortEntries(entries, resolveSortBy('default', status))
    .map(entry => entry.id)
    .join(',');

  // 「想看」旧的在前，其余模块新的在前
  assert.equal(idsFor('want_to_watch'), 'old,new');
  assert.equal(idsFor('all'), 'new,old');
  assert.equal(idsFor('watching'), 'new,old');
  assert.equal(idsFor('completed'), 'new,old');
});

test('completed module breaks time ties by insertion order', () => {
  const { sortEntries } = loadSorting();
  const entries = [
    { id: 'a', createdAt: '2026-07-20T13:42:44.079Z' },
    { id: 'b', createdAt: '2026-07-20T13:42:44.079Z' },
    { id: 'c', createdAt: '2026-07-20T13:42:44.079Z' },
  ];

  // 看完：创建时间并列时，后导入的算更新（倒序）/ 更旧（升序）
  assert.equal(sortEntries(entries, 'newest', { insertionOrder: true }).map(e => e.id).join(','), 'c,b,a');
  assert.equal(sortEntries(entries, 'oldest', { insertionOrder: true }).map(e => e.id).join(','), 'a,b,c');

  // 其余模块不启用决胜：稳定排序保持原序
  assert.equal(sortEntries(entries, 'newest').map(e => e.id).join(','), 'a,b,c');

  // 时间本身不同时，仍以时间为主，决胜只在并列时生效
  const mixed = [
    { id: 'x', createdAt: '2026-07-20T13:42:44.079Z' },
    { id: 'y', createdAt: '2026-07-21T00:00:00.000Z' },
    { id: 'z', createdAt: '2026-07-20T13:42:44.079Z' },
  ];
  assert.equal(sortEntries(mixed, 'newest', { insertionOrder: true }).map(e => e.id).join(','), 'y,z,x');
});

test('every module honors the explicit ascending / descending choice', () => {
  const { resolveSortBy } = loadSorting();

  // 三个状态模块 + 全部状态，显式选择的排序方式都原样生效
  for (const status of ['want_to_watch', 'watching', 'completed', 'all']) {
    assert.equal(resolveSortBy('newest', status), 'newest');
    assert.equal(resolveSortBy('oldest', status), 'oldest');
    assert.equal(resolveSortBy('title', status), 'title');
    assert.equal(resolveSortBy('title-desc', status), 'title-desc');
  }

  // 「默认排序」仍按模块取默认值
  assert.equal(resolveSortBy('default', 'want_to_watch'), 'oldest');
  assert.equal(resolveSortBy('default', 'watching'), 'newest');
  assert.equal(resolveSortBy('default', 'completed'), 'newest');
  assert.equal(resolveSortBy('default', 'all'), 'newest');
});

test('title asc / desc are mirror images', () => {
  const { sortEntries } = loadSorting();
  const entries = [
    { id: 'b', title: '白箱', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'a', title: '爱丽丝', createdAt: '2026-02-01T00:00:00.000Z' },
    { id: 'c', title: '苍蓝', createdAt: '2026-03-01T00:00:00.000Z' },
  ];

  const asc = sortEntries(entries, 'title').map(e => e.id).join(',');
  const desc = sortEntries(entries, 'title-desc').map(e => e.id).join(',');

  assert.equal(asc.split(',').slice().reverse().join(','), desc);
  assert.notEqual(asc, desc);
});
