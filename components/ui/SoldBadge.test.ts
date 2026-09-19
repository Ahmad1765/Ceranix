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

function render(element: React.ReactElement<any>) {
  const Component = element.type as any;
  const renderFn = Component.type || Component;
  return renderFn(element.props);
}

describe('SoldBadge Component', () => {
  it('renders SoldBadge element with displayed text and default md size styles', () => {
    const rendered = render(React.createElement(SoldBadge));

    expect(rendered.props.children.props.children).toBe('Sold');
    expect(rendered.props.style[0]).toMatchObject({
      backgroundColor: '#6C47FF',
      borderRadius: 4,
      paddingHorizontal: 13,
      paddingVertical: 5.5,
    });
    expect(rendered.props.children.props.style).toMatchObject({
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    });
  });

  it('renders size-dependent styles for sm, md, and lg sizes', () => {
    const sm = render(React.createElement(SoldBadge, { size: 'sm' }));
    const md = render(React.createElement(SoldBadge, { size: 'md' }));
    const lg = render(React.createElement(SoldBadge, { size: 'lg' }));

    expect(sm.props.children.props.children).toBe('Sold');
    expect(md.props.children.props.children).toBe('Sold');
    expect(lg.props.children.props.children).toBe('Sold');

    expect(sm.props.style[0]).toMatchObject({
      paddingHorizontal: 10,
      paddingVertical: 4,
    });
    expect(sm.props.children.props.style).toMatchObject({
      fontSize: 11,
    });

    expect(md.props.style[0]).toMatchObject({
      paddingHorizontal: 13,
      paddingVertical: 5.5,
    });
    expect(md.props.children.props.style).toMatchObject({
      fontSize: 13,
    });

    expect(lg.props.style[0]).toMatchObject({
      paddingHorizontal: 18,
      paddingVertical: 7,
    });
    expect(lg.props.children.props.style).toMatchObject({
      fontSize: 16,
    });
  });
});

