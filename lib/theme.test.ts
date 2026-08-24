import { describe, it, expect, vi } from 'vitest';
import { eyebrow, eyebrowMute, lightTheme, darkTheme, setActiveTheme } from './theme';

vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj.web || obj.default },
  NativeModules: {},
}));

describe('theme eyebrow & eyebrowMute proxies', () => {
  it('enumerates typography properties when spread', () => {
    setActiveTheme(lightTheme);
    const spreadEyebrow = { ...eyebrow };
    expect(spreadEyebrow.fontSize).toBeDefined();
    expect(spreadEyebrow.fontWeight).toBeDefined();
    expect(spreadEyebrow.color).toBe(lightTheme.text);
    expect(spreadEyebrow.letterSpacing).toBe(1.4);
    expect(spreadEyebrow.textTransform).toBe('uppercase');

    const spreadEyebrowMute = { ...eyebrowMute };
    expect(spreadEyebrowMute.fontSize).toBeDefined();
    expect(spreadEyebrowMute.color).toBe(lightTheme.textMuted);
    expect(spreadEyebrowMute.letterSpacing).toBe(1.2);
  });

  it('updates dynamically when active theme changes', () => {
    setActiveTheme(darkTheme);
    expect(eyebrow.color).toBe(darkTheme.text);
    expect(eyebrowMute.color).toBe(darkTheme.textMuted);

    const darkSpread = { ...eyebrow };
    expect(darkSpread.color).toBe(darkTheme.text);

    // Reset back to light theme
    setActiveTheme(lightTheme);
    expect(eyebrow.color).toBe(lightTheme.text);
  });

  it('supports Object.keys and "in" operator', () => {
    expect('fontSize' in eyebrow).toBe(true);
    expect('color' in eyebrowMute).toBe(true);
    expect(Object.keys(eyebrow)).toContain('fontSize');
    expect(Object.keys(eyebrow)).toContain('color');
    expect(Object.keys(eyebrowMute)).toContain('letterSpacing');
  });
});
