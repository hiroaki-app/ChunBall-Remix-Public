// Run after npm run build. Check the generated worker, not a hand-written replica.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync('dist/sw.js', 'utf8');
const handlers = {}, stores = new Map([['chunball-remix-old', new Map()], ['chunball-production-existing', new Map()], ['unrelated', new Map()]]);
let pending, skip = 0, claim = 0;
const caches = {
  open: async name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {
      addAll: async urls => {
        // Match the browser's duplicate-request rejection (the previous mock missed it).
        assert.equal(new Set(urls).size, urls.length, 'Duplicate precache URLs abort SW install');
        for (const url of urls) {
          const path = 'dist' + (url === '/' ? '/index.html' : url.endsWith('/') ? url + 'index.html' : url);
          assert.ok(fs.existsSync(path), `Missing precache asset ${url}`);
          store.set(url, { ok: true, url });
        }
      },
      match: async url => store.get(url),
    };
  },
  keys: async () => [...stores.keys()],
  delete: async key => stores.delete(key),
};
vm.runInNewContext(source, { URL, Response, caches, fetch: async () => { throw new Error('offline'); }, self: {
  location: { origin: 'http://localhost' },
  clients: { claim: async () => { claim++; } },
  skipWaiting: () => { skip++; },
  addEventListener: (name, handler) => { handlers[name] = handler; },
} });
handlers.install({ waitUntil: p => { pending = p; } }); await pending;
assert.equal(skip, 0, 'Install must not interrupt play');
handlers.activate({ waitUntil: p => { pending = p; } }); await pending;
assert.ok(!stores.has('chunball-remix-old')); assert.ok(stores.has('unrelated')); assert.equal(claim, 1);
assert.ok(stores.has('chunball-production-existing'), 'Remix must not delete original caches');
for (const path of ['/']) {
  handlers.fetch({ request: { url: 'http://localhost' + path, method: 'GET', mode: 'navigate' }, respondWith: p => { pending = p; } });
  assert.ok((await pending).ok, `Offline HTML ${path}`);
}
for (const path of [...stores.values()].flatMap(store => [...store.keys()]).filter(p => /\.(js|css|png)$/.test(p))) {
  handlers.fetch({ request: { url: 'http://localhost' + path, method: 'GET', mode: 'cors' }, respondWith: p => { pending = p; } });
  assert.ok((await pending).ok, `Offline asset ${path}`);
}
handlers.message({ data: { type: 'ACTIVATE_UPDATE' } }); assert.equal(skip, 1);
console.log('PASS PWA: unique precache URLs, all assets exist, offline top/JS/CSS/icons, cache cleanup, opt-in activation');
