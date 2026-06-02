// react-native-web ships `Alert.alert` as a no-op (verified in
// node_modules/react-native-web/dist/.../Alert/index.js). Every existing call
// like `Alert.alert('Check your input', 'Enter a valid email')` is silently
// dropped, so users tap "Sign in" with a bad email and see nothing happen.
//
// Rather than rewriting every call site, we patch the shipped Alert object on
// web with a window-backed implementation that honours the standard RN API
// signature (title, message, buttons[]). Import this file once at the top of
// the root layout — installAlertShim() is idempotent.
//
// Native (iOS / Android) is left untouched.

import { Alert, Platform } from 'react-native';

type AlertButton = {
  text?: string;
  onPress?: (value?: string) => void;
  style?: 'default' | 'cancel' | 'destructive';
};

let installed = false;

export function installAlertShim(): void {
  if (installed) return;
  if (Platform.OS !== 'web') return;
  if (typeof window === 'undefined') return;

  installed = true;

  Alert.alert = (
    title: string,
    message?: string,
    buttons?: AlertButton[],
    _options?: unknown,
  ): void => {
    const body = message ? `${title}\n\n${message}` : title;

    if (!buttons || buttons.length === 0) {
      window.alert(body);
      return;
    }

    if (buttons.length === 1) {
      window.alert(body);
      buttons[0].onPress?.();
      return;
    }

    // Multi-button → confirm. OK runs the first non-cancel button's onPress
    // (typically the action); Cancel runs the cancel button's onPress.
    const confirmed = window.confirm(body);
    if (confirmed) {
      const action = buttons.find((b) => b.style !== 'cancel') ?? buttons[0];
      action.onPress?.();
    } else {
      const cancel = buttons.find((b) => b.style === 'cancel');
      cancel?.onPress?.();
    }
  };
}
