import { describe, it, expect, vi } from 'vitest';
import React from 'react';

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

import { UserPlusIcon } from './UserPlusIcon';

describe('UserPlusIcon Component', () => {
  it('renders UserPlusIcon element with default size 18', () => {
    const element = React.createElement(UserPlusIcon);
    expect(element.type).toBe(UserPlusIcon);
    expect(element.props).toEqual({});
  });

  it('accepts custom size, strokeWidth, and color props', () => {
    const custom = React.createElement(UserPlusIcon, {
      size: 22,
      color: '#6C47FF',
      strokeWidth: 2,
    });

    expect(custom.props.size).toBe(22);
    expect(custom.props.color).toBe('#6C47FF');
    expect(custom.props.strokeWidth).toBe(2);
  });
});
