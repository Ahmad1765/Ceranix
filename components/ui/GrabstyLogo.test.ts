import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { GrabstyLogo } from './GrabstyLogo';

vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj.web || obj.default },
  View: (props: any) => React.createElement('div', props, props.children),
  StyleSheet: { create: (s: any) => s },
}));

vi.mock('@/lib/rnText', () => ({
  Text: (props: any) => React.createElement('span', props, props.children),
}));

vi.mock('react-native-svg', () => ({
  default: (props: any) => React.createElement('svg', props, props.children),
  Path: (props: any) => React.createElement('path', props),
  Rect: (props: any) => React.createElement('rect', props),
}));

vi.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      ink: '#0F0F0F',
      panel: '#FFFFFF',
      surface: '#F6F6F6',
      purple: '#6C47FF',
    },
    isDark: false,
  }),
}));

function render(element: React.ReactElement<any>) {
  const Component = element.type as any;
  const renderFn = Component.type || Component;
  return renderFn(element.props);
}

describe('GrabstyLogo Component', () => {
  it('renders mark variant with default size 28 and purple background', () => {
    const rendered = render(React.createElement(GrabstyLogo));
    const svg = rendered.props.children;
    expect(svg.props.width).toBe(28);
    expect(svg.props.height).toBe(28);
    expect(svg.props.viewBox).toBe('0 0 24 24');
    expect(svg.props.accessibilityLabel).toBe('Grabsty');

    const [rect, path] = svg.props.children;
    expect(rect.props.fill).toBe('#6C47FF');
    expect(path.props.fill).toBe('#FFFFFF');
  });

  it('renders full variant with mark and wordmark text', () => {
    const rendered = render(React.createElement(GrabstyLogo, { variant: 'full', size: 32 }));
    const [mark, text] = rendered.props.children;
    expect(mark.props.width).toBe(32);
    expect(text.props.children).toBe('Grabsty');
  });
});
