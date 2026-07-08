import { capture } from '@/lib/analytics';
import { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { safeBack } from '@/lib/nav';
import { RequireAuth } from '@/components/RequireAuth';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { uploadListingImages, deleteListingImages } from '@/lib/upload';
import { cleanPhoto } from '@/lib/photoClean';
import {
  makeSlot, applyResult, toggleSlot, resolveImage, type PhotoSlot,
} from '@/lib/photoClean/slots';
import { useToast } from '@/lib/toast';
import { useTabBarClearance } from '@/lib/responsive';
import { putCachedListing } from '@/lib/listingCache';
import { emitListingCreated } from '@/lib/listingEvents';
import { invalidateFresh } from '@/lib/freshness';
import type { Category, Condition, Gender, Listing } from '@/types';
import { CATEGORIES, hasSubcategories, suggestSubcategory } from '@/lib/categories';

type Step = 'photos' | 'details';

const CONDITIONS: { label: string; value: Condition; hint: string }[] = [
  { label: 'New with tags', value: 'new_with_tags', hint: 'Unworn, original tags attached' },
  { label: 'Like new', value: 'like_new', hint: 'Worn once or twice, no flaws' },
  { label: 'Good', value: 'good', hint: 'Gently used, minor signs of wear' },
  { label: 'Fair', value: 'fair', hint: 'Visible wear, still functional' },
];

const GENDERS: { label: string; value: Gender }[] = [
  { label: 'Women', value: 'women' },
  { label: 'Men', value: 'men' },
  { label: 'Unisex', value: 'unisex' },
];

const MAX_IMAGES = 7;

function StepDots({ current }: { current: 1 | 2 }) {
  return (
    <View className="flex-row items-center" style={{ gap: 6 }}>
      <View
        className={current === 1 ? 'bg-ink' : 'bg-ink-hair'}
        style={{ width: 18, height: 6, borderRadius: 999 }}
      />
      <View
        className={current === 2 ? 'bg-ink' : 'bg-ink-hair'}
        style={{ width: 18, height: 6, borderRadius: 999 }}
      />
    </View>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <Text
      className="text-ink-mute"
      style={{
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        marginBottom: 10,
      }}
    >
      {children}
    </Text>
  );
}

function SellScreenInner() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const { width } = useWindowDimensions();
  // Reserve space for the floating tab bar so the sticky Continue/Publish bar
  // isn't covered by it (the bar is absolutely positioned and overlays content).
  const tabClear = useTabBarClearance();
  const [step, setStep] = useState<Step>('photos');
  const [slots, setSlots] = useState<PhotoSlot[]>([]);
  const [publishing, setPublishing] = useState(false);

  // Details
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [brand, setBrand] = useState('');
  const [size, setSize] = useState('');
  const [condition, setCondition] = useState<Condition>('good');
  const [category, setCategory] = useState<Category>('clothing');
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [subQuery, setSubQuery] = useState('');
  const [gender, setGender] = useState<Gender>('women');

  // Pick a category and clear any subcategory chosen under the previous one.
  const pickCategory = (id: Category) => {
    setCategory(id);
    setSubcategory(null);
    setSubQuery('');
  };

  // Keyword hint from the title (e.g. "nike hoodie" → Clothing ▸ Hoodies).
  // Only surfaced when it points somewhere the seller hasn't already selected.
  const suggestion = useMemo(() => suggestSubcategory(title), [title]);
  const showSuggestion =
    !!suggestion && (suggestion.category !== category || suggestion.sub.id !== subcategory);

  const activeCatDef = useMemo(() => CATEGORIES.find((c) => c.id === category), [category]);
  const filteredSubs = useMemo(() => {
    const subs = activeCatDef?.subs ?? [];
    const q = subQuery.trim().toLowerCase();
    return q ? subs.filter((s) => s.label.toLowerCase().includes(q)) : subs;
  }, [activeCatDef, subQuery]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');

  // 3-col photo grid sized to viewport. Capped so the layout still
  // breathes on tablets / web. Padding 20 each side, 10 gap × 2.
  const tile = useMemo(() => {
    const horizontalPad = 20 * 2;
    const gaps = 10 * 2;
    const usable = Math.min(width, 560) - horizontalPad;
    return Math.floor((usable - gaps) / 3);
  }, [width]);

  const runClean = async (slot: PhotoSlot) => {
    const result = await cleanPhoto(slot.original);
    setSlots((prev) => prev.map((s) => (s.id === slot.id ? applyResult(s, result) : s)));
  };

  const pickImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: MAX_IMAGES,
      base64: true,
    });
    if (!result.canceled) {
      const room = MAX_IMAGES - slots.length;
      const picked = result.assets.slice(0, room);
      const newSlots = picked.map((a) =>
        makeSlot(
          { uri: a.uri, base64: a.base64 ?? null },
          (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`),
        ),
      );
      setSlots((prev) => [...prev, ...newSlots].slice(0, MAX_IMAGES));
      // Concurrency 2: run in pairs so a big batch doesn't freeze the UI.
      (async () => {
        for (let i = 0; i < newSlots.length; i += 2) {
          await Promise.all(newSlots.slice(i, i + 2).map(runClean));
        }
      })().catch(() => {});
    }
  };

  const resetForm = () => {
    setStep('photos');
    setSlots([]);
    setTitle('');
    setPrice('');
    setBrand('');
    setSize('');
    setDescription('');
    setCondition('good');
    setCategory('clothing');
    setSubcategory(null);
    setSubQuery('');
    setGender('women');
    setTags([]);
    setTagDraft('');
  };

  const handleContinue = () => {
    if (slots.length === 0) {
      Alert.alert('Add photos', 'Please add at least one photo of the item.');
      return;
    }
    setStep('details');
  };

  const handlePublish = async () => {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to publish a listing.');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Missing info', 'Please add a title.');
      return;
    }
    const priceNum = parseFloat(price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      Alert.alert('Missing info', 'Enter a valid price.');
      return;
    }
    if (slots.length === 0) {
      Alert.alert('Missing photos', 'Add at least one photo first.');
      return;
    }
    if (hasSubcategories(category) && !subcategory) {
      Alert.alert('Missing info', 'Please choose a subcategory.');
      return;
    }

    setPublishing(true);
    let urls: string[] = [];
    try {
      const chosen = slots.map(resolveImage);
      urls = await uploadListingImages(chosen, user.id);

      const { data, error } = await supabase
        .from('listings')
        .insert({
          seller_id: user.id,
          title: title.trim(),
          description: description.trim() || null,
          price: priceNum,
          category,
          subcategory: subcategory || null,
          gender,
          brand: brand.trim() || null,
          size: size.trim() || null,
          condition,
          images: urls,
          is_sold: false,
          tags,
        })
        .select('id')
        .single();

      if (error) {
        await deleteListingImages(urls);
        throw error;
      }

      const newId = data!.id as string;

      // Seed cache + broadcast before navigating so the product page
      // and home feed reflect the new listing without a fetch race.
      // Build seller explicitly so the cached listing always conforms to
      // Listing['seller'] even if `profile` is sparse (e.g. a brand-new
      // signup that hasn't filled in rating/total_sales yet).
      const sellerSeed: Listing['seller'] = {
        id: user.id,
        username: profile?.username ?? '',
        avatar_url: profile?.avatar_url ?? null,
        full_name: profile?.full_name ?? '',
        bio: profile?.bio ?? null,
        location: profile?.location ?? null,
        rating: profile?.rating ?? 0,
        total_sales: profile?.total_sales ?? 0,
        created_at: profile?.created_at ?? new Date().toISOString(),
      };

      const newListing: Listing = {
        id: newId,
        seller_id: user.id,
        seller: sellerSeed,
        title: title.trim(),
        description: description.trim(),
        price: priceNum,
        category,
        subcategory: subcategory || null,
        gender,
        brand: brand.trim() || null,
        size: size.trim() || null,
        condition,
        images: urls,
        is_sold: false,
        views: 0,
        likes: 0,
        tags,
        created_at: new Date().toISOString(),
      };
      putCachedListing(newListing);
      emitListingCreated(newListing);
      // Force every cached feed to refetch on next focus so the new listing
      // shows up across Discover / My Feed, not just the home feed.
      invalidateFresh();
      capture('listing_created', { listing_id: newListing.id, category: newListing.category, price: newListing.price });

      resetForm();
      toast.show('Listing is live', { variant: 'success', icon: 'check' });
      router.push(`/product/${newId}`);
    } catch (e: any) {
      Alert.alert('Could not publish', e?.message ?? 'Unknown error');
    } finally {
      setPublishing(false);
    }
  };

  // ── Step 1 — photos ──────────────────────────────────────────────────
  if (step === 'photos') {
    const canContinue = slots.length > 0;
    const showAddSlot = slots.length < MAX_IMAGES;

    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-white">
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pt-3 pb-3">
          <Pressable
            onPress={() => safeBack()}
            hitSlop={12}
            style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
          >
            <Feather name="arrow-left" size={24} color="#0F0F0F" />
          </Pressable>
          <StepDots current={1} />
          <View style={{ width: 24 }} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }}
          >
            {/* Hero */}
            <Text
              className="text-ink"
              style={{ fontSize: 30, fontWeight: '800', letterSpacing: -0.6, lineHeight: 36, marginTop: 6 }}
            >
              Add photos
            </Text>
            <Text
              className="text-ink-mute"
              style={{ fontSize: 15, lineHeight: 22, marginTop: 8, maxWidth: 320 }}
            >
              Clear, well-lit photos sell faster. Show the front, back, label, and any details.
            </Text>

            {/* Photo grid */}
            <View style={{ marginTop: 24 }}>
              <View className="flex-row items-center justify-between" style={{ marginBottom: 12 }}>
                <Eyebrow>Photos</Eyebrow>
                <Text className="text-ink-mute" style={{ fontSize: 12, fontWeight: '600' }}>
                  {slots.length} / {MAX_IMAGES}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {slots.map((slot, i) => (
                  <View key={slot.id} style={{ width: tile, height: tile, position: 'relative' }}>
                    <Image
                      source={{ uri: resolveImage(slot).uri }}
                      style={{ width: '100%', height: '100%', borderRadius: 14 }}
                      className="bg-ink-panel"
                      contentFit="cover"
                    />
                    {i === 0 && (
                      <View
                        className="bg-primary"
                        style={{
                          position: 'absolute',
                          top: 8,
                          left: 8,
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 999,
                        }}
                      >
                        <Text style={{ color: 'white', fontSize: 10, fontWeight: '800', letterSpacing: 0.4 }}>
                          COVER
                        </Text>
                      </View>
                    )}
                    <Pressable
                      onPress={() => setSlots((prev) => prev.filter((s) => s.id !== slot.id))}
                      hitSlop={8}
                      style={({ pressed }) => ({
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        width: 24,
                        height: 24,
                        borderRadius: 999,
                        backgroundColor: 'rgba(15,15,15,0.78)',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Feather name="x" size={13} color="white" />
                    </Pressable>
                    {slot.status === 'processing' && (
                      <View style={{ position: 'absolute', bottom: 6, left: 6, right: 6, alignItems: 'center' }}>
                        <View style={{ backgroundColor: 'rgba(15,15,15,0.72)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <ActivityIndicator size="small" color="#FFFFFF" />
                          <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>Cleaning…</Text>
                        </View>
                      </View>
                    )}
                    {slot.status === 'done' && slot.cleaned && (
                      <Pressable
                        onPress={() => setSlots((prev) => prev.map((s) => (s.id === slot.id ? toggleSlot(s) : s)))}
                        hitSlop={6}
                        style={{ position: 'absolute', bottom: 6, left: 6, backgroundColor: slot.useCleaned ? '#6C47FF' : 'rgba(15,15,15,0.72)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}
                      >
                        <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 }}>
                          {slot.useCleaned ? 'CLEANED' : 'ORIGINAL'}
                        </Text>
                      </Pressable>
                    )}
                    {slot.status === 'failed' && (
                      <View style={{ position: 'absolute', bottom: 6, left: 6, backgroundColor: 'rgba(15,15,15,0.72)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>Original</Text>
                      </View>
                    )}
                  </View>
                ))}

                {showAddSlot && (
                  <Pressable
                    onPress={pickImages}
                    style={({ pressed }) => ({
                      width: tile,
                      height: tile,
                      borderRadius: 14,
                      borderWidth: 1.5,
                      borderStyle: 'dashed',
                      borderColor: slots.length === 0 ? '#6C47FF' : 'rgba(15,15,15,0.18)',
                      backgroundColor:
                        slots.length === 0 ? 'rgba(108,71,255,0.06)' : 'rgba(15,15,15,0.02)',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transform: [{ scale: pressed ? 0.97 : 1 }],
                    })}
                  >
                    <View
                      className={slots.length === 0 ? 'bg-primary' : 'bg-ink-panel'}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 999,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 8,
                      }}
                    >
                      <Feather
                        name="plus"
                        size={18}
                        color={slots.length === 0 ? '#FFFFFF' : '#0F0F0F'}
                      />
                    </View>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: slots.length === 0 ? '#6C47FF' : 'rgba(15,15,15,0.62)',
                      }}
                    >
                      {slots.length === 0 ? 'Add cover' : 'Add'}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>

            {/* Quick tips */}
            <View style={{ marginTop: 24 }}>
              <Eyebrow>Tips for fast sales</Eyebrow>
              {[
                { icon: 'sun' as const, text: 'Shoot in natural daylight' },
                { icon: 'maximize' as const, text: 'Fill the frame with the item' },
                { icon: 'eye' as const, text: 'Include label, size, and any flaws' },
              ].map((t) => (
                <View
                  key={t.text}
                  className="flex-row items-center"
                  style={{ paddingVertical: 10 }}
                >
                  <View
                    className="bg-primary-soft"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                    }}
                  >
                    <Feather name={t.icon} size={13} color="#6C47FF" />
                  </View>
                  <Text className="text-ink" style={{ fontSize: 14 }}>
                    {t.text}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Sticky bottom bar */}
        <View
          className="bg-white border-t border-ink-hair"
          style={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: tabClear,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text className="text-ink-mute" style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>
              STEP 1 OF 2
            </Text>
            <Text className="text-ink" style={{ fontSize: 14, fontWeight: '600', marginTop: 2 }}>
              {slots.length === 0
                ? 'Add at least one photo'
                : `${slots.length} photo${slots.length === 1 ? '' : 's'} ready`}
            </Text>
          </View>
          <Pressable
            onPress={handleContinue}
            disabled={!canContinue}
            style={({ pressed }) => ({
              backgroundColor: canContinue ? '#0F0F0F' : 'rgba(15,15,15,0.12)',
              paddingHorizontal: 22,
              height: 52,
              borderRadius: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              transform: [{ scale: pressed && canContinue ? 0.97 : 1 }],
            })}
          >
            <Text
              style={{
                color: canContinue ? '#FFFFFF' : 'rgba(15,15,15,0.45)',
                fontSize: 15,
                fontWeight: '700',
              }}
            >
              Continue
            </Text>
            <Feather
              name="arrow-right"
              size={16}
              color={canContinue ? '#FFFFFF' : 'rgba(15,15,15,0.45)'}
            />
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Step 2 — details ─────────────────────────────────────────────────
  const canPublish =
    title.trim().length > 0 &&
    parseFloat(price) > 0 &&
    slots.length > 0 &&
    (!hasSubcategories(category) || !!subcategory);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-3 pb-3">
        <Pressable
          onPress={() => setStep('photos')}
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
        >
          <Feather name="arrow-left" size={24} color="#0F0F0F" />
        </Pressable>
        <StepDots current={2} />
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text
            className="text-ink"
            style={{ fontSize: 30, fontWeight: '800', letterSpacing: -0.6, lineHeight: 36, marginTop: 6 }}
          >
            Listing details
          </Text>
          <Text
            className="text-ink-mute"
            style={{ fontSize: 15, lineHeight: 22, marginTop: 8, maxWidth: 320 }}
          >
            A clear title and the right category help buyers find your item.
          </Text>

          {/* Photo strip */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: 22, marginHorizontal: -20 }}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
          >
            {slots.map((slot, i) => (
              <View key={slot.id} style={{ position: 'relative' }}>
                <Image
                  source={{ uri: resolveImage(slot).uri }}
                  style={{ width: 64, height: 64, borderRadius: 12 }}
                  className="bg-ink-panel"
                  contentFit="cover"
                />
                {i === 0 && (
                  <View
                    className="bg-primary"
                    style={{
                      position: 'absolute',
                      bottom: -4,
                      left: -4,
                      paddingHorizontal: 5,
                      paddingVertical: 2,
                      borderRadius: 999,
                    }}
                  >
                    <Text style={{ color: 'white', fontSize: 8, fontWeight: '800', letterSpacing: 0.3 }}>
                      COVER
                    </Text>
                  </View>
                )}
              </View>
            ))}
            <Pressable
              onPress={() => setStep('photos')}
              style={({ pressed }) => ({
                width: 64,
                height: 64,
                borderRadius: 12,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: 'rgba(15,15,15,0.18)',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Feather name="edit-2" size={14} color="rgba(15,15,15,0.62)" />
            </Pressable>
          </ScrollView>

          {/* Section: Basics */}
          <View style={{ marginTop: 32 }}>
            <Eyebrow>Basics</Eyebrow>

            {/* Title */}
            <View
              className="border border-ink-hair"
              style={{ borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10 }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(15,15,15,0.45)', letterSpacing: 0.4 }}>
                TITLE
              </Text>
              <TextInput
                style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: '#0F0F0F',
                  paddingVertical: 4,
                  marginTop: 2,
                  outlineStyle: 'none',
                  outlineWidth: 0,
                  borderWidth: 0,
                } as any}
                placeholder="e.g. Zara floral midi dress"
                placeholderTextColor="rgba(15,15,15,0.35)"
                value={title}
                onChangeText={setTitle}
              />
            </View>

            {/* Brand */}
            <View
              className="border border-ink-hair"
              style={{ borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10 }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(15,15,15,0.45)', letterSpacing: 0.4 }}>
                BRAND <Text style={{ color: 'rgba(15,15,15,0.35)' }}>(optional)</Text>
              </Text>
              <TextInput
                style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: '#0F0F0F',
                  paddingVertical: 4,
                  marginTop: 2,
                  outlineStyle: 'none',
                  outlineWidth: 0,
                  borderWidth: 0,
                } as any}
                placeholder="e.g. Zara, Nike, Khaadi"
                placeholderTextColor="rgba(15,15,15,0.35)"
                value={brand}
                onChangeText={setBrand}
              />
            </View>

            {/* Price — hero input */}
            <View
              className="border border-ink-hair"
              style={{
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 12,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(15,15,15,0.45)', letterSpacing: 0.4 }}>
                  PRICE
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 2 }}>
                  <Text className="text-primary" style={{ fontSize: 26, fontWeight: '800', marginRight: 4 }}>
                    $
                  </Text>
                  <TextInput
                    style={{
                      fontSize: 26,
                      fontWeight: '800',
                      color: '#0F0F0F',
                      flex: 1,
                      paddingVertical: 0,
                      outlineStyle: 'none',
                      outlineWidth: 0,
                      borderWidth: 0,
                    } as any}
                    placeholder="0"
                    placeholderTextColor="rgba(15,15,15,0.25)"
                    keyboardType="decimal-pad"
                    value={price}
                    onChangeText={setPrice}
                  />
                </View>
              </View>
              <Text
                className="text-ink-mute"
                style={{ fontSize: 12, fontWeight: '600' }}
              >
                USD
              </Text>
            </View>
          </View>

          {/* Section: Category */}
          <View style={{ marginTop: 32 }}>
            <Eyebrow>Category</Eyebrow>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {CATEGORIES.map((c) => {
                const active = category === c.id;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => pickCategory(c.id)}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active ? '#0F0F0F' : 'rgba(15,15,15,0.08)',
                      backgroundColor: active ? '#0F0F0F' : '#FFFFFF',
                      transform: [{ scale: pressed ? 0.97 : 1 }],
                    })}
                  >
                    <Feather name={c.icon} size={13} color={active ? '#FFFFFF' : '#0F0F0F'} />
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: active ? '#FFFFFF' : '#0F0F0F',
                      }}
                    >
                      {c.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Title-based suggestion — one tap to accept the inferred cat ▸ sub. */}
            {showSuggestion ? (
              <Pressable
                onPress={() => {
                  setCategory(suggestion!.category);
                  setSubcategory(suggestion!.sub.id);
                  setSubQuery('');
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  alignSelf: 'flex-start',
                  marginTop: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: 'rgba(108,71,255,0.10)',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Feather name="zap" size={12} color="#6C47FF" />
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: '#6C47FF' }}>
                  Suggested: {CATEGORIES.find((c) => c.id === suggestion!.category)?.label} ▸{' '}
                  {suggestion!.sub.label}
                </Text>
              </Pressable>
            ) : null}

            {/* Subcategory picker — required when the category defines subs. */}
            {activeCatDef && activeCatDef.subs.length > 0 ? (
              <View style={{ marginTop: 22 }}>
                <Eyebrow>Subcategory</Eyebrow>
                {activeCatDef.subs.length > 8 ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      borderWidth: 1,
                      borderColor: 'rgba(15,15,15,0.08)',
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      height: 42,
                      marginBottom: 12,
                    }}
                  >
                    <Feather name="search" size={15} color="rgba(15,15,15,0.45)" />
                    <TextInput
                      value={subQuery}
                      onChangeText={setSubQuery}
                      placeholder={`Search ${activeCatDef.label.toLowerCase()}`}
                      placeholderTextColor="rgba(15,15,15,0.4)"
                      style={{ flex: 1, fontSize: 14, color: '#0F0F0F' }}
                    />
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {filteredSubs.map((s) => {
                    const active = subcategory === s.id;
                    return (
                      <Pressable
                        key={s.id}
                        onPress={() => setSubcategory(s.id)}
                        style={({ pressed }) => ({
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: active ? '#6C47FF' : 'rgba(15,15,15,0.08)',
                          backgroundColor: active ? '#6C47FF' : '#FFFFFF',
                          transform: [{ scale: pressed ? 0.97 : 1 }],
                        })}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '600',
                            color: active ? '#FFFFFF' : '#0F0F0F',
                          }}
                        >
                          {s.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                  {filteredSubs.length === 0 ? (
                    <Text style={{ fontSize: 13, color: 'rgba(15,15,15,0.45)', paddingVertical: 6 }}>
                      No matches
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* Gender segmented */}
            <View
              className="bg-ink-panel"
              style={{
                marginTop: 16,
                padding: 4,
                borderRadius: 14,
                flexDirection: 'row',
              }}
            >
              {GENDERS.map((g) => {
                const active = gender === g.value;
                return (
                  <Pressable
                    key={g.value}
                    onPress={() => setGender(g.value)}
                    style={({ pressed }) => ({
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 10,
                      alignItems: 'center',
                      backgroundColor: active ? '#FFFFFF' : 'transparent',
                      boxShadow: active ? '0px 1px 2px rgba(0,0,0,0.06)' : undefined,
                      transform: [{ scale: pressed ? 0.98 : 1 }],
                    })}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: active ? '700' : '500',
                        color: active ? '#0F0F0F' : 'rgba(15,15,15,0.62)',
                      }}
                    >
                      {g.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Section: Condition */}
          <View style={{ marginTop: 32 }}>
            <Eyebrow>Condition</Eyebrow>
            <View style={{ gap: 8 }}>
              {CONDITIONS.map((c) => {
                const active = condition === c.value;
                return (
                  <Pressable
                    key={c.value}
                    onPress={() => setCondition(c.value)}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: 14,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: active ? '#6C47FF' : 'rgba(15,15,15,0.08)',
                      backgroundColor: active ? 'rgba(108,71,255,0.06)' : '#FFFFFF',
                      transform: [{ scale: pressed ? 0.99 : 1 }],
                    })}
                  >
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 999,
                        borderWidth: 2,
                        borderColor: active ? '#6C47FF' : 'rgba(15,15,15,0.18)',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 12,
                      }}
                    >
                      {active && (
                        <View
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 999,
                            backgroundColor: '#6C47FF',
                          }}
                        />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        className="text-ink"
                        style={{ fontSize: 14, fontWeight: '700' }}
                      >
                        {c.label}
                      </Text>
                      <Text
                        className="text-ink-mute"
                        style={{ fontSize: 12, marginTop: 1 }}
                      >
                        {c.hint}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Section: Details */}
          <View style={{ marginTop: 32 }}>
            <Eyebrow>More details</Eyebrow>

            {/* Size */}
            <View
              className="border border-ink-hair"
              style={{ borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10 }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(15,15,15,0.45)', letterSpacing: 0.4 }}>
                SIZE <Text style={{ color: 'rgba(15,15,15,0.35)' }}>(optional)</Text>
              </Text>
              <TextInput
                style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: '#0F0F0F',
                  paddingVertical: 4,
                  marginTop: 2,
                  outlineStyle: 'none',
                  outlineWidth: 0,
                  borderWidth: 0,
                } as any}
                placeholder="e.g. S, M, L, 42, Free"
                placeholderTextColor="rgba(15,15,15,0.35)"
                value={size}
                onChangeText={setSize}
              />
            </View>

            {/* Description */}
            <View
              className="border border-ink-hair"
              style={{ borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10 }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(15,15,15,0.45)', letterSpacing: 0.4 }}>
                DESCRIPTION <Text style={{ color: 'rgba(15,15,15,0.35)' }}>(optional)</Text>
              </Text>
              <TextInput
                style={{
                  fontSize: 15,
                  color: '#0F0F0F',
                  paddingVertical: 4,
                  marginTop: 2,
                  minHeight: 88,
                  outlineStyle: 'none',
                  outlineWidth: 0,
                  borderWidth: 0,
                } as any}
                placeholder="Condition details, measurements, fit, why you're selling…"
                placeholderTextColor="rgba(15,15,15,0.35)"
                value={description}
                onChangeText={setDescription}
                multiline
                textAlignVertical="top"
              />
            </View>

            {/* Tags */}
            <View
              className="border border-ink-hair"
              style={{ borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(15,15,15,0.45)', letterSpacing: 0.4 }}>
                TAGS <Text style={{ color: 'rgba(15,15,15,0.35)' }}>(up to 10)</Text>
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 6,
                  alignItems: 'center',
                  marginTop: 6,
                  minHeight: 32,
                }}
              >
                {tags.map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => setTags((prev) => prev.filter((x) => x !== t))}
                    style={{
                      backgroundColor: '#6C47FF',
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: 'white' }}>#{t}</Text>
                    <Feather name="x" size={11} color="white" />
                  </Pressable>
                ))}
                <TextInput
                  value={tagDraft}
                  onChangeText={(text) => {
                    if (/[ ,]$/.test(text)) {
                      const raw = text.trim().replace(/[,#]/g, '').toLowerCase();
                      if (raw && !tags.includes(raw) && tags.length < 10) {
                        setTags((prev) => [...prev, raw]);
                      }
                      setTagDraft('');
                    } else {
                      setTagDraft(text);
                    }
                  }}
                  onSubmitEditing={() => {
                    const raw = tagDraft.trim().replace(/[,#]/g, '').toLowerCase();
                    if (raw && !tags.includes(raw) && tags.length < 10) {
                      setTags((prev) => [...prev, raw]);
                    }
                    setTagDraft('');
                  }}
                  onKeyPress={(e) => {
                    if (e.nativeEvent.key === 'Backspace' && tagDraft.length === 0 && tags.length > 0) {
                      setTags((prev) => prev.slice(0, -1));
                    }
                  }}
                  placeholder={tags.length === 0 ? 'e.g. vintage denim oversized' : 'add tag…'}
                  placeholderTextColor="rgba(15,15,15,0.35)"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  style={{
                    flexGrow: 1,
                    minWidth: 80,
                    fontSize: 14,
                    color: '#0F0F0F',
                    padding: 0,
                    outlineStyle: 'none',
                    outlineWidth: 0,
                    borderWidth: 0,
                  } as any}
                />
              </View>
            </View>
            <Text className="text-ink-mute" style={{ fontSize: 11, marginTop: 6 }}>
              Press space, comma, or return to add a tag.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky publish */}
      <View
        className="bg-white border-t border-ink-hair"
        style={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: tabClear,
        }}
      >
        <Pressable
          onPress={handlePublish}
          disabled={publishing || !canPublish}
          accessibilityRole="button"
          accessibilityLabel={publishing ? 'Publishing listing' : 'Publish listing'}
          accessibilityHint={canPublish ? 'Posts your item to the marketplace' : 'Add a title, price, and at least one photo to continue'}
          accessibilityState={{ disabled: publishing || !canPublish, busy: publishing }}
          style={({ pressed }) => ({
            height: 58,
            borderRadius: 16,
            backgroundColor: canPublish ? '#0F0F0F' : 'rgba(15,15,15,0.12)',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: publishing ? 0.7 : 1,
            transform: [{ scale: pressed && canPublish ? 0.985 : 1 }],
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
              backgroundColor: canPublish ? '#6C47FF' : 'rgba(15,15,15,0.18)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {publishing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Feather name="arrow-up-right" size={20} color="#FFFFFF" />
            )}
          </View>
          <Text
            style={{
              fontSize: 16,
              fontWeight: '800',
              color: canPublish ? '#FFFFFF' : 'rgba(15,15,15,0.45)',
              letterSpacing: 0.2,
              marginRight: 58,
            }}
          >
            {publishing ? 'Publishing…' : 'Publish listing'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export default function SellScreen() {
  return (
    <RequireAuth>
      <SellScreenInner />
    </RequireAuth>
  );
}
