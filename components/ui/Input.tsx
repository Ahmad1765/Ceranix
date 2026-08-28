import React, { forwardRef } from 'react';
import {
  View,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
  type TextInputProps,
} from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import { useTheme } from '@/context/ThemeContext';
import { radii, type as typography } from '@/lib/theme';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  placeholder?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  onBlur?: () => void;
  /** Error message string or object with message */
  error?: string | { message?: string } | null;
  helperText?: string;
  variant?: 'underline' | 'outline' | 'filled';
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
  disabled?: boolean;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    placeholder,
    value,
    onChangeText,
    onBlur,
    error,
    helperText,
    variant = 'underline',
    containerStyle,
    inputStyle,
    leftElement,
    rightElement,
    disabled = false,
    multiline = false,
    maxLength,
    accessibilityLabel,
    accessibilityHint,
    ...restProps
  },
  ref,
) {
  const { theme } = useTheme();
  const errorMessage = typeof error === 'string' ? error : error?.message;
  const hasError = Boolean(errorMessage);

  const getBorderColor = () => {
    if (hasError) return theme.danger ?? '#EF4444';
    return theme.border;
  };

  const isUnderline = variant === 'underline';
  const isFilled = variant === 'filled';

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text
          style={[
            styles.label,
            {
              color: hasError ? (theme.danger ?? '#EF4444') : theme.mute,
              fontFamily: typography.family.sansMedium,
            },
          ]}
        >
          {label}
        </Text>
      ) : null}

      <View
        style={[
          styles.inputWrapper,
          isUnderline && {
            borderBottomWidth: 1,
            borderBottomColor: getBorderColor(),
            paddingBottom: multiline ? 8 : 10,
          },
          !isUnderline && {
            borderWidth: 1,
            borderColor: getBorderColor(),
            borderRadius: radii.md,
            backgroundColor: isFilled ? theme.panel : theme.surface,
            paddingHorizontal: 14,
            paddingVertical: multiline ? 10 : 8,
          },
        ]}
      >
        {leftElement ? <View style={styles.leftSlot}>{leftElement}</View> : null}

        <TextInput
          ref={ref}
          {...restProps}
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          placeholder={placeholder}
          placeholderTextColor={theme.muteSoft ?? theme.mute}
          multiline={multiline}
          maxLength={maxLength}
          textAlignVertical={multiline ? 'top' : 'center'}
          accessibilityRole="text"
          accessibilityLabel={accessibilityLabel || label || placeholder}
          accessibilityHint={accessibilityHint}
          aria-invalid={hasError}
          editable={!disabled}
          accessibilityState={{ ...restProps.accessibilityState, disabled }}
          style={[
            styles.input,
            {
              color: theme.ink,
              fontFamily: typography.family.sans,
              minHeight: multiline ? 80 : 24,
            },
            inputStyle,
          ]}
        />

        {rightElement ? <View style={styles.rightSlot}>{rightElement}</View> : null}
      </View>

      {/* Error & Helper text message area with stable layout to prevent erratic jump */}
      <View style={styles.feedbackContainer}>
        {hasError ? (
          <Text
            accessibilityRole="alert"
            style={[
              styles.errorText,
              { color: theme.danger ?? '#EF4444', fontFamily: typography.family.sansMedium },
            ]}
          >
            {errorMessage}
          </Text>
        ) : helperText ? (
          <Text
            style={[
              styles.helperText,
              { color: theme.muteSoft ?? theme.mute, fontFamily: typography.family.sans },
            ]}
          >
            {helperText}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginVertical: 4,
  },
  label: {
    fontSize: 13,
    marginBottom: 6,
    letterSpacing: 0.1,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    fontSize: 15.5,
    padding: 0,
    outlineStyle: 'none',
    outlineWidth: 0,
  } as any,
  leftSlot: {
    marginRight: 8,
  },
  rightSlot: {
    marginLeft: 8,
  },
  feedbackContainer: {
    minHeight: 18,
    marginTop: 4,
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 12,
    lineHeight: 16,
  },
  helperText: {
    fontSize: 12,
    lineHeight: 16,
  },
});
