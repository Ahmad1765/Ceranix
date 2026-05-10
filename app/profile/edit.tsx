import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { uploadAvatar, type LocalImage } from '@/lib/upload';

export default function ProfileEditScreen() {
  const { profile, user, refreshProfile, loading } = useAuth();
  const params = useLocalSearchParams<{ onboarding?: string }>();
  const isOnboarding = params.onboarding === '1';

  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setUsername(profile.username ?? '');
      setFullName(profile.full_name ?? '');
      setBio(profile.bio ?? '');
      setLocation(profile.location ?? '');
      setAvatarUri(profile.avatar_url ?? null);
    }
  }, [profile]);

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
      setAvatarBase64(result.assets[0].base64 ?? null);
    }
  };

  const validate = (): string | null => {
    const u = username.trim().toLowerCase();
    if (!u) return 'Username is required';
    if (u.length < 3) return 'Username must be at least 3 characters';
    if (!/^[a-z0-9_.]+$/.test(u)) return 'Use lowercase letters, numbers, underscore, dot only';
    return null;
  };

  const handleSave = async () => {
    if (!user) return;
    const err = validate();
    if (err) {
      setUsernameError(err);
      return;
    }
    setUsernameError(null);
    setSaving(true);

    try {
      let avatar_url = profile?.avatar_url ?? null;
      const isNewLocalAvatar = avatarUri && (avatarUri.startsWith('file:') || avatarUri.startsWith('content:') || avatarUri.startsWith('data:'));
      if (isNewLocalAvatar) {
        const localImg: LocalImage = { uri: avatarUri!, base64: avatarBase64 };
        avatar_url = await uploadAvatar(localImg, user.id);
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          username: username.trim().toLowerCase(),
          full_name: fullName.trim() || null,
          bio: bio.trim() || null,
          location: location.trim() || null,
          avatar_url,
        })
        .eq('id', user.id);

      if (error) {
        if (error.code === '23505') {
          setUsernameError('Username already taken');
        } else {
          Alert.alert('Could not save', error.message);
        }
        return;
      }

      await refreshProfile();

      if (isOnboarding) {
        router.replace('/(tabs)');
      } else {
        router.back();
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !profile) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator color="#6C47FF" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        {/* Header */}
        <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-gray-100">
          {!isOnboarding && (
            <Pressable onPress={() => router.back()} className="mr-4">
              <Feather name="arrow-left" size={22} color="#374151" />
            </Pressable>
          )}
          <Text className="text-base font-semibold text-gray-900">
            {isOnboarding ? 'Set up your profile' : 'Edit profile'}
          </Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {isOnboarding && (
            <Text className="text-[15px] text-gray-500 mb-6">
              Pick a username and add a few details. You can change all of this later.
            </Text>
          )}

          {/* Avatar */}
          <View className="items-center mb-8">
            <Pressable onPress={pickAvatar} className="relative">
              <View className="w-28 h-28 rounded-full bg-gray-200 items-center justify-center overflow-hidden">
                {avatarUri ? (
                  <Image
                    source={{ uri: avatarUri }}
                    style={{ width: 112, height: 112 }}
                    contentFit="cover"
                  />
                ) : (
                  <Feather name="user" size={42} color="#9ca3af" />
                )}
              </View>
              <View className="absolute bottom-0 right-0 bg-[#6C47FF] rounded-full p-2">
                <Feather name="camera" size={14} color="white" />
              </View>
            </Pressable>
            <Text className="text-xs text-gray-500 mt-2">Tap to change photo</Text>
          </View>

          {/* Username */}
          <Text className="text-sm font-medium text-gray-700 mb-1">Username *</Text>
          <TextInput
            className={`border rounded-xl px-3 py-3 text-sm text-gray-900 mb-1 ${usernameError ? 'border-red-400' : 'border-gray-200'}`}
            placeholder="e.g. ahmad_saleem"
            value={username}
            onChangeText={(t) => {
              setUsername(t);
              if (usernameError) setUsernameError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {usernameError ? (
            <Text className="text-xs text-red-500 mb-3">{usernameError}</Text>
          ) : (
            <Text className="text-xs text-gray-400 mb-3">Lowercase, numbers, _ . only</Text>
          )}

          {/* Full name */}
          <Text className="text-sm font-medium text-gray-700 mb-1">Full name</Text>
          <TextInput
            className="border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-900 mb-4"
            placeholder="e.g. Ahmad Saleem"
            value={fullName}
            onChangeText={setFullName}
          />

          {/* Bio */}
          <Text className="text-sm font-medium text-gray-700 mb-1">Bio</Text>
          <TextInput
            className="border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-900 mb-4"
            placeholder="A line about your shop"
            value={bio}
            onChangeText={setBio}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            style={{ minHeight: 80 }}
          />

          {/* Location */}
          <Text className="text-sm font-medium text-gray-700 mb-1">Location</Text>
          <TextInput
            className="border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-900 mb-8"
            placeholder="e.g. Karachi"
            value={location}
            onChangeText={setLocation}
          />

          <Pressable
            onPress={handleSave}
            disabled={saving}
            className="bg-[#6C47FF] rounded-xl py-4 items-center"
            style={{ opacity: saving ? 0.7 : 1 }}
          >
            <Text className="text-white font-bold text-base">
              {saving ? 'Saving...' : isOnboarding ? 'Get started' : 'Save changes'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
