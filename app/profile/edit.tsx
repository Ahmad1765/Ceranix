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
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { uploadAvatar, type LocalImage } from '@/lib/upload';
import { useToast } from '@/lib/toast';

const PURPLE = '#6C47FF';
const LIME = '#d8f53a';
const INK = '#0a0a0a';
const MUTE = '#6b7280';
const SOFT = '#f5f4ef';

function tap(style: 'light' | 'medium' = 'light') {
  if (Platform.OS !== 'ios') return;
  Haptics.impactAsync(
    style === 'light'
      ? Haptics.ImpactFeedbackStyle.Light
      : Haptics.ImpactFeedbackStyle.Medium,
  );
}

function FieldShell({
  label,
  helper,
  error,
  multiline,
  children,
  focused,
}: {
  label: string;
  helper?: string;
  error?: string | null;
  multiline?: boolean;
  focused: boolean;
  children: React.ReactNode;
}) {
  const borderColor = error ? '#ef4444' : focused ? INK : '#e8e6e0';
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8, marginLeft: 4 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            color: error ? '#ef4444' : focused ? INK : MUTE,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </Text>
        {helper && !error && (
          <Text style={{ fontSize: 11, color: '#a8a59c' }}>{helper}</Text>
        )}
      </View>
      <View
        style={{
          backgroundColor: 'white',
          borderRadius: 16,
          borderWidth: 1.5,
          borderColor,
          paddingHorizontal: 16,
          paddingVertical: multiline ? 14 : 0,
          minHeight: multiline ? 92 : 56,
          justifyContent: multiline ? 'flex-start' : 'center',
        }}
      >
        {children}
      </View>
      {error && (
        <Text style={{ fontSize: 12, color: '#ef4444', marginTop: 6, marginLeft: 4 }}>
          {error}
        </Text>
      )}
    </View>
  );
}

export default function ProfileEditScreen() {
  const { profile, user, refreshProfile, loading } = useAuth();
  const toast = useToast();
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
  const [focused, setFocused] = useState<string | null>(null);

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
    tap('light');
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
    if (u.length < 3) return 'At least 3 characters';
    if (!/^[a-z0-9_.]+$/.test(u)) return 'Lowercase letters, numbers, _ . only';
    return null;
  };

  const handleSave = async () => {
    if (!user) return;
    const err = validate();
    if (err) {
      tap('medium');
      setUsernameError(err);
      return;
    }
    setUsernameError(null);
    setSaving(true);
    tap('medium');

    try {
      let avatar_url = profile?.avatar_url ?? null;
      const isNewLocalAvatar =
        avatarUri &&
        (avatarUri.startsWith('file:') ||
          avatarUri.startsWith('content:') ||
          avatarUri.startsWith('data:'));
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

      toast.show(
        isOnboarding ? "You're in 🌶️" : 'Profile updated',
        { variant: 'success', icon: 'check' },
      );

      if (isOnboarding) router.replace('/(tabs)');
      else router.back();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !profile) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: SOFT, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={PURPLE} />
      </SafeAreaView>
    );
  }

  const initial = (fullName || username || profile.username || 'U').trim().charAt(0).toUpperCase();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: SOFT }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: 14,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            disabled={isOnboarding}
            hitSlop={12}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: 'white',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: '#e8e6e0',
              opacity: isOnboarding ? 0 : 1,
            }}
          >
            <Feather name="arrow-left" size={18} color={INK} />
          </Pressable>

          <Text style={{ fontSize: 13, fontWeight: '700', color: INK, letterSpacing: 1.4, textTransform: 'uppercase' }}>
            {isOnboarding ? 'Step 1 of 1' : 'Edit Profile'}
          </Text>

          <View style={{ width: 38 }} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero */}
          <Text
            style={{
              fontSize: 44,
              fontWeight: '900',
              color: INK,
              lineHeight: 46,
              letterSpacing: -1.5,
              marginTop: 6,
            }}
          >
            {isOnboarding ? 'Set up\nyour profile.' : 'Edit your\nprofile.'}
          </Text>
          <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center' }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: LIME,
                marginRight: 10,
              }}
            />
            <Text style={{ fontSize: 14, color: MUTE, lineHeight: 20, flex: 1 }}>
              {isOnboarding
                ? 'Pick a username and add a few details. You can change all of this later.'
                : 'Update what people see when they visit your shop.'}
            </Text>
          </View>

          {/* Avatar — large, off-center, with lime ring + edit FAB */}
          <View style={{ alignItems: 'center', marginTop: 30, marginBottom: 22 }}>
            <Pressable onPress={pickAvatar}>
              <View
                style={{
                  width: 132,
                  height: 132,
                  borderRadius: 66,
                  backgroundColor: LIME,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <View
                  style={{
                    width: 122,
                    height: 122,
                    borderRadius: 61,
                    backgroundColor: 'white',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  {avatarUri ? (
                    <Image
                      source={{ uri: avatarUri }}
                      style={{ width: 122, height: 122 }}
                      contentFit="cover"
                    />
                  ) : (
                    <Text style={{ fontSize: 56, fontWeight: '900', color: INK, letterSpacing: -2 }}>
                      {initial}
                    </Text>
                  )}
                </View>
              </View>
              {/* Edit FAB */}
              <View
                style={{
                  position: 'absolute',
                  right: -2,
                  bottom: -2,
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: INK,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 4,
                  borderColor: SOFT,
                }}
              >
                <Feather name="camera" size={16} color="white" />
              </View>
            </Pressable>
            <Text style={{ fontSize: 12, color: MUTE, marginTop: 12, fontWeight: '600' }}>
              Tap to change photo
            </Text>
          </View>

          {/* Section: Identity */}
          <Text
            style={{
              fontSize: 11,
              fontWeight: '800',
              color: INK,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              marginBottom: 12,
              marginLeft: 2,
            }}
          >
            Identity
          </Text>

          <FieldShell
            label="Username"
            helper="@unique"
            error={usernameError}
            focused={focused === 'username'}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, color: MUTE, marginRight: 2 }}>@</Text>
              <TextInput
                placeholder="ahmad_saleem"
                placeholderTextColor="#a8a59c"
                value={username}
                onChangeText={(t) => {
                  setUsername(t);
                  if (usernameError) setUsernameError(null);
                }}
                onFocus={() => setFocused('username')}
                onBlur={() => setFocused(null)}
                autoCapitalize="none"
                autoCorrect={false}
                style={{ flex: 1, fontSize: 16, color: INK, padding: 0 }}
              />
            </View>
          </FieldShell>

          <FieldShell label="Full name" focused={focused === 'fullName'}>
            <TextInput
              placeholder="Ahmad Saleem"
              placeholderTextColor="#a8a59c"
              value={fullName}
              onChangeText={setFullName}
              onFocus={() => setFocused('fullName')}
              onBlur={() => setFocused(null)}
              style={{ fontSize: 16, color: INK, padding: 0 }}
            />
          </FieldShell>

          {/* Section: Story */}
          <Text
            style={{
              fontSize: 11,
              fontWeight: '800',
              color: INK,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              marginTop: 18,
              marginBottom: 12,
              marginLeft: 2,
            }}
          >
            Story
          </Text>

          <FieldShell label="Bio" multiline focused={focused === 'bio'}>
            <TextInput
              placeholder="A line about your shop"
              placeholderTextColor="#a8a59c"
              value={bio}
              onChangeText={setBio}
              onFocus={() => setFocused('bio')}
              onBlur={() => setFocused(null)}
              multiline
              textAlignVertical="top"
              style={{ fontSize: 16, color: INK, padding: 0, minHeight: 64 }}
            />
          </FieldShell>

          <FieldShell label="Location" focused={focused === 'location'}>
            <TextInput
              placeholder="Karachi"
              placeholderTextColor="#a8a59c"
              value={location}
              onChangeText={setLocation}
              onFocus={() => setFocused('location')}
              onBlur={() => setFocused(null)}
              style={{ fontSize: 16, color: INK, padding: 0 }}
            />
          </FieldShell>
        </ScrollView>

        {/* Sticky bottom CTA */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: Platform.OS === 'ios' ? 32 : 20,
            backgroundColor: SOFT,
            borderTopWidth: 1,
            borderTopColor: '#eceae3',
          }}
        >
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={({ pressed }) => ({
              height: 58,
              borderRadius: 16,
              backgroundColor: INK,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: saving ? 0.7 : 1,
              transform: [{ scale: pressed ? 0.985 : 1 }],
              overflow: 'hidden',
            })}
          >
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
              {saving ? (
                <ActivityIndicator color={INK} />
              ) : (
                <Feather name={isOnboarding ? 'arrow-right' : 'check'} size={20} color={INK} />
              )}
            </View>
            <Text style={{ fontSize: 16, fontWeight: '800', color: 'white', letterSpacing: 0.2, marginRight: 58 }}>
              {saving ? 'Saving…' : isOnboarding ? 'Get started' : 'Save changes'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
