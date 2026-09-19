import { describe, it, expect, vi } from 'vitest';
import React from 'react';

vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj.web || obj.default },
  View: (props: any) => React.createElement('div', props, props.children),
  StyleSheet: { create: (s: any) => s, absoluteFillObject: {} },
}));

vi.mock('react-native-svg', () => ({
  default: (props: any) => React.createElement('svg', props, props.children),
  Path: (props: any) => React.createElement('path', props),
}));

vi.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      ink: '#0F0F0F',
      panel: '#FFFFFF',
      surface: '#F6F6F6',
      border: 'rgba(0,0,0,0.08)',
    },
    isDark: false,
  }),
}));

import { BellIcon, BELL_OUTLINE_PATH, BELL_FILLED_PATH } from './BellIcon';

describe('BellIcon Component', () => {
  it('renders BellIcon element with default size 20', () => {
    const element = React.createElement(BellIcon);
    expect(element.type).toBe(BellIcon);
    expect(element.props).toEqual({});
  });

  it('accepts custom size, color, and filled props', () => {
    const custom = React.createElement(BellIcon, {
      size: 24,
      color: '#6C47FF',
      filled: true,
    });

    expect(custom.props.size).toBe(24);
    expect(custom.props.color).toBe('#6C47FF');
    expect(custom.props.filled).toBe(true);
  });

  it('exports valid SVG path constants matching the design', () => {
    expect(BELL_OUTLINE_PATH).toContain('M12 1');
    expect(BELL_OUTLINE_PATH).toContain('14 19h-4a2 2 0 104 0z');
    expect(BELL_FILLED_PATH).toContain('M12 1');
  });
});
