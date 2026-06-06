// Cross-platform text-input prompt. Wraps Alert.prompt on iOS, falls back
// to a custom Modal on Android (where Alert.prompt is unavailable). One
// hook, two helpers, same surface area on both platforms.
//
// Keep this tiny — anything richer (multi-field forms, validation) belongs
// in a dedicated sheet, not here.

import { useCallback, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { colors } from '@/lib/theme';

const IS_IOS = Platform.OS === 'ios';

type PromptOptions = {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  submitLabel?: string;
  cancelLabel?: string;
};

type PendingPrompt = PromptOptions & {
  resolve: (value: string | null) => void;
};

export function usePrompt() {
  const [pending, setPending] = useState<PendingPrompt | null>(null);

  const prompt = useCallback((opts: PromptOptions): Promise<string | null> => {
    if (IS_IOS) {
      return new Promise((resolve) => {
        Alert.prompt(
          opts.title,
          opts.message,
          [
            { text: opts.cancelLabel ?? 'Cancel', style: 'cancel', onPress: () => resolve(null) },
            {
              text: opts.submitLabel ?? 'OK',
              onPress: (value) => resolve((value ?? '').trim() || null),
            },
          ],
          'plain-text',
          opts.defaultValue,
        );
      });
    }
    return new Promise((resolve) => {
      setPending({ ...opts, resolve });
    });
  }, []);

  const element = pending ? (
    <PromptModal
      options={pending}
      onResolve={(v) => {
        pending.resolve(v);
        setPending(null);
      }}
    />
  ) : null;

  return { prompt, element };
}

function PromptModal({
  options,
  onResolve,
}: {
  options: PromptOptions;
  onResolve: (value: string | null) => void;
}) {
  const [value, setValue] = useState(options.defaultValue ?? '');
  const submit = () => onResolve(value.trim() || null);
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => onResolve(null)}
    >
      <Pressable
        onPress={() => onResolve(null)}
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
      >
        {IS_IOS ? (
          <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
        )}
        <Pressable
          onPress={() => {}}
          style={{
            width: 320,
            maxWidth: '90%',
            backgroundColor: 'white',
            borderRadius: 16,
            padding: 18,
            elevation: 12,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 4 }}>
            {options.title}
          </Text>
          {options.message ? (
            <Text style={{ fontSize: 13, color: colors.muteSoft, marginBottom: 12 }}>
              {options.message}
            </Text>
          ) : null}
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={options.placeholder}
            placeholderTextColor="rgba(15,15,15,0.45)"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
            style={{
              fontSize: 15,
              color: colors.ink,
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 10,
              backgroundColor: 'rgba(15,15,15,0.05)',
              marginTop: 8,
            }}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <Pressable
              onPress={() => onResolve(null)}
              style={({ pressed }) => ({
                paddingVertical: 8,
                paddingHorizontal: 14,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.muteSoft }}>
                {options.cancelLabel ?? 'Cancel'}
              </Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={value.trim().length === 0}
              style={({ pressed }) => ({
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: 10,
                backgroundColor: colors.purple,
                opacity: value.trim().length === 0 ? 0.4 : pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: 'white' }}>
                {options.submitLabel ?? 'OK'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
