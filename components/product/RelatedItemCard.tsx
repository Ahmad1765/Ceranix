import { useState, useRef, useCallback, useEffect } from 'react';
import { View, ScrollView, Pressable, Platform } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { getOptimizedImageUrl, thumbWidthFor, IMAGE_TRANSITION } from '@/lib/images';
import { CARD_WIDTH, CARD_IMAGE_HEIGHT, type RelatedItem } from './shared';
import { formatPrice } from '@/lib/currency';
import { priceBreakdown } from '@/lib/fees';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import { useTheme } from '@/context/ThemeContext';

const SUPPRESSION_WINDOW_MS = 450;

export function RelatedItemCard({ item, onPress }: { item: RelatedItem; onPress: () => void }) {
  const { theme } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const [carouselArmed, setCarouselArmed] = useState(false);
  const hasMultiple = item.images.length > 1;
  const srcWidth = thumbWidthFor(CARD_WIDTH);
  const { total: totalPrice } = priceBreakdown(item.price);

  const isSwipingOrDragging = useRef(false);
  const lastDragEndTime = useRef(0);
  const webScrollTimeoutRef = useRef<any>(null);
  const containerRef = useRef<any>(null);
  const touchStartPos = useRef({ x: 0, y: 0, time: 0 });
  const hasTouchMoved = useRef(false);

  useEffect(() => {
    return () => {
      if (webScrollTimeoutRef.current) {
        clearTimeout(webScrollTimeoutRef.current);
      }
    };
  }, []);

  const armCarousel = useCallback(() => {
    if (!carouselArmed) setCarouselArmed(true);
  }, [carouselArmed]);

  const handleTouchStart = useCallback(
    (e: any) => {
      armCarousel();
      const touch = e.nativeEvent?.touches?.[0] || e.nativeEvent;
      if (touch) {
        touchStartPos.current = {
          x: touch.pageX ?? touch.clientX ?? 0,
          y: touch.pageY ?? touch.clientY ?? 0,
          time: Date.now(),
        };
      }
      hasTouchMoved.current = false;
    },
    [armCarousel],
  );

  const handleTouchMove = useCallback((e: any) => {
    const touch = e.nativeEvent?.touches?.[0] || e.nativeEvent;
    if (touch && touchStartPos.current.time > 0) {
      const dx = Math.abs((touch.pageX ?? touch.clientX ?? 0) - touchStartPos.current.x);
      if (dx > 6) {
        hasTouchMoved.current = true;
        isSwipingOrDragging.current = true;
        lastDragEndTime.current = Date.now();
      }
    }
  }, []);

  const scrollRef = useRef<ScrollView>(null);

  const handleTouchEnd = useCallback((e: any) => {
    const touch = e?.nativeEvent?.changedTouches?.[0] || e?.changedTouches?.[0] || e?.nativeEvent;
    const endX = touch ? (touch.pageX ?? touch.clientX ?? 0) : 0;
    const dx = endX - touchStartPos.current.x;
    const dt = Date.now() - touchStartPos.current.time;
    const velocity = Math.abs(dx) / Math.max(1, dt);
    const threshold = CARD_WIDTH * 0.15;

    if (hasTouchMoved.current || Math.abs(dx) > threshold) {
      lastDragEndTime.current = Date.now();
      isSwipingOrDragging.current = true;

      let target = activeIndex;
      if (dx < -threshold || (dx < -10 && velocity > 0.16)) {
        if (activeIndex < item.images.length - 1) {
          target = activeIndex + 1;
        }
      } else if (dx > threshold || (dx > 10 && velocity > 0.16)) {
        if (activeIndex > 0) {
          target = activeIndex - 1;
        }
      }

      setActiveIndex(target);
      const targetX = target * CARD_WIDTH;
      const node: any = scrollRef.current;
      const scrollNode: HTMLElement | null =
        typeof node?.getScrollableNode === 'function'
          ? node.getScrollableNode()
          : node instanceof HTMLElement
          ? node
          : null;
      if (scrollNode) {
        scrollNode.style.scrollSnapType = 'none';
        scrollNode.style.scrollBehavior = 'smooth';
        try {
          (scrollNode as any).scrollTo?.({ x: targetX, y: 0, animated: true });
          (Element.prototype.scrollTo as any).call(scrollNode, { left: targetX, behavior: 'smooth' });
        } catch {
          scrollNode.scrollLeft = targetX;
        }
        setTimeout(() => {
          if (scrollNode) {
            scrollNode.style.scrollSnapType = 'x mandatory';
          }
        }, 350);
      } else {
        scrollRef.current?.scrollTo({ x: targetX, animated: true });
      }

      if (webScrollTimeoutRef.current) {
        clearTimeout(webScrollTimeoutRef.current);
      }
      webScrollTimeoutRef.current = setTimeout(() => {
        isSwipingOrDragging.current = false;
      }, SUPPRESSION_WINDOW_MS);
    }
    hasTouchMoved.current = false;
  }, [activeIndex, item.images.length]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !containerRef.current) return;
    const node = containerRef.current as any;
    const target: HTMLElement | null =
      typeof node.getScrollableNode === 'function'
        ? node.getScrollableNode()
        : node instanceof HTMLElement
        ? node
        : (node._innerViewRef ?? null);

    if (!target) return;

    const handleClickCapture = (e: MouseEvent) => {
      if (isSwipingOrDragging.current || Date.now() - lastDragEndTime.current < SUPPRESSION_WINDOW_MS) {
        e.stopPropagation();
        e.preventDefault();
      }
    };

    target.addEventListener('click', handleClickCapture, true);
    return () => {
      target.removeEventListener('click', handleClickCapture, true);
    };
  }, []);

  const handleScroll = useCallback((e: any) => {
    setActiveIndex(Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH));
    isSwipingOrDragging.current = true;
    lastDragEndTime.current = Date.now();
    if (webScrollTimeoutRef.current) {
      clearTimeout(webScrollTimeoutRef.current);
    }
    webScrollTimeoutRef.current = setTimeout(() => {
      isSwipingOrDragging.current = false;
    }, SUPPRESSION_WINDOW_MS);
  }, []);

  const handlePress = useCallback(() => {
    if (isSwipingOrDragging.current || Date.now() - lastDragEndTime.current < SUPPRESSION_WINDOW_MS) {
      return;
    }
    onPress();
  }, [onPress]);

  const accessibilityLabel = `${item.brand || 'Item'}${item.meta ? `, ${item.meta}` : ''}, ${formatPrice(item.price, { whole: true })}`;

  return (
    <Pressable
      testID="related-item-card"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{ width: CARD_WIDTH, marginBottom: 18 }}
    >
      <View
        ref={containerRef}
        testID="related-item-carousel"
        style={{
          position: 'relative',
          width: CARD_WIDTH,
          height: CARD_IMAGE_HEIGHT,
          borderRadius: 14,
          overflow: 'hidden',
          backgroundColor: theme.panel,
          ...(Platform.OS === 'web' && hasMultiple
            ? ({
                touchAction: 'pan-x pan-y',
              } as any)
            : {}),
        }}
        onTouchStart={hasMultiple ? handleTouchStart : undefined}
        onTouchMove={hasMultiple ? handleTouchMove : undefined}
        onTouchEnd={hasMultiple ? handleTouchEnd : undefined}
        onTouchCancel={hasMultiple ? handleTouchEnd : undefined}
      >
        {hasMultiple ? (
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled
            onScroll={handleScroll}
            onScrollBeginDrag={() => {
              armCarousel();
              isSwipingOrDragging.current = true;
            }}
            onScrollEndDrag={() => {
              lastDragEndTime.current = Date.now();
              if (webScrollTimeoutRef.current) {
                clearTimeout(webScrollTimeoutRef.current);
              }
              webScrollTimeoutRef.current = setTimeout(() => {
                isSwipingOrDragging.current = false;
              }, SUPPRESSION_WINDOW_MS);
            }}
            scrollEventThrottle={16}
            disableIntervalMomentum
            style={[
              Platform.OS === 'web' && ({
                scrollSnapType: 'x mandatory',
                WebkitScrollSnapType: 'x mandatory',
                WebkitOverflowScrolling: 'touch',
                overscrollBehaviorX: 'contain',
                touchAction: 'pan-x pan-y',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
              } as any),
            ]}
          >
            {item.images.map((uri, i) => {
              if (i !== 0 && !carouselArmed) {
                return (
                  <View
                    key={i}
                    style={[
                      { width: CARD_WIDTH, height: CARD_IMAGE_HEIGHT },
                      Platform.OS === 'web' && ({
                        scrollSnapAlign: 'start',
                        WebkitScrollSnapAlign: 'start',
                        flexShrink: 0,
                      } as any),
                    ]}
                  />
                );
              }
              return (
                <View
                  key={i}
                  style={[
                    { width: CARD_WIDTH, height: CARD_IMAGE_HEIGHT },
                    Platform.OS === 'web' && ({
                      scrollSnapAlign: 'start',
                      WebkitScrollSnapAlign: 'start',
                      flexShrink: 0,
                    } as any),
                  ]}
                >
                  <Image
                    source={{ uri: getOptimizedImageUrl(uri, { width: srcWidth }) }}
                    style={{ width: CARD_WIDTH, height: CARD_IMAGE_HEIGHT }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={uri}
                    transition={IMAGE_TRANSITION}
                    priority={i === 0 ? 'normal' : 'low'}
                  />
                </View>
              );
            })}
          </ScrollView>
        ) : (
          <Image
            source={{
              uri: item.images && item.images.length > 0
                ? getOptimizedImageUrl(item.images[0], { width: srcWidth })
                : 'https://placehold.co/400x400/eeeeee/cccccc.png?text=No+Image',
            }}
            style={{ width: CARD_WIDTH, height: CARD_IMAGE_HEIGHT }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={item.images && item.images.length > 0 ? item.images[0] : 'empty-placeholder'}
            transition={IMAGE_TRANSITION}
          />
        )}

        {hasMultiple && (
          <View
            style={{
              position: 'absolute',
              bottom: 8,
              left: 0,
              right: 0,
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 4,
              pointerEvents: 'none',
            }}
          >
            {item.images.map((_, i) => (
              <View
                key={i}
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: i === activeIndex ? 'white' : 'rgba(255,255,255,0.55)',
                }}
              />
            ))}
          </View>
        )}

        {/* Like chip */}
        <View
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: 999,
            paddingHorizontal: 9,
            paddingVertical: 4,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Feather name="heart" size={11} color={theme.ink} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: theme.ink }}>{item.likes}</Text>
        </View>
      </View>

      <View style={{ marginTop: 6, width: '100%' }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: theme.ink }} numberOfLines={1}>
          {item.brand}
        </Text>
        {!!item.meta && (
          <Text style={{ fontSize: 11, color: theme.mute, marginTop: 2 }} numberOfLines={1}>
            {item.meta}
          </Text>
        )}
        <Text style={{ fontSize: 11, color: theme.mute, marginTop: 4 }}>
          {formatPrice(item.price, { whole: true })}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 3 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.ink }}>
            {formatPrice(totalPrice, { whole: true })} incl.
          </Text>
          <ShieldCheckIcon size={13} />
        </View>
      </View>
    </Pressable>
  );
}
