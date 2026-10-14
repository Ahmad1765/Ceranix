import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { PlickNotificationIcon, PlickNewsIcon, PLICK_NOTIFICATION_LINES_PATH } from './PlickNotificationIcon';

vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj.web || obj.default },
  View: (props: any) => React.createElement('div', props, props.children),
  StyleSheet: { create: (s: any) => s, absoluteFillObject: {} },
}));

vi.mock('react-native-svg', () => ({
  default: (props: any) => React.createElement('svg', props, props.children),
  Rect: (props: any) => React.createElement('rect', props),
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

describe('PlickNotificationIcon Component', () => {
  it('renders with default size 20 and theme ink color', () => {
    const rendered = render(React.createElement(PlickNotificationIcon));
    const svg = rendered.props.children;
    const [rect, path] = svg.props.children;

    expect(svg.props.width).toBe(20);
    expect(svg.props.height).toBe(20);
    expect(svg.props.viewBox).toBe('0 0 24 24');

    expect(rect.props.x).toBe('4.25');
    expect(rect.props.y).toBe('3.5');
    expect(rect.props.width).toBe('15.5');
    expect(rect.props.height).toBe('17');
    expect(rect.props.rx).toBe('4.5');
    expect(rect.props.stroke).toBe('#0F0F0F');
    expect(rect.props.strokeWidth).toBe(2.2);

    expect(path.props.d).toBe(PLICK_NOTIFICATION_LINES_PATH);
    expect(path.props.stroke).toBe('#0F0F0F');
    expect(path.props.strokeWidth).toBe(2.2);
  });

  it('renders with custom size, color, and strokeWidth', () => {
    const rendered = render(
      React.createElement(PlickNotificationIcon, {
        size: 24,
        color: '#6C47FF',
        strokeWidth: 2.5,
      }),
    );
    const svg = rendered.props.children;
    const [rect, path] = svg.props.children;

    expect(svg.props.width).toBe(24);
    expect(svg.props.height).toBe(24);
    expect(rect.props.stroke).toBe('#6C47FF');
    expect(rect.props.strokeWidth).toBe(2.5);
    expect(path.props.stroke).toBe('#6C47FF');
    expect(path.props.strokeWidth).toBe(2.5);
  });

  it('PlickNewsIcon is exported as an alias', () => {
    expect(PlickNewsIcon).toBe(PlickNotificationIcon);
  });
});
