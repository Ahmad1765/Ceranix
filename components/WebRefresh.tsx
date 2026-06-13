import { Platform, View, ActivityIndicator } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { colors } from '@/lib/theme';

// react-native-web does NOT implement RefreshControl's pull-to-refresh, and RN's
// synthetic scroll events don't surface overscroll-at-top. So on web we attach
// real DOM listeners to the scroll node and drive the gesture ourselves:
//   • touch (mobile web): drag down while scrolled to the top
//   • wheel / trackpad (desktop): scroll up while already at the top
// On native this is entirely inert — RefreshControl owns the gesture there.

const IS_WEB = Platform.OS === 'web';
const THRESHOLD = 70; // px of pull before release/accumulation triggers a refresh
const MAX_PULL = 110; // clamp so the indicator never runs away
const RESISTANCE = 0.5; // pull feels rubber-banded, not 1:1

// RN ScrollView / FlatList expose getScrollableNode(); on web it returns the
// actual scrolling <div>. Fall back to the raw node for plain Views.
function resolveScrollNode(ref: { current: any }): HTMLElement | null {
  const r = ref?.current;
  if (!r) return null;
  if (typeof r.getScrollableNode === 'function') {
    const n = r.getScrollableNode();
    if (n && n.nodeType === 1) return n as HTMLElement;
  }
  if (r.nodeType === 1) return r as HTMLElement;
  return null;
}

export function useWebPullToRefresh({
  refreshing,
  onRefresh,
}: {
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const scrollRef = useRef<any>(null);
  const [pull, setPull] = useState(0);
  const [nodeTop, setNodeTop] = useState(0);

  // Keep the latest values without re-binding DOM listeners every render.
  const refreshingRef = useRef(refreshing);
  refreshingRef.current = refreshing;
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!IS_WEB) return;

    let el: HTMLElement | null = null;
    let detach: (() => void) | null = null;
    let retryTimer = 0;
    let attempts = 0;

    const setup = () => {
      el = resolveScrollNode(scrollRef);
      if (!el) {
        // The scroll node may not be laid out on first paint (e.g. FlatList).
        if (attempts++ < 10) retryTimer = window.setTimeout(setup, 100);
        return;
      }
      const node = el;
      const atTop = () => node.scrollTop <= 0;
      const captureTop = () => setNodeTop(node.getBoundingClientRect().top);

      let startY = 0;
      let pulling = false;
      let current = 0;

      const onTouchStart = (e: TouchEvent) => {
        if (!atTop()) {
          pulling = false;
          return;
        }
        startY = e.touches[0].clientY;
        pulling = true;
        current = 0;
        captureTop();
      };
      const onTouchMove = (e: TouchEvent) => {
        if (!pulling) return;
        const dy = e.touches[0].clientY - startY;
        if (dy > 0 && atTop()) {
          current = Math.min(dy * RESISTANCE, MAX_PULL);
          setPull(current);
          // Stop the browser's own rubber-band so our indicator owns the pull.
          if (e.cancelable) e.preventDefault();
        } else {
          current = 0;
          setPull(0);
        }
      };
      const onTouchEnd = () => {
        if (pulling && current >= THRESHOLD && !refreshingRef.current) onRefreshRef.current();
        pulling = false;
        current = 0;
        setPull(0);
      };

      // Desktop: there's no "release", so accumulate wheel-up-at-top and fire
      // once past the threshold, then decay back to rest.
      let wheelAccum = 0;
      let wheelFired = false;
      let wheelTimer = 0;
      const onWheel = (e: WheelEvent) => {
        if (!atTop()) {
          wheelAccum = 0;
          wheelFired = false;
          setPull(0);
          return;
        }
        if (e.deltaY < 0) {
          if (wheelAccum === 0) captureTop();
          wheelAccum += -e.deltaY;
          const p = Math.min(wheelAccum * RESISTANCE, MAX_PULL);
          setPull(p);
          if (!wheelFired && p >= THRESHOLD && !refreshingRef.current) {
            wheelFired = true;
            onRefreshRef.current();
          }
          window.clearTimeout(wheelTimer);
          wheelTimer = window.setTimeout(() => {
            wheelAccum = 0;
            wheelFired = false;
            setPull(0);
          }, 240);
        }
      };

      node.addEventListener('touchstart', onTouchStart, { passive: true });
      node.addEventListener('touchmove', onTouchMove, { passive: false });
      node.addEventListener('touchend', onTouchEnd, { passive: true });
      node.addEventListener('wheel', onWheel, { passive: true });

      detach = () => {
        node.removeEventListener('touchstart', onTouchStart);
        node.removeEventListener('touchmove', onTouchMove);
        node.removeEventListener('touchend', onTouchEnd);
        node.removeEventListener('wheel', onWheel);
        window.clearTimeout(wheelTimer);
      };
    };

    setup();
    return () => {
      window.clearTimeout(retryTimer);
      detach?.();
    };
    // Bind once; latest refreshing/onRefresh read through refs above.
  }, []);

  // Snap the indicator away once a refresh resolves.
  useEffect(() => {
    if (!refreshing) setPull(0);
  }, [refreshing]);

  return { scrollRef, pull, nodeTop, threshold: THRESHOLD };
}

// The pull spinner. Web-only. Positioned (fixed) at the top of the scroll area
// and descends with the pull, so it self-places on every screen regardless of
// header height. Renders nothing on native.
export function WebPullIndicator({
  pull,
  refreshing,
  nodeTop,
  threshold = THRESHOLD,
}: {
  pull: number;
  refreshing: boolean;
  nodeTop: number;
  threshold?: number;
}) {
  if (!IS_WEB) return null;
  if (!refreshing && pull <= 0) return null;
  const progress = Math.min(1, pull / threshold);
  const translateY = refreshing ? 52 : pull;
  return (
    <View
      pointerEvents="none"
      testID="web-pull-indicator"
      style={
        {
          position: 'fixed',
          top: nodeTop,
          left: 0,
          right: 0,
          alignItems: 'center',
          zIndex: 60,
          transform: [{ translateY }],
        } as any
      }
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: colors.white,
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0px 4px 14px rgba(15,15,15,0.18)',
          opacity: refreshing ? 1 : Math.max(0.2, progress),
          transform: [{ scale: refreshing ? 1 : 0.6 + progress * 0.4 }],
        }}
      >
        {refreshing ? (
          <ActivityIndicator size="small" color={colors.purple} />
        ) : (
          <Feather
            name="arrow-down"
            size={18}
            color={colors.purple}
            style={{ transform: [{ rotate: `${progress * 180}deg` }] }}
          />
        )}
      </View>
    </View>
  );
}
