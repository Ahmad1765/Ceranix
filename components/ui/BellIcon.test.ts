import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { BellIcon, BELL_OUTLINE_PATH, BELL_FILLED_PATH } from './BellIcon';

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

function render(element: React.ReactElement<any>) {
  const Component = element.type as any;
  const renderFn = Component.type || Component;
  return renderFn(element.props);
}

describe('BellIcon Component', () => {
  it('renders outline variant with default size 20 and theme ink color', () => {
    const rendered = render(React.createElement(BellIcon));
    const svg = rendered.props.children;
    const path = svg.props.children;

    expect(svg.props.width).toBe(20);
    expect(svg.props.height).toBe(20);
    expect(svg.props.viewBox).toBe('0 0 24 24');

    expect(path.props.d).toBe(BELL_OUTLINE_PATH);
    expect(path.props.fill).toBe('#0F0F0F');
    expect(path.props.fillRule).toBe('evenodd');
    expect(path.props.clipRule).toBe('evenodd');
  });

  it('renders filled variant with custom size, color, and nonzero fillRule', () => {
    const rendered = render(
      React.createElement(BellIcon, {
        size: 24,
        color: '#6C47FF',
        filled: true,
      }),
    );
    const svg = rendered.props.children;
    const path = svg.props.children;

    expect(svg.props.width).toBe(24);
    expect(svg.props.height).toBe(24);

    expect(path.props.d).toBe(BELL_FILLED_PATH);
    expect(path.props.fill).toBe('#6C47FF');
    expect(path.props.fillRule).toBe('nonzero');
    expect(path.props.clipRule).toBe('nonzero');
  });

  it('exports valid SVG path constants matching the design', () => {
    expect(BELL_OUTLINE_PATH).toContain('M12 1');
    expect(BELL_OUTLINE_PATH).toContain('14 19h-4a2 2 0 104 0z');
    expect(BELL_FILLED_PATH).toContain('M12 1');
  });
});
