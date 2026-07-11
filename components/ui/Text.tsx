// Typography primitive. Wraps the shared textStyles tokens so screens can write
// <AppText variant="title"> instead of hand-rolling fontSize/fontFamily/color.
// Defaults are AA-safe; pass `style` to override (e.g. colour) per use.
import { Text, type TextProps } from 'react-native';
import { textStyles } from '@/lib/theme';

export type TextVariant = keyof typeof textStyles;

export function AppText({
  variant = 'body',
  style,
  ...rest
}: TextProps & { variant?: TextVariant }) {
  return <Text {...rest} style={[textStyles[variant], style]} />;
}
