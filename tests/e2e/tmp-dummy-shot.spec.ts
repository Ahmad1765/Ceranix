// TEMP — screenshot harness for the dummy discover sheet. Delete after use.
import { test, waitForAppReady } from './helpers/page';

const OUT = 'C:/Users/flylu/AppData/Local/Temp/claude/D--Ceranix/1b8306cf-e54f-4241-8ecb-a9d814010a22/scratchpad';

test.use({ viewport: { width: 430, height: 900 } });

test('shoot the html mock', async ({ page }) => {
  // .sheet is width:430 inside a flex body with 30px padding — needs >=490 of
  // viewport or it shrinks (which is why it first rendered at 370).
  await page.setViewportSize({ width: 520, height: 1000 });
  await page.goto(`file:///${OUT}/mock/index.html`);
  await page.waitForTimeout(2500); // webfont + FA CDN
  await page.locator('.sheet').screenshot({ path: `${OUT}/mock.png` });
});

test('shoot dummy sheet', async ({ page }) => {
  await page.goto('/');
  await waitForAppReady(page);
  await page.getByRole('button', { name: 'Discover' }).click();
  await page.getByPlaceholder('Search polymarkets...').waitFor();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/dummy.png` });
});
