import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 420, height: 900 } });
const reqs = [];
p.on('response', async (r) => {
  if (!/.(ttf|woff2)(\?|$)/i.test(r.url())) return;
  let len = Number(r.headers()['content-length'] || 0);
  if (!len) { try { len = (await r.body()).length; } catch {} }
  reqs.push({ name: r.url().split('/').pop().slice(0, 34), kb: Math.round(len / 1024), from: r.request().resourceType() });
});
await p.goto(process.argv[2], { waitUntil: 'load' });
await p.waitForFunction(() => (document.body.innerText ?? '').trim().length > 0, null, { timeout: 60000 });
await p.waitForTimeout(6000);
const timing = await p.evaluate(() => {
  const rs = performance.getEntriesByType('resource');
  const js = rs.find((r) => /entry-.*\.js$/.test(r.name));
  const fonts = rs.filter((r) => /.(ttf|woff2)$/.test(r.name))
    .map((r) => ({ n: r.name.split('/').pop().slice(0, 30), start: Math.round(r.startTime), dur: Math.round(r.duration) }))
    .sort((a, b) => a.start - b.start);
  const paints = Object.fromEntries(performance.getEntriesByType('paint').map((x) => [x.name, Math.round(x.startTime)]));
  return { jsStart: Math.round(js?.startTime ?? -1), jsEnd: Math.round((js?.responseEnd ?? 0)), fonts, paints };
});
console.log(`bundle: start ${timing.jsStart}ms  end ${timing.jsEnd}ms`);
console.log(`first-contentful-paint: ${timing.paints['first-contentful-paint'] ?? '-'}ms`);
console.log('font requests, by start:');
for (const f of timing.fonts) console.log(`  @${String(f.start).padStart(5)}ms  ${String(f.dur).padStart(5)}ms  ${f.n}`);
console.log(`\nnetwork responses for .ttf (duplicate check): ${reqs.length}`);
for (const r of reqs) console.log(`  ${String(r.kb).padStart(5)} KB  ${r.name}`);
await b.close();
