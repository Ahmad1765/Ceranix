// Sell form, presented as a full-screen Modal — same primitive as OfferSheet /
// GuestGate (`<Modal animationType="slide">`), not an expo-router Stack screen.
// Mounted once at the root (see app/_layout.tsx) and driven app-wide via
// useSellSheet().open(): tapping the Sell tab, or any "Post an item" CTA,
// calls open() instead of navigating, so the form slides up over whatever
// screen is currently showing and leaves the tab bar's active tab untouched
// underneath — exactly like the Offer button's sheet on the product page.
import {
  createContext, useCallback, useContext, useMemo, useState, type ReactNode,
} from 'react';
import { capture } from '@/lib/analytics';
import { View, Pressable, ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, useWindowDimensions, Modal } from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { uploadListingImages, deleteListingImages } from '@/lib/upload';
import {
  makeSlot, resolveImage, type PhotoSlot,
} from '@/lib/photoClean/slots';
import { useToast } from '@/lib/toast';
import { putCachedListing } from '@/lib/listingCache';
import { emitListingCreated } from '@/lib/listingEvents';
import { invalidateFresh } from '@/lib/freshness';
import { router } from 'expo-router';
import type { Category, Condition, Gender, Listing } from '@/types';
import { CATEGORIES, categoryLabel, hasSubcategories, subcategoryLabel, suggestSubcategory } from '@/lib/categories';
import { formatPrice } from '@/lib/currency';
import { itemColorLabel } from '@/lib/itemColors';
import { SafetyBanner } from '@/components/SafetyBanner';
import { colors, radii, type } from '@/lib/theme';
import { SELL_TEAL, SELL_TEAL_DARK, SELL_TEAL_SOFT } from '@/components/sell/theme';
import {
  SingleSelectSheet, TextFieldSheet, PriceSheet, ColorSheet, CategorySheet, TagsSheet,
  type SelectOption,
} from '@/components/sell/PickerSheets';

const DISPLAY_BOLD = type.family.sansBold;

const CONDITIONS: SelectOption<Condition>[] = [
  { label: 'New with tags', value: 'new_with_tags', hint: 'Unworn, original tags attached' },
  { label: 'Like new', value: 'like_new', hint: 'Worn once or twice, no flaws' },
  { label: 'Good', value: 'good', hint: 'Gently used, minor signs of wear' },
  { label: 'Fair', value: 'fair', hint: 'Visible wear, still functional' },
];

const GENDERS: SelectOption<Gender>[] = [
  { label: 'Women', value: 'women' },
  { label: 'Men', value: 'men' },
  { label: 'Unisex', value: 'unisex' },
];

type ParcelSize = 'small' | 'medium' | 'large';
const PARCEL_SIZES: SelectOption<ParcelSize>[] = [
  { value: 'small', label: 'Small', hint: 'Fits in a shoebox — accessories, small electronics' },
  { value: 'medium', label: 'Medium', hint: 'Fits in a shopping bag — tops, shoes, folded clothing' },
  { value: 'large', label: 'Large', hint: 'Larger than a shopping bag — coats, bulky items' },
];

const MAX_IMAGES = 7;
const TITLE_MAX = 80;
const DESCRIPTION_MAX = 1000;

type ActiveSheet =
  | 'category' | 'brand' | 'size' | 'condition' | 'colors' | 'gender' | 'tags'
  | 'price' | 'parcel' | null;

// ── Context ──────────────────────────────────────────────────────────────
type SellSheetApi = { open: () => void };
const Ctx = createContext<SellSheetApi | undefined>(undefined);

export function useSellSheet(): SellSheetApi {
  const ctx = useContext(Ctx);
  // Soft fallback outside the provider: keep old behaviour (route to auth).
  if (!ctx) return { open: () => router.push('/auth/login') };
  return ctx;
}

export function SellSheetProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [visible, setVisible] = useState(false);

  const open = useCallback(() => {
    if (!session) {
      router.push('/auth/login');
      return;
    }
    setVisible(true);
  }, [session]);

  const close = useCallback(() => setVisible(false), []);

  const api = useMemo(() => ({ open }), [open]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {/* Android edge-to-edge (mandatory from Expo SDK 54) needs BOTH translucency
          flags, or the modal window stops at the navigation bar and this
          "full screen" sheet renders short while web looks correct. */}
      <Modal
        visible={visible}
        animationType="slide"
        onRequestClose={close}
        statusBarTranslucent
        navigationBarTranslucent
      >
        {/* SellForm's <SafeAreaView edges={['top','bottom']}> measures against the
            nearest provider, and the app-root one lives outside this modal's
            window — so without a provider in here it reads zeros on Android and
            the form runs under the status and gesture bars. initialMetrics seeds
            the first frame with real insets so nothing jumps mid slide-up.
            Same fix as DiscoverSheet; see its header note. */}
        {visible ? (
          <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <SellForm onClose={close} />
          </SafeAreaProvider>
        ) : null}
      </Modal>
    </Ctx.Provider>
  );
}

// ── Small presentational pieces ─────────────────────────────────────────────
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontSize: 15.5,
        fontFamily: DISPLAY_BOLD,
        color: colors.ink,
        letterSpacing: -0.1,
        paddingHorizontal: 20,
        paddingTop: 22,
        paddingBottom: 12,
      }}
    >
      {children}
    </Text>
  );
}

function SectionDivider() {
  return <View style={{ height: 8, backgroundColor: colors.panel, marginTop: 16 }} />;
}

function RowField({
  label,
  value,
  placeholder,
  onPress,
}: {
  label: string;
  value: string;
  placeholder: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: colors.hairline,
        backgroundColor: pressed ? colors.panel : colors.white,
      })}
    >
      <Text style={{ fontSize: 14.5, fontFamily: DISPLAY_BOLD, color: colors.ink }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, marginLeft: 12 }}>
        <Text
          numberOfLines={1}
          style={{ fontSize: 14, color: value ? colors.mute : colors.muteSoft, flexShrink: 1 }}
        >
          {value || placeholder}
        </Text>
        <Feather name="chevron-right" size={17} color={colors.muteSoft} />
      </View>
    </Pressable>
  );
}

function UnderlineField({
  label,
  placeholder,
  value,
  onChangeText,
  multiline,
  maxLength,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  multiline?: boolean;
  maxLength?: number;
}) {
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: multiline ? 20 : 14 }}>
      <Text style={{ fontSize: 13, color: colors.mute, marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muteSoft}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        maxLength={maxLength}
        style={
          {
            fontSize: 15.5,
            color: colors.ink,
            paddingBottom: 10,
            minHeight: multiline ? 90 : undefined,
            borderBottomWidth: 1,
            borderBottomColor: colors.hairline,
            outlineStyle: 'none',
            outlineWidth: 0,
          } as any
        }
      />
    </View>
  );
}

// ── The form itself ──────────────────────────────────────────────────────
function SellForm({ onClose }: { onClose: () => void }) {
  const { user, profile } = useAuth();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const [slots, setSlots] = useState<PhotoSlot[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [brand, setBrand] = useState('');
  const [size, setSize] = useState('');
  const [condition, setCondition] = useState<Condition>('good');
  const [category, setCategory] = useState<Category>('clothing');
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [gender, setGender] = useState<Gender>('women');
  const [tags, setTags] = useState<string[]>([]);
  const [parcelSize, setParcelSize] = useState<ParcelSize | null>(null);

  const suggestion = useMemo(() => suggestSubcategory(title), [title]);
  const showSuggestion =
    !!suggestion && (suggestion.category !== category || suggestion.sub.id !== subcategory);

  const tile = useMemo(() => {
    const pagePad = 20 * 2;
    const boxPad = 14 * 2;
    const gaps = 10 * 2;
    const usable = Math.min(width, 560) - pagePad - boxPad;
    return Math.floor((usable - gaps) / 3);
  }, [width]);

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
      const newSlots = picked.map((a) => ({
        ...makeSlot(
          { uri: a.uri, base64: a.base64 ?? null },
          (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`),
        ),
        status: 'done' as const,
      }));
      setSlots((prev) => [...prev, ...newSlots].slice(0, MAX_IMAGES));
    }
  };

  const resetForm = () => {
    setSlots([]);
    setTitle('');
    setDescription('');
    setPrice('');
    setBrand('');
    setSize('');
    setCondition('good');
    setCategory('clothing');
    setSubcategory(null);
    setColor(null);
    setGender('women');
    setTags([]);
    setParcelSize(null);
  };

  const canPublish =
    title.trim().length > 0 &&
    parseFloat(price) > 0 &&
    slots.length > 0 &&
    (!hasSubcategories(category) || !!subcategory);

  const handlePublish = async () => {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to publish a listing.');
      return;
    }
    if (slots.length === 0) {
      Alert.alert('Add photos', 'Please add at least one photo of the item.');
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
    if (hasSubcategories(category) && !subcategory) {
      Alert.alert('Missing info', 'Please choose a category.');
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
          color: color || null,
          gender,
          brand: brand.trim() || null,
          size: size.trim() || null,
          condition,
          parcel_size: parcelSize,
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
        color: color || null,
        gender,
        brand: brand.trim() || null,
        size: size.trim() || null,
        condition,
        parcel_size: parcelSize,
        images: urls,
        is_sold: false,
        views: 0,
        likes: 0,
        tags,
        created_at: new Date().toISOString(),
      };
      putCachedListing(newListing);
      emitListingCreated(newListing);
      invalidateFresh();
      capture('listing_created', { listing_id: newListing.id, category: newListing.category, price: newListing.price });

      resetForm();
      toast.show('Listing is live', { variant: 'success', icon: 'check' });
      onClose();
      router.push(`/product/${newId}`);
    } catch (e: any) {
      Alert.alert('Could not publish', e?.message ?? 'Unknown error');
    } finally {
      setPublishing(false);
    }
  };

  // A category with subcategories (e.g. Clothing) isn't actually "set" until
  // one is picked — canPublish requires it. Showing the top-level label here
  // regardless made the row look complete when it wasn't, so Upload silently
  // stayed disabled with no visible reason. Fall back to the placeholder
  // until there's a real subcategory (or the category has none to pick).
  const categoryValue = subcategory
    ? subcategoryLabel(category, subcategory)
    : hasSubcategories(category)
      ? ''
      : categoryLabel(category);

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-white">
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: colors.hairline,
        }}
      >
        <Pressable
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
        >
          <Feather name="x" size={22} color={colors.ink} />
        </Pressable>
        <Text style={{ fontSize: 16, fontFamily: DISPLAY_BOLD, color: colors.ink }}>Sell an item</Text>
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 32 }}
        >
          {/* Photos */}
          <SectionHeader>Photos</SectionHeader>
          <View style={{ paddingHorizontal: 20 }}>
            <View
              style={{
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: colors.hairline,
                borderRadius: radii.lg,
                padding: slots.length === 0 ? 0 : 14,
                minHeight: slots.length === 0 ? 128 : undefined,
                alignItems: slots.length === 0 ? 'center' : undefined,
                justifyContent: slots.length === 0 ? 'center' : undefined,
              }}
            >
              {slots.length === 0 ? (
                <Pressable
                  onPress={pickImages}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingHorizontal: 22,
                    paddingVertical: 13,
                    borderRadius: radii.pill,
                    borderWidth: 1.5,
                    borderColor: SELL_TEAL,
                    backgroundColor: colors.white,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  })}
                >
                  <Feather name="plus" size={18} color={SELL_TEAL} />
                  <Text style={{ fontSize: 15, fontFamily: DISPLAY_BOLD, color: SELL_TEAL }}>
                    Upload photos
                  </Text>
                </Pressable>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {slots.map((slot, i) => (
                    <View key={slot.id} style={{ width: tile, height: tile, position: 'relative' }}>
                      <Image
                        source={{ uri: resolveImage(slot).uri }}
                        style={{ width: '100%', height: '100%', borderRadius: 12 }}
                        className="bg-ink-panel"
                        contentFit="cover"
                      />
                      {i === 0 && (
                        <View
                          style={{
                            position: 'absolute',
                            top: 6,
                            left: 6,
                            paddingHorizontal: 7,
                            paddingVertical: 3,
                            borderRadius: radii.pill,
                            backgroundColor: SELL_TEAL,
                          }}
                        >
                          <Text style={{ color: colors.white, fontSize: 9, fontFamily: DISPLAY_BOLD, letterSpacing: 0.4 }}>
                            COVER
                          </Text>
                        </View>
                      )}
                      <Pressable
                        onPress={() => setSlots((prev) => prev.filter((s) => s.id !== slot.id))}
                        hitSlop={8}
                        style={({ pressed }) => ({
                          position: 'absolute',
                          top: 5,
                          right: 5,
                          width: 22,
                          height: 22,
                          borderRadius: 999,
                          backgroundColor: 'rgba(15,15,15,0.78)',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: pressed ? 0.7 : 1,
                        })}
                      >
                        <Feather name="x" size={12} color={colors.white} />
                      </Pressable>
                    </View>
                  ))}
                  {slots.length < MAX_IMAGES && (
                    <Pressable
                      onPress={pickImages}
                      style={({ pressed }) => ({
                        width: tile,
                        height: tile,
                        borderRadius: 12,
                        borderWidth: 1.5,
                        borderStyle: 'dashed',
                        borderColor: SELL_TEAL,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Feather name="plus" size={20} color={SELL_TEAL} />
                    </Pressable>
                  )}
                </View>
              )}
            </View>
            {slots.length > 0 && (
              <Text style={{ fontSize: 12, color: colors.muteSoft, marginTop: 8 }}>
                {slots.length} / {MAX_IMAGES} photos · first photo is the cover
              </Text>
            )}
          </View>

          <SectionDivider />

          {/* About your item */}
          <SectionHeader>About your item</SectionHeader>
          <UnderlineField
            label="Title"
            placeholder="Tell buyers what you're selling"
            value={title}
            onChangeText={(t) => setTitle(t.slice(0, TITLE_MAX))}
            maxLength={TITLE_MAX}
          />
          <UnderlineField
            label="Description"
            placeholder="Tell buyers more about it"
            value={description}
            onChangeText={(t) => setDescription(t.slice(0, DESCRIPTION_MAX))}
            maxLength={DESCRIPTION_MAX}
            multiline
          />

          <SectionDivider />

          {/* Item details */}
          <SectionHeader>Item details</SectionHeader>
          <RowField label="Category" value={categoryValue} placeholder="Add category" onPress={() => setActiveSheet('category')} />
          {showSuggestion ? (
            <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
              <Pressable
                onPress={() => {
                  setCategory(suggestion!.category);
                  setSubcategory(suggestion!.sub.id);
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  alignSelf: 'flex-start',
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: radii.pill,
                  backgroundColor: SELL_TEAL_SOFT,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Feather name="zap" size={12} color={SELL_TEAL} />
                <Text style={{ fontSize: 12.5, fontFamily: DISPLAY_BOLD, color: SELL_TEAL }}>
                  Suggested: {CATEGORIES.find((c) => c.id === suggestion!.category)?.label} ▸{' '}
                  {suggestion!.sub.label}
                </Text>
              </Pressable>
            </View>
          ) : null}
          <RowField label="Brand" value={brand} placeholder="Add brand" onPress={() => setActiveSheet('brand')} />
          <RowField label="Size" value={size} placeholder="Add size" onPress={() => setActiveSheet('size')} />
          <RowField
            label="Condition"
            value={CONDITIONS.find((c) => c.value === condition)?.label ?? ''}
            placeholder="Add condition"
            onPress={() => setActiveSheet('condition')}
          />
          <RowField
            label="Colors"
            value={color ? itemColorLabel(color) : ''}
            placeholder="Add color"
            onPress={() => setActiveSheet('colors')}
          />
          <RowField
            label="Gender"
            value={GENDERS.find((g) => g.value === gender)?.label ?? ''}
            placeholder="Add gender"
            onPress={() => setActiveSheet('gender')}
          />
          <RowField
            label="Tags"
            value={tags.length ? `${tags.length} tag${tags.length === 1 ? '' : 's'}` : ''}
            placeholder="Add tags"
            onPress={() => setActiveSheet('tags')}
          />

          <SectionDivider />

          {/* Pricing */}
          <SectionHeader>Pricing</SectionHeader>
          <RowField
            label="Price"
            value={price ? formatPrice(parseFloat(price), { whole: true }) : ''}
            placeholder="Add price"
            onPress={() => setActiveSheet('price')}
          />

          <SectionDivider />

          {/* Shipping */}
          <SectionHeader>Shipping</SectionHeader>
          <RowField
            label="Parcel size"
            value={PARCEL_SIZES.find((p) => p.value === parcelSize)?.label ?? ''}
            placeholder="Add parcel size"
            onPress={() => setActiveSheet('parcel')}
          />
          <Text style={{ fontSize: 12, color: colors.muteSoft, paddingHorizontal: 20, paddingTop: 8 }}>
            The buyer always pays for shipping
          </Text>

          <View style={{ paddingHorizontal: 20 }}>
            <SafetyBanner context="sell" style={{ marginTop: 24 }} />

            {/* Upload — scrolls with the rest of the form, right after the
                safety banner, instead of sitting in a sticky footer. */}
            <Pressable
              onPress={handlePublish}
              disabled={publishing || !canPublish}
              accessibilityRole="button"
              accessibilityLabel={publishing ? 'Uploading listing' : 'Upload listing'}
              accessibilityState={{ disabled: publishing || !canPublish, busy: publishing }}
              style={({ pressed }) => ({
                height: 52,
                borderRadius: radii.md,
                backgroundColor: canPublish ? SELL_TEAL_DARK : colors.hairline,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 20,
                opacity: publishing ? 0.85 : 1,
                transform: [{ scale: pressed && canPublish ? 0.985 : 1 }],
              })}
            >
              {publishing ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text
                  style={{
                    fontSize: 16,
                    fontFamily: DISPLAY_BOLD,
                    color: canPublish ? colors.white : colors.muteSoft,
                    letterSpacing: 0.2,
                  }}
                >
                  Upload
                </Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sheets */}
      <CategorySheet
        visible={activeSheet === 'category'}
        category={category}
        subcategory={subcategory}
        onChange={(c, s) => {
          setCategory(c);
          setSubcategory(s);
        }}
        onClose={() => setActiveSheet(null)}
      />
      <TextFieldSheet
        visible={activeSheet === 'brand'}
        title="Brand"
        placeholder="e.g. Zara, Nike, Khaadi"
        value={brand}
        onChange={setBrand}
        onClose={() => setActiveSheet(null)}
      />
      <TextFieldSheet
        visible={activeSheet === 'size'}
        title="Size"
        placeholder="e.g. S, M, L, 42, Free"
        value={size}
        onChange={setSize}
        onClose={() => setActiveSheet(null)}
      />
      <SingleSelectSheet
        visible={activeSheet === 'condition'}
        title="Condition"
        options={CONDITIONS}
        value={condition}
        onChange={setCondition}
        onClose={() => setActiveSheet(null)}
      />
      <ColorSheet
        visible={activeSheet === 'colors'}
        value={color}
        onChange={setColor}
        onClose={() => setActiveSheet(null)}
      />
      <SingleSelectSheet
        visible={activeSheet === 'gender'}
        title="Gender"
        options={GENDERS}
        value={gender}
        onChange={setGender}
        onClose={() => setActiveSheet(null)}
      />
      <TagsSheet
        visible={activeSheet === 'tags'}
        value={tags}
        onChange={setTags}
        onClose={() => setActiveSheet(null)}
      />
      <PriceSheet
        visible={activeSheet === 'price'}
        value={price}
        onChange={setPrice}
        onClose={() => setActiveSheet(null)}
      />
      <SingleSelectSheet
        visible={activeSheet === 'parcel'}
        title="Parcel size"
        options={PARCEL_SIZES}
        value={parcelSize}
        onChange={setParcelSize}
        onClose={() => setActiveSheet(null)}
      />
    </SafeAreaView>
  );
}
