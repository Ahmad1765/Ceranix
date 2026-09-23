import { useState, useEffect } from 'react';
import { Keyboard, Platform, type EmitterSubscription } from 'react-native';

/**
 * Universal hook to track virtual software keyboard visibility across iOS, Android, and Web.
 *
 * - On iOS: Listens to 'keyboardWillShow' and 'keyboardWillHide' for frame-perfect early detection.
 * - On Android: Listens to 'keyboardDidShow' and 'keyboardDidHide', plus 'keyboardWillShow' and
 *   'keyboardWillHide' on supported Android 11+ window insets builds.
 * - Safely initializes from Keyboard.isVisible() where available.
 * - Leaves 0 stray listeners upon unmount.
 */
export function useIsKeyboardShown(): boolean {
  const [isKeyboardShown, setIsKeyboardShown] = useState(() => {
    try {
      return typeof Keyboard.isVisible === 'function' ? Keyboard.isVisible() : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handleShow = () => setIsKeyboardShown(true);
    const handleHide = () => setIsKeyboardShown(false);

    const subscriptions: EmitterSubscription[] = [];

    try {
      if (Platform.OS === 'ios') {
        subscriptions.push(
          Keyboard.addListener('keyboardWillShow', handleShow),
          Keyboard.addListener('keyboardWillHide', handleHide),
        );
      } else {
        subscriptions.push(
          Keyboard.addListener('keyboardDidShow', handleShow),
          Keyboard.addListener('keyboardDidHide', handleHide),
        );
        // Also listen to willShow/willHide if available on newer Android builds
        try {
          subscriptions.push(
            Keyboard.addListener('keyboardWillShow', handleShow),
            Keyboard.addListener('keyboardWillHide', handleHide),
          );
        } catch {
          // not supported on this platform version, ignore
        }
      }
    } catch {
      // Safe fallback on platforms where Keyboard listener is unavailable
    }

    return () => {
      subscriptions.forEach((sub) => {
        try {
          sub.remove();
        } catch {}
      });
    };
  }, []);

  return isKeyboardShown;
}
