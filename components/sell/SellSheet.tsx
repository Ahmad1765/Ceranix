// Sell form, presented as a full-screen Modal — same primitive as OfferSheet /
// GuestGate (`<Modal animationType="slide">`), not an expo-router Stack screen.
// Mounted once at the root (see app/_layout.tsx) and driven app-wide via
// useSellSheet().open(): tapping the Sell tab, or any "Post an item" CTA,
// calls open() instead of navigating, so the form slides up over whatever
// screen is currently showing and leaves the tab bar's active tab untouched
// underneath — exactly like the Offer button's sheet on the product page.
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { capture } from '@/lib/analytics';
import { View, Pressable, ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, useWindowDimensions, Modal } from 'react-native';
import { Text, } from '@/lib/rnText';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { uploadListingImages, deleteListingImages, type LocalImage } from '@/lib/upload';
import {
  makeSlot, resolveImage, type PhotoSlot,
} from '@/lib/photoClean/slots';
import { useToast } from '@/lib/toast';
import { putCachedListing } from '@/lib/listingCache';
import { emitListingCreated } from '@/lib/listingEvents';
import { invalidateFresh } from '@/lib/freshness';
import { router } from 'expo-router';
import type {  Condition, Gender, Listing } from '@/types';
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
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { SellFormSchema, type SellFormValues } from '@/lib/schemas/sell';
import { Input } from '@/components/ui/Input';
import { DEFAULT_SELL_VALUES, listingToSellFormValues, patchListingInCache } from './editHelpers';

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
type SellSheetApi = {
  open: (listingToEdit?: Listing | null) => boolean;
  close: () => void;
};
const Ctx = createContext<SellSheetApi | undefined>(undefined);

export function useSellSheet(): SellSheetApi {
  const ctx = useContext(Ctx);
  // Soft fallback outside the provider: keep old behaviour (route to auth).
  if (!ctx) return { open: () => { router.push('/auth/login'); return false; }, close: () => {} };
  return ctx;
}

export function SellSheetProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const { user } = useAuth();

  const open = useCallback((listingToEdit?: Listing | null) => {
    if (!user?.id) {
      router.push('/auth/login');
      return false;
    }
    setOwnerUserId(user.id);
    setEditingListing(listingToEdit ?? null);
    setVisible(true);
    return true;
  }, [user]);

  const close = useCallback(() => {
    setVisible(false);
    setOwnerUserId(null);
    setEditingListing(null);
  }, []);

  // Close and unmount form whenever user becomes unauthenticated or user ID changes
  useEffect(() => {
    if (visible && (!user?.id || user.id !== ownerUserId)) {
      close();
    }
  }, [visible, user?.id, ownerUserId, close]);

  const api = useMemo(() => ({ open, close }), [open, close]);

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
            <SellForm editingListing={editingListing} onClose={close} />
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
  const handlePress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 15,
        minHeight: 50,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: pressed ? colors.panel : 'transparent',
      })}
    >
      <Text style={{ fontSize: 14.5, fontFamily: DISPLAY_BOLD, color: colors.ink }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, marginLeft: 12 }}>
        <Text
          numberOfLines={1}
          style={{ fontSize: 14, color: value ? colors.ink : colors.mute, flexShrink: 1 }}
        >
          {value || placeholder}
        </Text>
        <Feather name="chevron-right" size={17} color={colors.mute} />
      </View>
    </Pressable>
  );
}

function SellForm({
  editingListing,
  onClose,
}: {
  editingListing?: Listing | null;
  onClose: () => void;
}) {
  const { user, profile } = useAuth();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const [publishing, setPublishing] = useState(false);
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);

  const isEditing = !!editingListing;
  const initialValues = useMemo(
    () => listingToSellFormValues(editingListing),
    [editingListing],
  );

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<SellFormValues>({
    resolver: zodResolver(SellFormSchema),
    defaultValues: initialValues,
    mode: 'onTouched',
  });

  useEffect(() => {
    reset(initialValues);
  }, [initialValues, reset]);

  const slots = watch('slots');
  const title = watch('title');
  const category = watch('category');
  const subcategory = watch('subcategory');
  const price = watch('price');
  const brand = watch('brand');
  const size = watch('size');
  const condition = watch('condition');
  const color = watch('color');
  const gender = watch('gender');
  const tags = watch('tags');
  const parcelSize = watch('parcelSize');

  const suggestion = useMemo(() => suggestSubcategory(title || ''), [title]);
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
      const updatedSlots = [...slots, ...newSlots].slice(0, MAX_IMAGES);
      setValue('slots', updatedSlots, { shouldValidate: true });
    }
  };

  const resetForm = () => {
    reset(DEFAULT_SELL_VALUES);
  };

  const canPublish =
    title?.trim().length > 0 &&
    parseFloat(price || '0') > 0 &&
    slots.length > 0 &&
    (!hasSubcategories(category) || !!subcategory);

  const onValidSubmit = async (formData: SellFormValues) => {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to publish a listing.');
      return;
    }

    const priceNum = parseFloat(formData.price);
    setPublishing(true);

    if (isEditing && editingListing) {
      try {
        const photoSlots = formData.slots as PhotoSlot[];
        const resolvedImages = photoSlots.map(resolveImage);
        const isRemoteUrl = (uri: string) => uri.startsWith('http://') || uri.startsWith('https://');

        // Map existing images to their corresponding thumbnails
        const existingImageToThumb = new Map<string, string>();
        (editingListing.images ?? []).forEach((imgUrl, idx) => {
          const thumb = editingListing.thumbnails?.[idx] || imgUrl;
          existingImageToThumb.set(imgUrl, thumb);
        });

        // Separate local images that need uploading
        const newImagesToUpload: { index: number; image: LocalImage }[] = [];
        resolvedImages.forEach((img, idx) => {
          if (!isRemoteUrl(img.uri)) {
            newImagesToUpload.push({ index: idx, image: img });
          }
        });

        let uploadedNewImages: { index: number; url: string; thumbUrl: string }[] = [];
        if (newImagesToUpload.length > 0) {
          const uploaded = await uploadListingImages(
            newImagesToUpload.map((n) => n.image),
            user.id,
          );
          uploadedNewImages = uploaded.map((u, i) => ({
            index: newImagesToUpload[i].index,
            url: u.url,
            thumbUrl: u.thumbUrl,
          }));
        }

        const finalUrls: string[] = [];
        const finalThumbs: string[] = [];

        resolvedImages.forEach((img, idx) => {
          if (isRemoteUrl(img.uri)) {
            finalUrls.push(img.uri);
            finalThumbs.push(existingImageToThumb.get(img.uri) || img.uri);
          } else {
            const uploadedItem = uploadedNewImages.find((u) => u.index === idx);
            if (uploadedItem) {
              finalUrls.push(uploadedItem.url);
              finalThumbs.push(uploadedItem.thumbUrl);
            }
          }
        });

        // Best-effort cleanup for removed images from the original listing
        const currentUrlSet = new Set(finalUrls);
        const removedUrls = (editingListing.images ?? []).filter((url) => !currentUrlSet.has(url));
        if (removedUrls.length > 0) {
          deleteListingImages(removedUrls).catch((err) => {
            console.warn('[sell] Failed to clean up removed images', err);
          });
        }

        const { error } = await supabase
          .from('listings')
          .update({
            title: formData.title.trim(),
            description: formData.description?.trim() || null,
            price: priceNum,
            category: formData.category,
            subcategory: formData.subcategory || null,
            color: formData.color || null,
            gender: formData.gender,
            brand: formData.brand?.trim() || null,
            size: formData.size?.trim() || null,
            condition: formData.condition,
            parcel_size: formData.parcelSize || null,
            images: finalUrls,
            thumbnails: finalThumbs,
            tags: formData.tags || [],
          })
          .eq('id', editingListing.id);

        if (error) throw error;

        const updatedListing: Listing = {
          ...editingListing,
          title: formData.title.trim(),
          description: formData.description?.trim() || '',
          price: priceNum,
          category: formData.category,
          subcategory: formData.subcategory || null,
          color: formData.color || null,
          gender: formData.gender,
          brand: formData.brand?.trim() || null,
          size: formData.size?.trim() || null,
          condition: formData.condition,
          parcel_size: formData.parcelSize || null,
          images: finalUrls,
          thumbnails: finalThumbs,
          tags: formData.tags || [],
        };

        patchListingInCache(editingListing.id, updatedListing);
        invalidateFresh();

        capture('listing_updated', {
          listing_id: editingListing.id,
          category: updatedListing.category,
          price: updatedListing.price,
        });

        toast.show('Listing updated', { variant: 'success', icon: 'check' });
        onClose();
      } catch (e: any) {
        Alert.alert('Could not save changes', e?.message ?? 'Unknown error');
      } finally {
        setPublishing(false);
      }
      return;
    }

    // Each upload returns the full-size URL plus a card-sized copy; the two
    // arrays are written together and stay index-aligned (see the note on
    // listings.thumbnails in the migration).
    let urls: string[] = [];
    let thumbs: string[] = [];
    try {
      const chosen = (formData.slots as PhotoSlot[]).map(resolveImage);
      const uploaded = await uploadListingImages(chosen, user.id);
      urls = uploaded.map((u) => u.url);
      thumbs = uploaded.map((u) => u.thumbUrl);

      const { data, error } = await supabase
        .from('listings')
        .insert({
          seller_id: user.id,
          title: formData.title.trim(),
          description: formData.description?.trim() || null,
          price: priceNum,
          category: formData.category,
          subcategory: formData.subcategory || null,
          color: formData.color || null,
          gender: formData.gender,
          brand: formData.brand?.trim() || null,
          size: formData.size?.trim() || null,
          condition: formData.condition,
          parcel_size: formData.parcelSize || null,
          images: urls,
          thumbnails: thumbs,
          is_sold: false,
          tags: formData.tags || [],
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
        title: formData.title.trim(),
        description: formData.description?.trim() || '',
        price: priceNum,
        category: formData.category,
        subcategory: formData.subcategory || null,
        color: formData.color || null,
        gender: formData.gender,
        brand: formData.brand?.trim() || null,
        size: formData.size?.trim() || null,
        condition: formData.condition,
        parcel_size: formData.parcelSize || null,
        images: urls,
        thumbnails: thumbs,
        is_sold: false,
        views: 0,
        likes: 0,
        tags: formData.tags || [],
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

  const onInvalidSubmit = () => {
    if (slots.length === 0) {
      toast.show('Please add at least one photo', { variant: 'default', icon: 'alert-triangle' });
    } else if (errors.subcategory) {
      toast.show('Please choose a category and subcategory', { variant: 'default', icon: 'alert-triangle' });
    } else if (errors.price) {
      toast.show(errors.price.message ?? 'Please enter a valid price', { variant: 'default', icon: 'alert-triangle' });
    } else if (errors.title) {
      toast.show(errors.title.message ?? 'Please enter a title', { variant: 'default', icon: 'alert-triangle' });
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

  const insets = useSafeAreaInsets();

  const handlePickImages = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    await pickImages();
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={({ pressed }) => ({
            minWidth: 44,
            minHeight: 44,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.55 : 1,
          })}
        >
          <Feather name="x" size={22} color={colors.ink} />
        </Pressable>
        <Text style={{ fontSize: 16, fontFamily: DISPLAY_BOLD, color: colors.ink }}>
          {isEditing ? 'Edit listing' : 'Sell an item'}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 32 }}
        >
          {/* Photos */}
          <SectionHeader>Photos</SectionHeader>
          <View style={{ paddingHorizontal: 20 }}>
            <View
              style={{
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: errors.slots ? (colors.danger ?? '#EF4444') : colors.border,
                borderRadius: radii.lg,
                padding: slots.length === 0 ? 0 : 14,
                minHeight: slots.length === 0 ? 128 : undefined,
                alignItems: slots.length === 0 ? 'center' : undefined,
                justifyContent: slots.length === 0 ? 'center' : undefined,
                backgroundColor: colors.surface,
              }}
            >
              {slots.length === 0 ? (
                <Pressable
                  onPress={handlePickImages}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Upload photos"
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingHorizontal: 22,
                    paddingVertical: 13,
                    minHeight: 48,
                    borderRadius: radii.pill,
                    borderWidth: 1.5,
                    borderColor: SELL_TEAL,
                    backgroundColor: colors.surface,
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
                  {(slots as PhotoSlot[]).map((slot, i) => (
                    <View key={slot.id} style={{ width: tile, height: tile, position: 'relative' }}>
                      <Image
                        source={{ uri: resolveImage(slot).uri }}
                        style={{ width: '100%', height: '100%', borderRadius: 12 }}
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
                          <Text style={{ color: 'white', fontSize: 9, fontFamily: DISPLAY_BOLD, letterSpacing: 0.4 }}>
                            COVER
                          </Text>
                        </View>
                      )}
                      <Pressable
                        onPress={() => {
                          if (Platform.OS !== 'web') {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          }
                          const updated = (slots as PhotoSlot[]).filter((s) => s.id !== slot.id);
                          setValue('slots', updated, { shouldValidate: true });
                        }}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        accessibilityRole="button"
                        accessibilityLabel="Remove photo"
                        style={({ pressed }) => ({
                          position: 'absolute',
                          top: 5,
                          right: 5,
                          width: 24,
                          height: 24,
                          borderRadius: 999,
                          backgroundColor: 'rgba(15,15,15,0.78)',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: pressed ? 0.7 : 1,
                        })}
                      >
                        <Feather name="x" size={13} color="#FFFFFF" />
                      </Pressable>
                    </View>
                  ))}
                  {slots.length < MAX_IMAGES && (
                    <Pressable
                      onPress={handlePickImages}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel="Add more photos"
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
            {errors.slots?.message ? (
              <Text
                accessibilityRole="alert"
                style={{
                  fontSize: 12,
                  color: colors.danger ?? '#EF4444',
                  marginTop: 6,
                  fontFamily: type.family.sansMedium,
                }}
              >
                {errors.slots.message}
              </Text>
            ) : slots.length > 0 ? (
              <Text style={{ fontSize: 12, color: colors.muteSoft, marginTop: 8 }}>
                {slots.length} / {MAX_IMAGES} photos · first photo is the cover
              </Text>
            ) : null}
          </View>

          <SectionDivider />

          {/* About your item */}
          <SectionHeader>About your item</SectionHeader>
          <View style={{ paddingHorizontal: 20 }}>
            <Controller
              control={control}
              name="title"
              render={({ field: { onChange, onBlur, value, ref }, fieldState: { error } }) => (
                <Input
                  ref={ref}
                  label="Title"
                  placeholder="Tell buyers what you're selling"
                  value={value}
                  onChangeText={(t) => onChange(t.slice(0, TITLE_MAX))}
                  onBlur={onBlur}
                  maxLength={TITLE_MAX}
                  error={error?.message}
                  variant="underline"
                  containerStyle={{ marginVertical: 0 }}
                />
              )}
            />
            <Controller
              control={control}
              name="description"
              render={({ field: { onChange, onBlur, value, ref }, fieldState: { error } }) => (
                <Input
                  ref={ref}
                  label="Description"
                  placeholder="Tell buyers more about it"
                  value={value}
                  onChangeText={(t) => onChange(t.slice(0, DESCRIPTION_MAX))}
                  onBlur={onBlur}
                  maxLength={DESCRIPTION_MAX}
                  multiline
                  error={error?.message}
                  variant="underline"
                  containerStyle={{ marginVertical: 0 }}
                />
              )}
            />
          </View>

          <SectionDivider />

          {/* Item details */}
          <SectionHeader>Item details</SectionHeader>
          <RowField
            label="Category"
            value={categoryValue}
            placeholder="Add category"
            onPress={() => setActiveSheet('category')}
          />
          {errors.subcategory?.message ? (
            <Text
              accessibilityRole="alert"
              style={{
                fontSize: 12,
                color: colors.danger ?? '#EF4444',
                paddingHorizontal: 20,
                paddingTop: 4,
                fontFamily: type.family.sansMedium,
              }}
            >
              {errors.subcategory.message}
            </Text>
          ) : null}

          {showSuggestion ? (
            <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
              <Pressable
                onPress={() => {
                  if (Platform.OS !== 'web') {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  }
                  setValue('category', suggestion!.category, { shouldValidate: true });
                  setValue('subcategory', suggestion!.sub.id, { shouldValidate: true });
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  alignSelf: 'flex-start',
                  paddingHorizontal: 12,
                  paddingVertical: 8,
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
          {errors.price?.message ? (
            <Text
              accessibilityRole="alert"
              style={{
                fontSize: 12,
                color: colors.danger ?? '#EF4444',
                paddingHorizontal: 20,
                paddingTop: 4,
                fontFamily: type.family.sansMedium,
              }}
            >
              {errors.price.message}
            </Text>
          ) : null}

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
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                }
                handleSubmit(onValidSubmit, onInvalidSubmit)();
              }}
              disabled={publishing || !canPublish}
              accessibilityRole="button"
              accessibilityLabel={
                publishing
                  ? (isEditing ? 'Saving changes' : 'Uploading listing')
                  : (isEditing ? 'Save changes' : 'Upload listing')
              }
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
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text
                  style={{
                    fontSize: 16,
                    fontFamily: DISPLAY_BOLD,
                    color: canPublish ? '#FFFFFF' : colors.muteSoft,
                    letterSpacing: 0.2,
                  }}
                >
                  {isEditing ? 'Save changes' : 'Upload'}
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
        subcategory={subcategory ?? null}
        onChange={(c, s) => {
          setValue('category', c, { shouldValidate: true });
          setValue('subcategory', s, { shouldValidate: true });
        }}
        onClose={() => setActiveSheet(null)}
      />
      <TextFieldSheet
        visible={activeSheet === 'brand'}
        title="Brand"
        placeholder="e.g. Zara, Nike, Khaadi"
        value={brand}
        onChange={(b) => setValue('brand', b, { shouldValidate: true })}
        onClose={() => setActiveSheet(null)}
      />
      <TextFieldSheet
        visible={activeSheet === 'size'}
        title="Size"
        placeholder="e.g. S, M, L, 42, Free"
        value={size}
        onChange={(s) => setValue('size', s, { shouldValidate: true })}
        onClose={() => setActiveSheet(null)}
      />
      <SingleSelectSheet
        visible={activeSheet === 'condition'}
        title="Condition"
        options={CONDITIONS}
        value={condition}
        onChange={(c) => setValue('condition', c, { shouldValidate: true })}
        onClose={() => setActiveSheet(null)}
      />
      <ColorSheet
        visible={activeSheet === 'colors'}
        value={color ?? null}
        onChange={(cl) => setValue('color', cl, { shouldValidate: true })}
        onClose={() => setActiveSheet(null)}
      />
      <SingleSelectSheet
        visible={activeSheet === 'gender'}
        title="Gender"
        options={GENDERS}
        value={gender}
        onChange={(g) => setValue('gender', g, { shouldValidate: true })}
        onClose={() => setActiveSheet(null)}
      />
      <TagsSheet
        visible={activeSheet === 'tags'}
        value={tags}
        onChange={(t) => setValue('tags', t, { shouldValidate: true })}
        onClose={() => setActiveSheet(null)}
      />
      <PriceSheet
        visible={activeSheet === 'price'}
        value={price}
        onChange={(p) => setValue('price', p, { shouldValidate: true })}
        onClose={() => setActiveSheet(null)}
      />
      <SingleSelectSheet<ParcelSize>
        visible={activeSheet === 'parcel'}
        title="Parcel size"
        options={PARCEL_SIZES}
        value={parcelSize ?? null}
        onChange={(ps) => setValue('parcelSize', ps, { shouldValidate: true })}
        onClose={() => setActiveSheet(null)}
      />
    </SafeAreaView>
  );
}

