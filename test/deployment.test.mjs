import test from 'node:test';
import assert from 'node:assert/strict';
import { createStaticServer } from '../app/server.js';

async function withServer(fn) {
  const server = createStaticServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { server.close(); }
}

test('server serves the lab, health, and version', async () => {
  await withServer(async (base) => {
    const html = await (await fetch(`${base}/`)).text();
    assert.match(html, /K8s Triage Lab/);
    assert.equal(await (await fetch(`${base}/health`)).text(), 'ok');
    const v = await (await fetch(`${base}/version`)).json();
    assert.equal(v.name, 'kubernetes-production-troubleshooting-demo');
    for (const mod of ['/incidents.mjs', '/triage.mjs', '/app.js', '/guide.html']) {
      assert.equal((await fetch(`${base}${mod}`)).status, 200, mod);
    }
    assert.equal((await fetch(`${base}/missing`, { method: 'GET' })).status, 404);
  });
});

test('responses carry security headers', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/`);
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });
});
