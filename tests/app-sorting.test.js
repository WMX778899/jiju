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

test('default order puts new items last only in want-to-watch', () => {
  const { sortEntries, resolveSortBy } = loadSorting();
  const entries = [
    { id: 'old', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'new', createdAt: '2026-02-01T00:00:00.000Z' },
  ];

  const idsFor = status => sortEntries(entries, resolveSortBy('default', status))
    .map(entry => entry.id)
    .join(',');

  assert.equal(idsFor('want_to_watch'), 'old,new');
  assert.equal(idsFor('all'), 'new,old');
  assert.equal(idsFor('watching'), 'new,old');
  assert.equal(idsFor('completed'), 'new,old');
});
