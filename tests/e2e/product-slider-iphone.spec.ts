import { test, expect, gotoRoute, waitForAppReady, scrollFeedToBottom, priceText } from './helpers/page';

test.describe('iPhone Product Card Slider', () => {
  test('swiping the card carousel does not navigate away to product detail page', async ({ page }) => {
    await gotoRoute(page, '/');
    await waitForAppReady(page);
    await scrollFeedToBottom(page);

    await expect(priceText(page).first()).toBeVisible({ timeout: 15_000 });
    const card = page.getByTestId('listing-card').first();
    await expect(card).toBeVisible({ timeout: 10_000 });

    const carousel = page.getByTestId('listing-card-carousel').first();
    const box = (await carousel.isVisible()) ? await carousel.boundingBox() : await card.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const startX = box.x + box.width * 0.8;
    const startY = box.y + box.height * 0.5;
    const endX = box.x + box.width * 0.2;
    const endY = startY;

    const initialUrl = page.url();

    // Trigger touchstart, touchmove, touchend + synthetic click as iOS Safari does
    await page.evaluate(
      ({ sX, sY, eX, eY }) => {
        const el = document.elementFromPoint(sX, sY);
        if (!el) return;

        const touchObjStart = new Touch({
          identifier: 1,
          target: el,
          clientX: sX,
          clientY: sY,
          pageX: sX,
          pageY: sY,
        });

        el.dispatchEvent(
          new TouchEvent('touchstart', {
            touches: [touchObjStart],
            targetTouches: [touchObjStart],
            changedTouches: [touchObjStart],
            bubbles: true,
            cancelable: true,
          }),
        );

        const touchObjMove = new Touch({
          identifier: 1,
          target: el,
          clientX: eX,
          clientY: eY,
          pageX: eX,
          pageY: eY,
        });

        el.dispatchEvent(
          new TouchEvent('touchmove', {
            touches: [touchObjMove],
            targetTouches: [touchObjMove],
            changedTouches: [touchObjMove],
            bubbles: true,
            cancelable: true,
          }),
        );

        const touchObjEnd = new Touch({
          identifier: 1,
          target: el,
          clientX: eX,
          clientY: eY,
          pageX: eX,
          pageY: eY,
        });

        el.dispatchEvent(
          new TouchEvent('touchend', {
            touches: [],
            targetTouches: [],
            changedTouches: [touchObjEnd],
            bubbles: true,
            cancelable: true,
          }),
        );

        // In mobile browsers (Safari/Chrome), a synthetic click is then dispatched
        el.dispatchEvent(
          new MouseEvent('click', {
            clientX: sX,
            clientY: sY,
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      { sX: startX, sY: startY, eX: endX, eY: endY },
    );

    // Wait 500ms to verify navigation did not trigger
    await page.waitForTimeout(500);
    expect(page.url()).toBe(initialUrl);
  });

  test('tapping a card without swiping navigates to product detail page', async ({ page }) => {
    await gotoRoute(page, '/');
    await waitForAppReady(page);
    await scrollFeedToBottom(page);

    await expect(priceText(page).first()).toBeVisible({ timeout: 15_000 });
    const card = page.getByTestId('listing-card').first();
    await expect(card).toBeVisible({ timeout: 10_000 });

    await card.click();
    await page.waitForURL(/\/product\/[\w-]+/, { timeout: 15_000 });
    expect(page.url()).toMatch(/\/product\/[\w-]+/);
  });
});
