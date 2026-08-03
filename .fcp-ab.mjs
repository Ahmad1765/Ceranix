import { chromium } from '@playwright/test';
import fs from 'node:fs';
const RUNS = Number(process.env.RUNS ?? 5);
const variant = process.argv[3];
fs.copyFileSync(`dist/index.${variant}.html`, 'dist/index.html');
const b = await chromium.launch();
const out = [];
for (let i = 0; i < RUNS; i++) {
  const p = await b.newPage({ viewport: { width: 420, height: 900 } });
  if (process.env.NET === 'slow') {
    const c = await p.context().newCDPSession(p);
    await c.send('Network.enable');
    await c.send('Network.emulateNetworkConditions', {
      offline: false, latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
  }
  await p.goto(process.argv[2], { waitUntil: 'load' });
  await p.waitForFunction(() => performance.getEntriesByType('paint').length > 0, null, { timeout: 60000 });
  const r = await p.evaluate(() => {
    const paints = Object.fromEntries(performance.getEntriesByType('paint').map((x) => [x.name, x.startTime]));
    const f = performance.getEntriesByType('resource').filter((r) => /Ionicons.*\.ttf$/.test(r.name))[0];
    return { fcp: Math.round(paints['first-contentful-paint'] ?? -1), ionicons: Math.round(f?.startTime ?? -1) };
  });
  out.push(r);
  await p.close();
}
const med = (xs) => { const s=[...xs].sort((a,b)=>a-b); return s[Math.floor(s.length/2)]; };
console.log(`${variant.padEnd(12)} FCP median ${med(out.map(o=>o.fcp))}ms   Ionicons starts @${med(out.map(o=>o.ionicons))}ms   samples ${out.map(o=>o.fcp).join(',')}`);
await b.close();
