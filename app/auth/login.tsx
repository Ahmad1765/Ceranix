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

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleAuth = async () => {
    if (!email || !password) return;
    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        Alert.alert('Check your email', 'We sent a confirmation link.');
      }
      router.dismiss();
    } catch (e: any) {
      Alert.alert('Error', e.message);
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
          value={email}
          onChangeText={setEmail}
        />

        <Text className="text-sm font-medium text-gray-700 mb-1">Password</Text>
        <TextInput
          className="border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-900 mb-6"
          placeholder="••••••••"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <Pressable
          onPress={handleAuth}
          disabled={loading}
          className="bg-brand-500 rounded-xl py-4 items-center mb-4"
        >
          <Text className="text-white font-bold text-base">
            {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
          </Text>
        </Pressable>

        <Pressable onPress={() => setIsLogin(!isLogin)} className="items-center">
          <Text className="text-sm text-gray-500">
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
            <Text className="text-brand-500 font-semibold">
              {isLogin ? 'Sign Up' : 'Sign In'}
            </Text>
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
