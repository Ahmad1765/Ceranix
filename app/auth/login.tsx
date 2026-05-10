import { useRef, useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PURPLE = '#6C47FF';
const LIME = '#d8f53a';
const INK = '#0a0a0a';
const MUTE = '#6b7280';
const SOFT = '#f5f4ef';

type Mode = 'signin' | 'signup';

function tap(style: 'light' | 'medium' = 'light') {
  if (Platform.OS !== 'ios') return;
  Haptics.impactAsync(
    style === 'light'
      ? Haptics.ImpactFeedbackStyle.Light
      : Haptics.ImpactFeedbackStyle.Medium,
  );
}

function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const slideAnim = useRef(new Animated.Value(mode === 'signin' ? 0 : 1)).current;

  const animateTo = (target: Mode) => {
    Animated.timing(slideAnim, {
      toValue: target === 'signin' ? 0 : 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };

  const left = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['2%', '50%'],
  });

  return (
    <View
      style={{
        backgroundColor: SOFT,
        borderRadius: 999,
        padding: 4,
        flexDirection: 'row',
        position: 'relative',
        height: 50,
      }}
    >
      <Animated.View
        style={{
          position: 'absolute',
          top: 4,
          bottom: 4,
          left,
          width: '48%',
          backgroundColor: INK,
          borderRadius: 999,
        }}
      />
      {(['signin', 'signup'] as Mode[]).map((m) => {
        const active = mode === m;
        return (
          <Pressable
            key={m}
            onPress={() => {
              tap('light');
              animateTo(m);
              onChange(m);
            }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', height: 42 }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: '700',
                color: active ? 'white' : INK,
                letterSpacing: 0.2,
              }}
            >
              {m === 'signin' ? 'Sign in' : 'Sign up'}
            </Text>
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
          color: focused ? INK : MUTE,
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
          borderRadius: 16,
          backgroundColor: 'white',
          borderWidth: 1.5,
          borderColor: focused ? INK : '#e8e6e0',
        }}
      >
        <Feather name={icon} size={18} color={focused ? INK : MUTE} />
        <View style={{ flex: 1, marginLeft: 12 }}>{children}</View>
      </View>
    </View>
  );
}

export default function LoginScreen() {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [pwFocused, setPwFocused] = useState(false);

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

  const isSignup = mode === 'signup';
  const heroTitle = isSignup ? 'Make it\nyours.' : 'Welcome\nback.';
  const heroSub = isSignup
    ? 'Buy and sell preloved fashion. It only takes a minute.'
    : 'Pick up where you left off.';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: SOFT }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {/* Top bar: wordmark + close (modal) */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 24,
              paddingTop: 8,
              paddingBottom: 12,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={{ fontSize: 22, fontWeight: '900', color: INK, letterSpacing: -0.6 }}>
                Ceranix
              </Text>
              <Text style={{ fontSize: 22, color: PURPLE, marginLeft: 2, fontWeight: '900' }}>.</Text>
            </View>
            {router.canDismiss() && (
              <Pressable
                onPress={() => router.dismiss()}
                hitSlop={12}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: 'white',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: '#e8e6e0',
                }}
              >
                <Feather name="x" size={18} color={INK} />
              </Pressable>
            )}
          </View>

          {/* Hero */}
          <View style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20 }}>
            <Text
              style={{
                fontSize: 56,
                fontWeight: '900',
                color: INK,
                lineHeight: 56,
                letterSpacing: -2,
              }}
            >
              {heroTitle}
            </Text>
            <View
              style={{
                marginTop: 14,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  backgroundColor: LIME,
                  borderRadius: 3,
                  marginRight: 10,
                }}
              />
              <Text
                style={{
                  fontSize: 15,
                  color: MUTE,
                  flex: 1,
                  lineHeight: 21,
                }}
              >
                {heroSub}
              </Text>
            </View>
          </View>

          {/* Card */}
          <View
            style={{
              marginHorizontal: 16,
              marginTop: 12,
              backgroundColor: 'white',
              borderRadius: 28,
              padding: 20,
              shadowColor: '#000',
              shadowOpacity: 0.04,
              shadowRadius: 20,
              shadowOffset: { width: 0, height: 6 },
              elevation: 2,
            }}
          >
            <ModeSwitch mode={mode} onChange={setMode} />

            <View style={{ marginTop: 22 }}>
              <Field label="Email" icon="mail" focused={emailFocused}>
                <TextInput
                  placeholder="you@example.com"
                  placeholderTextColor="#a8a59c"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  style={{ fontSize: 16, color: INK, padding: 0 }}
                />
              </Field>

              <Field label="Password" icon="lock" focused={pwFocused}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TextInput
                    placeholder="At least 6 characters"
                    placeholderTextColor="#a8a59c"
                    secureTextEntry={!showPw}
                    autoCapitalize="none"
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => setPwFocused(true)}
                    onBlur={() => setPwFocused(false)}
                    style={{ flex: 1, fontSize: 16, color: INK, padding: 0 }}
                  />
                  <Pressable
                    onPress={() => setShowPw((v) => !v)}
                    hitSlop={10}
                    style={{ marginLeft: 8 }}
                  >
                    <Feather
                      name={showPw ? 'eye-off' : 'eye'}
                      size={18}
                      color={MUTE}
                    />
                  </Pressable>
                </View>
              </Field>
            </View>

            <Pressable
              onPress={handleSubmit}
              disabled={loading}
              style={({ pressed }) => ({
                marginTop: 18,
                height: 58,
                borderRadius: 16,
                backgroundColor: INK,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: loading ? 0.7 : 1,
                transform: [{ scale: pressed ? 0.985 : 1 }],
                overflow: 'hidden',
              })}
            >
              {/* Lime accent stripe */}
              <View
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: 58,
                  backgroundColor: LIME,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name="arrow-right" size={20} color={INK} />
              </View>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '800',
                  color: 'white',
                  letterSpacing: 0.2,
                  marginRight: 58,
                }}
              >
                {loading ? 'One moment…' : isSignup ? 'Create account' : 'Sign in'}
              </Text>
            </Pressable>

            {/* Footer micro-copy */}
            <Text
              style={{
                marginTop: 14,
                textAlign: 'center',
                fontSize: 11,
                color: MUTE,
                lineHeight: 16,
                paddingHorizontal: 20,
              }}
            >
              {isSignup
                ? 'By creating an account you agree to our Terms and Privacy.'
                : 'Forgot your password? Reach out to support — we’ll help.'}
            </Text>
          </View>

          {/* Decorative bottom mark */}
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'flex-end',
              paddingTop: 36,
              paddingBottom: 12,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                opacity: 0.55,
              }}
            >
              <View
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: INK,
                }}
              />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: INK,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                }}
              >
                Preloved · Authentic · Local
              </Text>
              <View
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: INK,
                }}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
