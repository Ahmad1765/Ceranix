import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { UserPlusIcon } from './UserPlusIcon';

vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj.web || obj.default },
  View: (props: any) => React.createElement('div', props, props.children),
  StyleSheet: { create: (s: any) => s, absoluteFillObject: {} },
}));

vi.mock('react-native-svg', () => ({
  default: (props: any) => React.createElement('svg', props, props.children),
  Circle: (props: any) => React.createElement('circle', props),
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

describe('UserPlusIcon Component', () => {
  it('renders UserPlusIcon with default size 18, theme ink stroke, and geometry', () => {
    const rendered = render(React.createElement(UserPlusIcon));
    const svg = rendered.props.children;
    const [circle, bodyPath, plusPath] = svg.props.children;

    expect(svg.props.width).toBe(18);
    expect(svg.props.height).toBe(18);
    expect(svg.props.viewBox).toBe('0 0 24 24');

    // Circle (head)
    expect(circle.props.cx).toBe('9');
    expect(circle.props.cy).toBe('7');
    expect(circle.props.r).toBe('4');
    expect(circle.props.stroke).toBe('#0F0F0F');
    expect(circle.props.strokeWidth).toBe(1.85);
    expect(circle.props.strokeLinecap).toBe('round');
    expect(circle.props.strokeLinejoin).toBe('round');

    // Body silhouette path
    expect(bodyPath.props.d).toBe('M2 20c0-3.314 3.134-6 7-6s7 2.686 7 6');
    expect(bodyPath.props.stroke).toBe('#0F0F0F');
    expect(bodyPath.props.strokeWidth).toBe(1.85);
    expect(bodyPath.props.strokeLinecap).toBe('round');
    expect(bodyPath.props.strokeLinejoin).toBe('round');

    // Plus sign path
    expect(plusPath.props.d).toBe('M19 8v6M16 11h6');
    expect(plusPath.props.stroke).toBe('#0F0F0F');
    expect(plusPath.props.strokeWidth).toBe(1.85);
    expect(plusPath.props.strokeLinecap).toBe('round');
    expect(plusPath.props.strokeLinejoin).toBe('round');
  });

  it('renders with custom size, strokeWidth, and color props applied to circle and paths', () => {
    const rendered = render(
      React.createElement(UserPlusIcon, {
        size: 22,
        color: '#6C47FF',
        strokeWidth: 2,
      }),
    );
    const svg = rendered.props.children;
    const [circle, bodyPath, plusPath] = svg.props.children;

    expect(svg.props.width).toBe(22);
    expect(svg.props.height).toBe(22);

    expect(circle.props.stroke).toBe('#6C47FF');
    expect(circle.props.strokeWidth).toBe(2);

    expect(bodyPath.props.stroke).toBe('#6C47FF');
    expect(bodyPath.props.strokeWidth).toBe(2);

    expect(plusPath.props.stroke).toBe('#6C47FF');
    expect(plusPath.props.strokeWidth).toBe(2);
  });
});
