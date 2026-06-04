import { useCallback, useState } from 'react';
import type { ViewStyle } from 'react-native';
import { colors } from '@/lib/theme';

// Shared focus-border hook for TextInput containers. Each callsite owns its
// own `focused` flag — wire `onFocus` / `onBlur` to the TextInput and spread
// `borderProps(restingBorder)` onto the wrapping View. Keeps the purple ring
// behaviour consistent across inputs without coupling them to a single
// container shape.
export function useInputFocus() {
  const [focused, setFocused] = useState(false);
  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => setFocused(false), []);
  const borderProps = useCallback(
    (resting: string = colors.hairline): Pick<ViewStyle, 'borderWidth' | 'borderColor'> => ({
      borderWidth: 1,
      borderColor: focused ? colors.purple : resting,
    }),
    [focused],
  );
  return { focused, onFocus, onBlur, borderProps };
}
