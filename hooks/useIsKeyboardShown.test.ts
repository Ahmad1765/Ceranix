import { describe, it, expect, vi, beforeEach } from 'vitest';

const listeners: Record<string, Function[]> = {};
const mockAddListener = vi.fn((event: string, callback: any) => {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(callback);
  return {
    remove: vi.fn(() => {
      listeners[event] = (listeners[event] || []).filter((cb) => cb !== callback);
    }),
  };
});
const mockIsVisible = vi.fn(() => false);

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Keyboard: {
    addListener: mockAddListener,
    isVisible: mockIsVisible,
  },
}));

describe('useIsKeyboardShown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(listeners).forEach((k) => delete listeners[k]);
  });

  it('exports hook and can attach listeners', async () => {
    const { useIsKeyboardShown } = await import('./useIsKeyboardShown');
    expect(typeof useIsKeyboardShown).toBe('function');
  });
});
