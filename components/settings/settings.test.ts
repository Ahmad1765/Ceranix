import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { lightTheme } from '@/lib/theme';

vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj.web || obj.default },
  View: (props: any) => React.createElement('div', props, props.children),
  Text: (props: any) => React.createElement('span', props, props.children),
  Pressable: (props: any) => {
    const style = typeof props.style === 'function' ? props.style({ pressed: false }) : props.style;
    return React.createElement('button', { ...props, style }, props.children);
  },
  Switch: (props: any) => React.createElement('input', { type: 'checkbox', ...props }),
  ActivityIndicator: () => React.createElement('span', null, 'loading'),
  StyleSheet: { create: (s: any) => s, hairlineWidth: 1 },
}));

vi.mock('@expo/vector-icons/Feather', () => ({
  default: (props: any) => React.createElement('i', { 'data-icon': props.name }),
}));

vi.mock('@/lib/haptics', () => ({
  tap: vi.fn(),
}));

vi.mock('@/lib/rnText', () => ({
  Text: (props: any) => React.createElement('span', props, props.children),
}));

vi.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({ theme: lightTheme, isDark: false }),
}));

import {
  ChatGPTRow,
  ChatGPTButton,
  ChatGPTTabItem,
} from './SettingsRow';

describe('ChatGPT Settings UI & Primitives Invariants', () => {
  it('renders ChatGPTButton with clean 8px radius, height 34, and hairline border', () => {
    const element = React.createElement(ChatGPTButton, {
      label: 'Change',
    });
    const rendered = (element.type as any)(element.props);
    const style = typeof rendered.props.style === 'function'
      ? rendered.props.style({ pressed: false })
      : rendered.props.style;

    expect(style.borderRadius).toBe(8);
    expect(style.height).toBe(34);
    expect(style.borderWidth).toBe(1);
  });

  it('renders ChatGPTTabItem with active highlight and 8px radius', () => {
    const activeTab = React.createElement(ChatGPTTabItem, {
      icon: 'sliders',
      label: 'General',
      active: true,
      onPress: () => {},
    });
    const renderedActive = (activeTab.type as any)(activeTab.props);
    const activeStyle = typeof renderedActive.props.style === 'function'
      ? renderedActive.props.style({ pressed: false })
      : renderedActive.props.style;

    expect(activeStyle.borderRadius).toBe(8);
    expect(activeStyle.backgroundColor).toBe('rgba(0, 0, 0, 0.06)');

    const inactiveTab = React.createElement(ChatGPTTabItem, {
      icon: 'sliders',
      label: 'General',
      active: false,
      onPress: () => {},
    });
    const renderedInactive = (inactiveTab.type as any)(inactiveTab.props);
    const inactiveStyle = typeof renderedInactive.props.style === 'function'
      ? renderedInactive.props.style({ pressed: false })
      : renderedInactive.props.style;

    expect(inactiveStyle.backgroundColor).toBe('transparent');
  });

  it('renders ChatGPTRow with label and description', () => {
    const row = React.createElement(ChatGPTRow, {
      label: 'Dark mode',
      desc: 'Light appearance active',
    });
    const rendered = (row.type as any)(row.props);
    expect(rendered.props.style.flexDirection).toBe('row');
    expect(rendered.props.style.justifyContent).toBe('space-between');
  });
});
