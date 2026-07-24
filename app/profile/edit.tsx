import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, BackHandler } from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { safeBack } from '@/lib/nav';
import { supabase } from '@/lib/supabase';
import { uploadAvatar, type LocalImage } from '@/lib/upload';
import { useToast } from '@/lib/toast';

const PURPLE = '#6C47FF';
const LIME = '#84CC16';  // or another lime/green shade
const INK = '#0F0F0F';
const MUTE = 'rgba(15,15,15,0.62)';
const SOFT = '#FFFFFF';
const HAIR = 'rgba(15,15,15,0.08)';
const RED = '#EF4444';  // or another red shade (e.g., #DC2626, #F87171)

const LIMITS = {
  username: 20,
  fullName: 50,
  bio: 200,
  location: 60,
} as const;

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
  focused,
  count,
  max,
  children,
}: {
  label: string;
  helper?: string | null;
  error?: string | null;
  multiline?: boolean;
  focused: boolean;
  count?: number;
  max?: number;
  children: React.ReactNode;
}) {
  const borderColor = error ? RED : focused ? INK : HAIR;
  const labelColor = error ? RED : focused ? INK : MUTE;
  const overTwoThirds = max !== undefined && count !== undefined && count > max * 0.85;
  const counterColor = error
    ? RED
    : overTwoThirds
      ? count! >= max!
        ? RED
        : 'rgba(15,15,15,0.55)'
      : 'rgba(15,15,15,0.55)';

  return (
    <View style={{ marginBottom: 14 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
          marginLeft: 4,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: labelColor,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
            }}
          >
            {label}
          </Text>
          {focused && !error && (
            <View
              style={{
                width: 14,
                height: 2,
                backgroundColor: LIME,
                marginLeft: 8,
                borderRadius: 2,
              }}
            />
          )}
        </View>
        {max !== undefined && count !== undefined ? (
          <Text style={{ fontSize: 11, color: counterColor, fontWeight: '600' }}>
            {count}/{max}
          </Text>
        ) : helper && !error ? (
          <Text style={{ fontSize: 11, color: 'rgba(15,15,15,0.55)' }}>{helper}</Text>
        ) : null}
      </View>
      <View
        style={{
          backgroundColor: 'white',
          borderRadius: 16,
          borderWidth: 1.5,
          borderColor,
          paddingHorizontal: 16,
          paddingVertical: multiline ? 14 : 0,
          minHeight: multiline ? 110 : 56,
          justifyContent: multiline ? 'flex-start' : 'center',
        }}
      >
        {children}
      </View>
      {error && (
        <Text style={{ fontSize: 12, color: RED, marginTop: 6, marginLeft: 4, fontWeight: '600' }}>
          {error}
        </Text>
      )}
    </View>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 18,
        marginBottom: 12,
        marginLeft: 2,
      }}
    >
      <View style={{ width: 18, height: 2, backgroundColor: INK, marginRight: 10, borderRadius: 2 }} />
      <Text
        style={{
          fontSize: 11,
          fontWeight: '800',
          color: INK,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
    </View>
  );
}

type UsernameStatus = 'idle' | 'checking' | 'ok' | 'taken';

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
  const [avatarRemoved, setAvatarRemoved] = useState(false);

  const [saving, setSaving] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [focused, setFocused] = useState<string | null>(null);

  const mounted = useRef(true);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fullNameRef = useRef<TextInput>(null);
  const bioRef = useRef<TextInput>(null);
  const locationRef = useRef<TextInput>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (checkTimer.current) clearTimeout(checkTimer.current);
    };
  }, []);

  useEffect(() => {
    if (profile) {
      setUsername(profile.username ?? '');
      setFullName(profile.full_name ?? '');
      setBio(profile.bio ?? '');
      setLocation(profile.location ?? '');
      setAvatarUri(profile.avatar_url ?? null);
      setAvatarBase64(null);
      setAvatarRemoved(false);
      setUsernameError(null);
      setUsernameStatus('idle');
    }
  }, [profile]);

  const initialSnapshot = useMemo(
    () => ({
      username: (profile?.username ?? '').trim().toLowerCase(),
      fullName: profile?.full_name ?? '',
      bio: profile?.bio ?? '',
      location: profile?.location ?? '',
      avatarUrl: profile?.avatar_url ?? null,
    }),
    [profile],
  );

  const hasNewLocalAvatar = !!(
    avatarUri &&
    (avatarUri.startsWith('file:') ||
      avatarUri.startsWith('content:') ||
      avatarUri.startsWith('data:'))
  );

  const isDirty =
    username.trim().toLowerCase() !== initialSnapshot.username ||
    fullName.trim() !== initialSnapshot.fullName ||
    bio.trim() !== initialSnapshot.bio ||
    location.trim() !== initialSnapshot.location ||
    avatarRemoved ||
    hasNewLocalAvatar;

  const validateUsername = useCallback((raw: string): string | null => {
    const u = raw.trim().toLowerCase();
    if (!u) return 'Username is required';
    if (u.length < 3) return 'At least 3 characters';
    if (u.length > LIMITS.username) return `At most ${LIMITS.username} characters`;
    if (!/^[a-z0-9_.]+$/.test(u)) return 'Lowercase letters, numbers, _ . only';
    if (/^[._]|[._]$/.test(u)) return 'Cannot start or end with _ or .';
    if (/[._]{2,}/.test(u)) return 'No consecutive _ or .';
    return null;
  }, []);

  // Debounced uniqueness check
  useEffect(() => {
    let active = true;
    if (checkTimer.current) clearTimeout(checkTimer.current);
    const candidate = username.trim().toLowerCase();
    const err = validateUsername(candidate);
    if (err) {
      setUsernameStatus('idle');
      return;
    }
    if (candidate === (profile?.username ?? '')) {
      setUsernameStatus('idle');
      setUsernameError(null);
      return;
    }
    if (!user) return;
    setUsernameStatus('checking');
    checkTimer.current = setTimeout(async () => {
      const requestCandidate = candidate;
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', requestCandidate)
        .neq('id', user.id)
        .maybeSingle();
      if (!mounted.current || !active || requestCandidate !== username.trim().toLowerCase() || !user || !profile) return;
      if (error) {
        setUsernameStatus('idle');
        return;
      }
      if (data) {
        setUsernameStatus('taken');
        setUsernameError('Username already taken');
      } else {
        setUsernameStatus('ok');
        setUsernameError(null);
      }
    }, 450);
    return () => {
      active = false;
    };
  }, [username, profile, user, validateUsername]);

  const ensurePermission = useCallback(async (): Promise<boolean> => {
    const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status === 'granted') return true;
    if (!canAskAgain) {
      Alert.alert(
        'Photo access needed',
        'Enable photo library access in Settings to choose a profile picture.',
      );
    } else {
      toast.show('Permission denied', { variant: 'default', icon: 'alert-triangle' });
    }
    return false;
  }, [toast]);

  const pickAvatar = useCallback(async () => {
    tap('light');
    const ok = await ensurePermission();
    if (!ok) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        base64: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (!mounted.current) return;
      setAvatarUri(asset.uri);
      setAvatarBase64(asset.base64 ?? null);
      setAvatarRemoved(false);
    } catch {
      toast.show('Could not open photos', { variant: 'default', icon: 'alert-triangle' });
    }
  }, [ensurePermission, toast]);

  const removeAvatar = useCallback(() => {
    if (!avatarUri && !profile?.avatar_url) return;
    tap('light');
    Alert.alert('Remove photo?', 'Your profile will show your initial instead.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setAvatarUri(null);
          setAvatarBase64(null);
          setAvatarRemoved(true);
        },
      },
    ]);
  }, [avatarUri, profile?.avatar_url]);

  const confirmDiscard = useCallback(() => {
    Alert.alert('Discard changes?', 'Your unsaved changes will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => safeBack() },
    ]);
  }, []);

  // Hardware back guard
  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (isOnboarding) return true; // block back during onboarding
        if (saving) return true; // block back while saving
        if (!isDirty) return false; // allow normal back
        confirmDiscard();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [isDirty, isOnboarding, saving, confirmDiscard]),
  );

  const handleBack = useCallback(() => {
    if (isOnboarding) return;
    if (saving) return;
    if (isDirty) {
      confirmDiscard();
      return;
    }
    safeBack();
  }, [isDirty, isOnboarding, saving, confirmDiscard]);

  const handleSave = useCallback(async () => {
    if (!user || saving) return;
    const err = validateUsername(username);
    if (err) {
      tap('medium');
      setUsernameError(err);
      return;
    }
    if (usernameStatus === 'taken') {
      tap('medium');
      return;
    }
    if (!isOnboarding && !isDirty) {
      safeBack();
      return;
    }
    setUsernameError(null);
    setSaving(true);
    tap('medium');

    try {
      let avatar_url: string | null = profile?.avatar_url ?? null;
      if (avatarRemoved) {
        avatar_url = null;
      } else if (hasNewLocalAvatar) {
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

      if (!mounted.current) return;

      if (error) {
        if (error.code === '23505') {
          setUsernameError('Username already taken');
          setUsernameStatus('taken');
        } else {
          toast.show(error.message ?? 'Could not save', {
            variant: 'default',
            icon: 'alert-triangle',
          });
        }
        return;
      }

      await refreshProfile();
      if (!mounted.current) return;

      toast.show(isOnboarding ? "You're in 🌶️" : 'Profile updated', {
        variant: 'success',
        icon: 'check',
      });

      if (isOnboarding) router.replace('/(tabs)');
      else safeBack();
    } catch (e: any) {
      if (!mounted.current) return;
      toast.show(e?.message ?? 'Something went wrong', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, [
    user,
    saving,
    username,
    fullName,
    bio,
    location,
    avatarRemoved,
    hasNewLocalAvatar,
    avatarUri,
    avatarBase64,
    isOnboarding,
    isDirty,
    profile?.avatar_url,
    refreshProfile,
    toast,
    usernameStatus,
    validateUsername,
  ]);

  if (loading || !profile) {
    return (
      <SafeAreaView
        edges={['top']}
        style={{ flex: 1, backgroundColor: SOFT, alignItems: 'center', justifyContent: 'center' }}
      >
        <ActivityIndicator color={PURPLE} />
      </SafeAreaView>
    );
  }

  const displayName = fullName || username || profile.username || 'U';
  const initial = displayName.trim().charAt(0).toUpperCase() || 'U';
  const showRemove = !!avatarUri || (!!profile.avatar_url && !avatarRemoved);

  const canSave =
    !validateUsername(username) &&
    usernameStatus !== 'taken' &&
    usernameStatus !== 'checking' &&
    (isOnboarding || isDirty);

  const ctaBg = saving ? INK : canSave ? LIME : INK;
  const ctaFg = saving ? 'white' : canSave ? INK : 'white';
  const ctaAccent = saving ? LIME : canSave ? INK : LIME;
  const ctaAccentFg = saving ? INK : canSave ? LIME : INK;
  const ctaLabel = saving
    ? 'Saving…'
    : isOnboarding
      ? 'Get started'
      : isDirty
        ? 'Save changes'
        : 'All saved';

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
            onPress={handleBack}
            disabled={isOnboarding || saving}
            hitSlop={12}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: 'white',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: HAIR,
              opacity: isOnboarding ? 0 : 1,
            }}
          >
            <Feather name="arrow-left" size={18} color={INK} />
          </Pressable>

          <Text
            style={{
              fontSize: 13,
              fontWeight: '700',
              color: INK,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
            }}
          >
            {isOnboarding ? 'Step 1 of 1' : 'Edit Profile'}
          </Text>

          <View style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}>
            {isDirty && !isOnboarding ? (
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: LIME,
                  borderWidth: 1.5,
                  borderColor: INK,
                }}
              />
            ) : null}
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 160 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
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

          {/* Avatar */}
          <View style={{ alignItems: 'center', marginTop: 30, marginBottom: 8 }}>
            <Pressable onPress={pickAvatar} hitSlop={4}>
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
                      transition={150}
                    />
                  ) : (
                    <Text
                      style={{ fontSize: 56, fontWeight: '900', color: INK, letterSpacing: -2 }}
                    >
                      {initial}
                    </Text>
                  )}
                </View>
              </View>
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

            <View style={{ flexDirection: 'row', marginTop: 14, gap: 8 }}>
              <Pressable
                onPress={pickAvatar}
                style={({ pressed }) => ({
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: 'white',
                  borderWidth: 1,
                  borderColor: HAIR,
                  flexDirection: 'row',
                  alignItems: 'center',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Feather name="image" size={13} color={INK} style={{ marginRight: 6 }} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: INK }}>Change</Text>
              </Pressable>
              {showRemove && (
                <Pressable
                  onPress={removeAvatar}
                  style={({ pressed }) => ({
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: 'transparent',
                    borderWidth: 1,
                    borderColor: HAIR,
                    flexDirection: 'row',
                    alignItems: 'center',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Feather name="trash-2" size={13} color={RED} style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: RED }}>Remove</Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Identity */}
          <SectionHeader label="Identity" />

          <FieldShell
            label="Username"
            error={usernameError}
            focused={focused === 'username'}
            count={username.length}
            max={LIMITS.username}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, color: MUTE, marginRight: 2 }}>@</Text>
              <TextInput
                placeholder="ahmad_saleem"
                placeholderTextColor="rgba(15,15,15,0.55)"
                value={username}
                onChangeText={(t) => {
                  const cleaned = t.replace(/\s+/g, '').toLowerCase();
                  setUsername(cleaned.slice(0, LIMITS.username));
                  if (usernameError) setUsernameError(null);
                }}
                onFocus={() => setFocused('username')}
                onBlur={() => {
                  setFocused(null);
                  const err = validateUsername(username);
                  if (err) setUsernameError(err);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => fullNameRef.current?.focus()}
                maxLength={LIMITS.username}
                style={{ flex: 1, fontSize: 16, color: INK, padding: 0 }}
              />
              {usernameStatus === 'checking' && (
                <ActivityIndicator size="small" color={MUTE} style={{ marginLeft: 8 }} />
              )}
              {usernameStatus === 'ok' && (
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: LIME,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: 8,
                  }}
                >
                  <Feather name="check" size={13} color="#FFFFFF" />
                </View>
              )}
              {usernameStatus === 'taken' && (
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: RED,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: 8,
                  }}
                >
                  <Feather name="x" size={13} color="white" />
                </View>
              )}
            </View>
          </FieldShell>

          <FieldShell
            label="Full name"
            focused={focused === 'fullName'}
            count={fullName.length}
            max={LIMITS.fullName}
          >
            <TextInput
              ref={fullNameRef}
              placeholder="Ahmad Saleem"
              placeholderTextColor="rgba(15,15,15,0.55)"
              value={fullName}
              onChangeText={(t) => setFullName(t.slice(0, LIMITS.fullName))}
              onFocus={() => setFocused('fullName')}
              onBlur={() => setFocused(null)}
              maxLength={LIMITS.fullName}
              returnKeyType="next"
              onSubmitEditing={() => bioRef.current?.focus()}
              style={{ fontSize: 16, color: INK, padding: 0 }}
            />
          </FieldShell>

          {/* Story */}
          <SectionHeader label="Story" />

          <FieldShell
            label="Bio"
            multiline
            focused={focused === 'bio'}
            count={bio.length}
            max={LIMITS.bio}
          >
            <TextInput
              ref={bioRef}
              placeholder="A line about your shop"
              placeholderTextColor="rgba(15,15,15,0.55)"
              value={bio}
              onChangeText={(t) => setBio(t.slice(0, LIMITS.bio))}
              onFocus={() => setFocused('bio')}
              onBlur={() => setFocused(null)}
              multiline
              textAlignVertical="top"
              maxLength={LIMITS.bio}
              scrollEnabled={false}
              style={{ fontSize: 16, color: INK, padding: 0, minHeight: 80 }}
            />
          </FieldShell>

          <FieldShell
            label="Location"
            focused={focused === 'location'}
            count={location.length}
            max={LIMITS.location}
          >
            <TextInput
              ref={locationRef}
              placeholder="Karachi"
              placeholderTextColor="rgba(15,15,15,0.55)"
              value={location}
              onChangeText={(t) => setLocation(t.slice(0, LIMITS.location))}
              onFocus={() => setFocused('location')}
              onBlur={() => setFocused(null)}
              maxLength={LIMITS.location}
              returnKeyType="done"
              style={{ fontSize: 16, color: INK, padding: 0 }}
            />
          </FieldShell>

          {/* Account context (read-only) */}
          {!isOnboarding && user?.email && (
            <>
              <SectionHeader label="Account" />
              <View
                style={{
                  backgroundColor: 'white',
                  borderRadius: 16,
                  borderWidth: 1.5,
                  borderColor: HAIR,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: SOFT,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}
                >
                  <Feather name="mail" size={16} color={INK} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: MUTE,
                      letterSpacing: 1.2,
                      textTransform: 'uppercase',
                    }}
                  >
                    Email
                  </Text>
                  <Text
                    style={{ fontSize: 14, fontWeight: '600', color: INK, marginTop: 2 }}
                    numberOfLines={1}
                  >
                    {user.email}
                  </Text>
                </View>
                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor: SOFT,
                  }}
                >
                  <Text
                    style={{ fontSize: 10, fontWeight: '800', color: MUTE, letterSpacing: 1 }}
                  >
                    LOCKED
                  </Text>
                </View>
              </View>
            </>
          )}
        </ScrollView>

        {/* Sticky CTA */}
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
            borderTopColor: 'rgba(15,15,15,0.08)',
          }}
        >
          <Pressable
            onPress={handleSave}
            disabled={saving || !canSave}
            style={({ pressed }) => ({
              height: 58,
              borderRadius: 16,
              backgroundColor: ctaBg,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: saving ? 0.85 : !canSave ? 0.45 : 1,
              transform: [{ scale: pressed && canSave ? 0.985 : 1 }],
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
                backgroundColor: ctaAccent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {saving ? (
                <ActivityIndicator color={ctaAccentFg as string} />
              ) : (
                <Feather
                  name={isOnboarding ? 'arrow-right' : 'check'}
                  size={20}
                  color={ctaAccentFg as string}
                />
              )}
            </View>
            <Text
              style={{
                fontSize: 16,
                fontWeight: '800',
                color: ctaFg as string,
                letterSpacing: 0.2,
                marginRight: 58,
              }}
            >
              {ctaLabel}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
