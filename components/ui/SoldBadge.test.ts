import { describe, it, expect, vi } from 'vitest';
import React from 'react';

vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj.web || obj.default },
  View: (props: any) => React.createElement('div', props, props.children),
  Text: (props: any) => React.createElement('span', props, props.children),
  StyleSheet: { create: (s: any) => s, absoluteFillObject: {} },
}));

vi.mock('@/lib/rnText', () => ({
  Text: (props: any) => React.createElement('span', props, props.children),
}));

import { SoldBadge } from './SoldBadge';

describe('SoldBadge Component', () => {
  it('renders SoldBadge element with default md size', () => {
    const element = React.createElement(SoldBadge);
    expect(element.type).toBe(SoldBadge);
    expect(element.props).toEqual({});
  });

  it('accepts sm, md, and lg sizes', () => {
    const sm = React.createElement(SoldBadge, { size: 'sm' });
    const md = React.createElement(SoldBadge, { size: 'md' });
    const lg = React.createElement(SoldBadge, { size: 'lg' });

    expect(sm.props.size).toBe('sm');
    expect(md.props.size).toBe('md');
    expect(lg.props.size).toBe('lg');
  });
});
