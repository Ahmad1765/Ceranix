import { chromium } from '@playwright/test';
const RUNS = Number(process.env.RUNS ?? 5);
const b = await chromium.launch();
async function measure(url) {
  const out = [];
  for (let i = 0; i < RUNS; i++) {
    const p = await b.newPage({ viewport: { width: 420, height: 900 } });
    const c = await p.context().newCDPSession(p);
    await c.send('Network.enable');
    await c.send('Network.emulateNetworkConditions', {
      offline: false, latency: 150,
      downloadThroughput: (4 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    await p.goto(url, { waitUntil: 'load' });
    // Wait for the font count to stop growing rather than for text to appear:
    // on the TTF baseline the fonts only start after the ~4.9 MB bundle has
    // executed, long after the first non-empty innerText.
    // `load` already covers the ~4.9 MB bundle; the baseline's fonts only begin
    // after it executes, so give them a flat window rather than trying to
    // detect "settled" (a poll that catches two equal counts mid-cascade stops
    // after the first font and reports a 1-request baseline).
    await p.waitForTimeout(10000);
    const r = await p.evaluate(() => {
      const rs = performance.getEntriesByType('resource');
      const fonts = rs.filter((x) => /\.(ttf|woff2)$/.test(x.name));
      const paints = Object.fromEntries(
        performance.getEntriesByType('paint').map((x) => [x.name, x.startTime]));
      return {
        fcp: Math.round(paints['first-contentful-paint'] ?? -1),
        firstFontStart: Math.round(Math.min(...fonts.map((f) => f.startTime))),
        lastFontEnd: Math.round(Math.max(...fonts.map((f) => f.responseEnd))),
        fontKB: Math.round(fonts.reduce((s, f) => s + (f.encodedBodySize || f.transferSize || 0), 0) / 1024),
        n: fonts.length,
      };
    });
    out.push(r); await p.close();
  }
  const med = (k) => out.map((o) => o[k]).sort((a, z) => a - z)[Math.floor(RUNS / 2)];
  return { fcp: med('fcp'), firstFontStart: med('firstFontStart'),
           lastFontEnd: med('lastFontEnd'), fontKB: med('fontKB'), n: out[0].n };
}
const base = await measure(process.argv[2]);
const next = await measure(process.argv[3]);
const row = (l, a, z, unit) => {
  const d = z - a, pct = a ? Math.round((d / a) * 100) : 0;
  console.log(`${l.padEnd(22)} ${String(a).padStart(7)}${unit}  ->${String(z).padStart(7)}${unit}   ${d > 0 ? '+' : ''}${d}${unit} (${pct > 0 ? '+' : ''}${pct}%)`);
};
console.log(`\n4 Mbps / 150ms RTT, median of ${RUNS}\n${'-'.repeat(68)}`);
row('font bytes', base.fontKB, next.fontKB, 'KB');
row('first font starts', base.firstFontStart, next.firstFontStart, 'ms');
row('all fonts done', base.lastFontEnd, next.lastFontEnd, 'ms');
row('first-contentful-paint', base.fcp, next.fcp, 'ms');
console.log(`font requests: ${base.n} -> ${next.n}`);
await b.close();
