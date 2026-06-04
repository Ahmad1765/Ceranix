import { Alert, Platform } from 'react-native';

type Opts = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

// Platform-aware confirm dialog. `Alert.alert` is a no-op on react-native-web,
// so on web we fall back to `window.confirm`. Resolves to true if the user
// accepts, false otherwise.
export function confirm(opts: Opts): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
      return Promise.reject(new Error('[confirm] Confirmation dialog unavailable in this environment.'));
    }
    const body = opts.message ? `${opts.title}\n\n${opts.message}` : opts.title;
    return Promise.resolve(window.confirm(body));
  }
  return new Promise((resolve) => {
    Alert.alert(opts.title, opts.message, [
      {
        text: opts.cancelLabel ?? 'Cancel',
        style: 'cancel',
        onPress: () => resolve(false),
      },
      {
        text: opts.confirmLabel ?? 'Confirm',
        style: opts.destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}
