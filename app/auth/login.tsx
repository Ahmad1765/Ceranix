import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  SafeAreaView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);

  const validate = (): string | null => {
    if (!email) return 'Email is required';
    if (!EMAIL_RE.test(email.trim())) return 'Enter a valid email';
    if (!password) return 'Password is required';
    if (password.length < 6) return 'Password must be at least 6 characters';
    return null;
  };

  const handleAuth = async () => {
    const err = validate();
    if (err) {
      Alert.alert('Check your input', err);
      return;
    }
    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        if (router.canDismiss()) router.dismiss();
        else router.replace('/(tabs)');
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw error;

        if (data.session) {
          // Email confirmations disabled — straight into onboarding.
          router.replace('/profile/edit?onboarding=1');
        } else {
          // Email confirmation enabled — user must verify before signing in.
          Alert.alert(
            'Check your email',
            'We sent a confirmation link. Verify it, then sign in.',
            [
              {
                text: 'OK',
                onPress: () => setIsLogin(true),
              },
            ],
          );
        }
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 px-6 justify-center"
      >
        <Text className="text-3xl font-bold text-gray-900 mb-1">Ceranix</Text>
        <Text className="text-sm text-gray-500 mb-8">
          {isLogin ? 'Sign in to your account' : 'Create your account'}
        </Text>

        <Text className="text-sm font-medium text-gray-700 mb-1">Email</Text>
        <TextInput
          className="border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-900 mb-4"
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
        />

        <Text className="text-sm font-medium text-gray-700 mb-1">Password</Text>
        <TextInput
          className="border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-900 mb-6"
          placeholder="••••••••"
          secureTextEntry
          autoCapitalize="none"
          value={password}
          onChangeText={setPassword}
        />

        <Pressable
          onPress={handleAuth}
          disabled={loading}
          className="bg-[#6C47FF] rounded-xl py-4 items-center mb-4"
          style={{ opacity: loading ? 0.7 : 1 }}
        >
          <Text className="text-white font-bold text-base">
            {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
          </Text>
        </Pressable>

        <Pressable onPress={() => setIsLogin(!isLogin)} className="items-center">
          <Text className="text-sm text-gray-500">
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
            <Text className="text-[#6C47FF] font-semibold">
              {isLogin ? 'Sign Up' : 'Sign In'}
            </Text>
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
