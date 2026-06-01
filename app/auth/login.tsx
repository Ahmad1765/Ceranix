import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { colors } from '@/lib/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Mode = 'signin' | 'signup';
type Step = 'welcome' | 'form';

function tap(style: 'light' | 'medium' = 'light') {
  if (Platform.OS !== 'ios') return;
  Haptics.impactAsync(
    style === 'light'
      ? Haptics.ImpactFeedbackStyle.Light
      : Haptics.ImpactFeedbackStyle.Medium,
  );
}

function PressableScale({
  onPress,
  disabled,
  style,
  children,
}: {
  onPress: () => void;
  disabled?: boolean;
  style?: any;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        style,
        { transform: [{ scale: pressed ? 0.975 : 1 }], opacity: disabled ? 0.55 : 1 },
      ]}
    >
      {children}
    </Pressable>
  );
}

export default function LoginScreen() {
  const toast = useToast();
  const { height } = useWindowDimensions();
  const [step, setStep] = useState<Step>('welcome');
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [pwFocused, setPwFocused] = useState(false);

  const stepAnim = useRef(new Animated.Value(0)).current;
  const switchAnim = useRef(new Animated.Value(mode === 'signin' ? 0 : 1)).current;

  useEffect(() => {
    Animated.timing(stepAnim, {
      toValue: step === 'welcome' ? 0 : 1,
      duration: 280,
      easing: Easing.bezier(0.23, 1, 0.32, 1),
      useNativeDriver: true,
    }).start();
  }, [step, stepAnim]);

  useEffect(() => {
    Animated.timing(switchAnim, {
      toValue: mode === 'signin' ? 0 : 1,
      duration: 260,
      easing: Easing.bezier(0.23, 1, 0.32, 1),
      useNativeDriver: false,
    }).start();
  }, [mode, switchAnim]);

  const panelHeight = step === 'welcome' ? Math.min(height * 0.5, 460) : Math.min(height * 0.28, 240);

  const validate = (): string | null => {
    if (!email) return 'Email is required';
    if (!EMAIL_RE.test(email.trim())) return 'Enter a valid email';
    if (!password) return 'Password is required';
    if (password.length < 6) return 'Password must be at least 6 characters';
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      tap('medium');
      Alert.alert('Check your input', err);
      return;
    }
    tap('medium');
    setLoading(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        toast.show('Welcome back', { variant: 'success', icon: 'check' });
        if (router.canDismiss()) router.dismiss();
        else router.replace('/(tabs)');
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        if (data.session) {
          toast.show('Account created', { variant: 'success', icon: 'check' });
          router.replace('/profile/edit?onboarding=1');
        } else {
          Alert.alert(
            'Check your email',
            'We sent a confirmation link. Verify it, then sign in.',
            [{ text: 'Got it', onPress: () => setMode('signin') }],
          );
        }
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const goGuest = () => {
    tap('light');
    if (router.canDismiss()) router.dismiss();
    else router.replace('/(tabs)');
  };

  const openForm = (m: Mode) => {
    tap('light');
    setMode(m);
    setStep('form');
  };

  const backToWelcome = () => {
    tap('light');
    setStep('welcome');
  };

  const headline = step === 'welcome'
    ? 'Your story\nstarts now.'
    : mode === 'signup'
      ? 'Make it\nyours.'
      : 'Welcome\nback.';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {/* Top bar */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingTop: 8,
              paddingBottom: 8,
            }}
          >
            {step === 'form' ? (
              <Pressable
                onPress={backToWelcome}
                hitSlop={12}
                style={({ pressed }) => ({
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: colors.white,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: colors.hairline,
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                })}
              >
                <Feather name="arrow-left" size={18} color={colors.ink} />
              </Pressable>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: '900',
                    color: colors.ink,
                    letterSpacing: -0.6,
                  }}
                >
                  Ceranix
                </Text>
                <Text
                  style={{
                    fontSize: 22,
                    color: colors.primary,
                    marginLeft: 2,
                    fontWeight: '900',
                  }}
                >
                  .
                </Text>
              </View>
            )}
            {router.canDismiss() && step === 'welcome' && (
              <Pressable
                onPress={() => router.dismiss()}
                hitSlop={12}
                style={({ pressed }) => ({
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: colors.white,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: colors.hairline,
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                })}
              >
                <Feather name="x" size={18} color={colors.ink} />
              </Pressable>
            )}
          </View>

          {/* Purple hero panel */}
          <Animated.View
            style={{
              marginHorizontal: 16,
              marginTop: 4,
              height: panelHeight,
              backgroundColor: colors.primary,
              borderRadius: 32,
              padding: 28,
              justifyContent: 'space-between',
              overflow: 'hidden',
            }}
          >
            {/* Subtle pattern dots — palette-compliant decoration */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                right: -40,
                top: -40,
                width: 220,
                height: 220,
                borderRadius: 110,
                backgroundColor: 'rgba(255,255,255,0.08)',
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: -60,
                bottom: -80,
                width: 200,
                height: 200,
                borderRadius: 100,
                backgroundColor: 'rgba(255,255,255,0.06)',
              }}
            />

            <View>
              <View
                style={{
                  alignSelf: 'flex-start',
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 12,
                  height: 28,
                  borderRadius: 999,
                  backgroundColor: 'rgba(255,255,255,0.16)',
                  marginBottom: 18,
                }}
              >
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: colors.white,
                    marginRight: 8,
                  }}
                />
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: colors.white,
                    letterSpacing: 1.4,
                    textTransform: 'uppercase',
                  }}
                >
                  Ceranix
                </Text>
              </View>

              <Text
                style={{
                  fontSize: step === 'welcome' ? 52 : 40,
                  fontWeight: '900',
                  color: colors.white,
                  lineHeight: step === 'welcome' ? 54 : 42,
                  letterSpacing: -1.8,
                }}
              >
                {headline}
              </Text>
            </View>

            {step === 'welcome' && (
              <Text
                style={{
                  fontSize: 15,
                  color: 'rgba(255,255,255,0.82)',
                  lineHeight: 22,
                  maxWidth: '88%',
                }}
              >
                Buy and sell preloved fashion. Locally, beautifully, in a minute.
              </Text>
            )}
          </Animated.View>

          {/* Action area */}
          <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
            {step === 'welcome' ? (
              <View style={{ gap: 12 }}>
                <PressableScale onPress={goGuest} style={{}}>
                  <View
                    style={{
                      height: 58,
                      borderRadius: 18,
                      backgroundColor: colors.white,
                      borderWidth: 1.5,
                      borderColor: colors.hairline,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: 20,
                    }}
                  >
                    <Feather name="user" size={18} color={colors.ink} />
                    <Text
                      style={{
                        marginLeft: 10,
                        fontSize: 16,
                        fontWeight: '700',
                        color: colors.ink,
                        letterSpacing: 0.1,
                      }}
                    >
                      Continue as guest
                    </Text>
                  </View>
                </PressableScale>

                <PressableScale onPress={() => openForm('signup')} style={{}}>
                  <View
                    style={{
                      height: 58,
                      borderRadius: 18,
                      backgroundColor: colors.primary,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: 20,
                    }}
                  >
                    <Feather name="mail" size={18} color={colors.white} />
                    <Text
                      style={{
                        marginLeft: 10,
                        fontSize: 16,
                        fontWeight: '800',
                        color: colors.white,
                        letterSpacing: 0.1,
                      }}
                    >
                      Sign up with email
                    </Text>
                  </View>
                </PressableScale>

                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginTop: 14,
                  }}
                >
                  <Text style={{ fontSize: 14, color: colors.mute }}>
                    Already have an account?
                  </Text>
                  <Pressable
                    onPress={() => openForm('signin')}
                    hitSlop={10}
                    style={({ pressed }) => ({
                      marginLeft: 6,
                      opacity: pressed ? 0.6 : 1,
                    })}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '800',
                        color: colors.ink,
                        textDecorationLine: 'underline',
                      }}
                    >
                      Log in
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View>
                <ModeSwitch
                  mode={mode}
                  onChange={setMode}
                  switchAnim={switchAnim}
                />

                <View style={{ marginTop: 22 }}>
                  <Field label="Email" icon="mail" focused={emailFocused}>
                    <TextInput
                      placeholder="you@example.com"
                      placeholderTextColor={colors.muteSoft}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      value={email}
                      onChangeText={setEmail}
                      onFocus={() => setEmailFocused(true)}
                      onBlur={() => setEmailFocused(false)}
                      style={{
                        fontSize: 16,
                        color: colors.ink,
                        padding: 0,
                        // @ts-ignore — RN-Web only
                        outlineStyle: 'none',
                        outlineWidth: 0,
                      }}
                    />
                  </Field>

                  <Field label="Password" icon="lock" focused={pwFocused}>
                    <View
                      style={{ flexDirection: 'row', alignItems: 'center' }}
                    >
                      <TextInput
                        placeholder="At least 6 characters"
                        placeholderTextColor={colors.muteSoft}
                        secureTextEntry={!showPw}
                        autoCapitalize="none"
                        value={password}
                        onChangeText={setPassword}
                        onFocus={() => setPwFocused(true)}
                        onBlur={() => setPwFocused(false)}
                        style={{
                          flex: 1,
                          fontSize: 16,
                          color: colors.ink,
                          padding: 0,
                          // @ts-ignore — RN-Web only
                          outlineStyle: 'none',
                          outlineWidth: 0,
                        }}
                      />
                      <Pressable
                        onPress={() => setShowPw((v) => !v)}
                        hitSlop={10}
                        style={{ marginLeft: 8 }}
                      >
                        <Feather
                          name={showPw ? 'eye-off' : 'eye'}
                          size={18}
                          color={colors.mute}
                        />
                      </Pressable>
                    </View>
                  </Field>
                </View>

                <PressableScale
                  onPress={handleSubmit}
                  disabled={loading}
                  style={{}}
                >
                  <View
                    style={{
                      marginTop: 8,
                      height: 58,
                      borderRadius: 18,
                      backgroundColor: colors.primary,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: '800',
                        color: colors.white,
                        letterSpacing: 0.2,
                      }}
                    >
                      {loading
                        ? 'One moment…'
                        : mode === 'signup'
                          ? 'Create account'
                          : 'Sign in'}
                    </Text>
                    <View
                      style={{
                        position: 'absolute',
                        right: 12,
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        backgroundColor: 'rgba(255,255,255,0.18)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Feather name="arrow-right" size={18} color={colors.white} />
                    </View>
                  </View>
                </PressableScale>

                <Text
                  style={{
                    marginTop: 16,
                    textAlign: 'center',
                    fontSize: 12,
                    color: colors.mute,
                    lineHeight: 17,
                    paddingHorizontal: 16,
                  }}
                >
                  {mode === 'signup'
                    ? 'By creating an account you agree to our Terms and Privacy.'
                    : 'Forgot your password? Reach out to support — we’ll help.'}
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ModeSwitch({
  mode,
  onChange,
  switchAnim,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
  switchAnim: Animated.Value;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const PADDING = 4;
  const pillWidth = trackWidth > 0 ? (trackWidth - PADDING * 2) / 2 : 0;

  const translateX = switchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, pillWidth],
  });

  const signinColor = switchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.white, colors.mute],
  });
  const signupColor = switchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.mute, colors.white],
  });

  return (
    <View
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      style={{
        backgroundColor: colors.panel,
        borderRadius: 999,
        padding: PADDING,
        flexDirection: 'row',
        position: 'relative',
        height: 52,
      }}
    >
      {pillWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: PADDING,
            left: PADDING,
            bottom: PADDING,
            width: pillWidth,
            backgroundColor: colors.ink,
            borderRadius: 999,
            transform: [{ translateX }],
            shadowColor: '#000',
            shadowOpacity: 0.12,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 3,
          }}
        />
      )}
      {(['signin', 'signup'] as Mode[]).map((m) => {
        const color = m === 'signin' ? signinColor : signupColor;
        return (
          <Pressable
            key={m}
            onPress={() => {
              tap('light');
              onChange(m);
            }}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              height: 44,
              zIndex: 1,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            })}
          >
            <Animated.Text
              style={{
                fontSize: 14,
                fontWeight: '800',
                color,
                letterSpacing: 0.2,
              }}
            >
              {m === 'signin' ? 'Sign in' : 'Sign up'}
            </Animated.Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Field({
  label,
  icon,
  children,
  focused,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  children: React.ReactNode;
  focused: boolean;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          color: focused ? colors.ink : colors.mute,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          marginBottom: 8,
          marginLeft: 4,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          height: 56,
          borderRadius: 18,
          backgroundColor: colors.white,
          borderWidth: 1,
          borderColor: colors.hairline,
        }}
      >
        <Feather
          name={icon}
          size={18}
          color={focused ? colors.primary : colors.mute}
        />
        <View style={{ flex: 1, marginLeft: 12 }}>{children}</View>
      </View>
    </View>
  );
}
