import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { safeBack } from '@/lib/nav';
import { RequireAuth } from '@/components/RequireAuth';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { uploadListingImages, type LocalImage } from '@/lib/upload';
import { useToast } from '@/lib/toast';
import { putCachedListing } from '@/lib/listingCache';
import { emitListingCreated } from '@/lib/listingEvents';
import type { Category, Condition, Gender, Listing } from '@/types';

type Step = 'photos' | 'details';

const CONDITIONS: { label: string; value: Condition }[] = [
  { label: 'New with tags', value: 'new_with_tags' },
  { label: 'Like new', value: 'like_new' },
  { label: 'Good', value: 'good' },
  { label: 'Fair', value: 'fair' },
];

const CATEGORIES: { label: string; value: Category }[] = [
  { label: 'Clothing', value: 'clothing' },
  { label: 'Shoes', value: 'shoes' },
  { label: 'Bags', value: 'bags' },
  { label: 'Accessories', value: 'accessories' },
  { label: 'Electronics', value: 'electronics' },
  { label: 'Beauty', value: 'beauty' },
  { label: 'Other', value: 'other' },
];

const GENDERS: { label: string; value: Gender }[] = [
  { label: 'Women', value: 'women' },
  { label: 'Men', value: 'men' },
  { label: 'Unisex', value: 'unisex' },
];

const MAX_IMAGES = 7;

function SellScreenInner() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState<Step>('photos');
  const [images, setImages] = useState<LocalImage[]>([]);
  const [aiPrefill, setAiPrefill] = useState(true);
  const [publishing, setPublishing] = useState(false);

  // Details step
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [brand, setBrand] = useState('');
  const [size, setSize] = useState('');
  const [condition, setCondition] = useState<Condition>('good');
  const [category, setCategory] = useState<Category>('clothing');
  const [gender, setGender] = useState<Gender>('women');
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');

  const pickImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: MAX_IMAGES,
      base64: true,
    });
    if (!result.canceled) {
      setImages((prev) => {
        const next = [
          ...prev,
          ...result.assets.map((a) => ({ uri: a.uri, base64: a.base64 ?? null })),
        ];
        return next.slice(0, MAX_IMAGES);
      });
    }
  };

  const resetForm = () => {
    setStep('photos');
    setImages([]);
    setTitle('');
    setPrice('');
    setBrand('');
    setSize('');
    setDescription('');
    setCondition('good');
    setCategory('clothing');
    setGender('women');
    setTags([]);
    setTagDraft('');
  };

  const handleContinue = () => {
    if (images.length === 0) {
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
    const priceNum = parseInt(price, 10);
    if (!priceNum || priceNum <= 0) {
      Alert.alert('Missing info', 'Enter a valid price.');
      return;
    }
    if (images.length === 0) {
      Alert.alert('Missing photos', 'Add at least one photo first.');
      return;
    }

    setPublishing(true);
    try {
      const urls = await uploadListingImages(images, user.id);

      const { data, error } = await supabase
        .from('listings')
        .insert({
          seller_id: user.id,
          title: title.trim(),
          description: description.trim() || null,
          price: priceNum,
          category,
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

      if (error) throw error;

      const newId = data!.id as string;

      // Seed the local cache + broadcast the new listing BEFORE navigating.
      // This avoids the "had to refresh the page to see my listing" bug:
      //   - The product page we push to reads from listingCache on mount and
      //     renders instantly instead of skeleton-ing on a fresh fetch that
      //     could wedge on web.
      //   - The home feed's onListingCreated subscription prepends it to the
      //     visible list immediately, so when the user navigates back the
      //     upload is already at the top — no dependence on the silent
      //     focus refetch (which can race against replication lag or get
      //     aborted by the global fetch ceiling).
      const newListing: Listing = {
        id: newId,
        seller_id: user.id,
        seller: (profile as Listing['seller']) ?? ({
          id: user.id,
          username: '',
          avatar_url: null,
          full_name: '',
          bio: null,
          location: null,
          rating: 0,
          total_sales: 0,
          created_at: new Date().toISOString(),
        } as Listing['seller']),
        title: title.trim(),
        description: description.trim(),
        price: priceNum,
        category,
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

      resetForm();
      toast.show('Listing is live 🔥', { variant: 'success', icon: 'check' });
      router.push(`/product/${newId}`);
    } catch (e: any) {
      Alert.alert('Could not publish', e?.message ?? 'Unknown error');
    } finally {
      setPublishing(false);
    }
  };

  if (step === 'photos') {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-white">
        {/* Header */}
        <View className="flex-row items-center justify-center px-4 pt-4 pb-4 border-b border-ink-hair relative">
          <Pressable onPress={() => safeBack()} className="absolute left-4 bottom-4">
            <Feather name="arrow-left" size={26} color="black" />
          </Pressable>
          <Text className="text-[17px] font-semibold text-ink">Upload listing</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          {/* Title */}
          <Text className="text-[34px] font-bold text-ink leading-[42px] mb-2">
            What do you want to add?
          </Text>

          {/* Instruction card */}
          <View className="bg-ink-panel rounded-2xl p-5 mt-2 mb-8">
            <Text className="text-[17px] font-bold text-ink mb-1.5 ">Start by uploading photos</Text>
            <Text className="text-[15px] text-ink-mute leading-[22px]">
              Choose clear images that show the front, back, label and details. Here you can see{' '}
              <Text className="font-bold underline text-ink">examples</Text>
            </Text>
          </View>

          {/* Image grid */}
          <Text className="text-[17px] font-bold text-ink mb-4">
            <Text className="text-primary">• </Text>
            Add images <Text className="text-ink-soft font-normal">max 7</Text>
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-8" contentContainerStyle={{ gap: 12 }}>
            {images.map((img, i) => (
              <View key={i} style={{ width: 160, height: 210 }} className="relative">
                <Image
                  source={{ uri: img.uri }}
                  style={{ width: '100%', height: '100%' }}
                  className="rounded-lg bg-ink-panel border border-ink-hair"
                  contentFit="cover"
                />
                <Pressable
                  onPress={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                  className="absolute top-2 right-2 bg-black/50 rounded-full p-1.5"
                >
                  <Feather name="x" size={14} color="white" />
                </Pressable>
              </View>
            ))}

            {images.length < MAX_IMAGES && (
              <Pressable
                onPress={pickImages}
                style={{ width: 160, height: 210 }}
                className="border border-ink-hair rounded-lg items-center justify-center bg-white"
              >
                <Feather name="plus" size={32} color="black" />
                <Text className="text-[17px] text-ink mt-1">Add</Text>
              </Pressable>
            )}

            {/* Always show at least one more placeholder if we haven't reached max and don't have many images */}
            {images.length < MAX_IMAGES - 1 && (
               <Pressable
               onPress={pickImages}
               style={{ width: 160, height: 210 }}
               className="border border-ink-hair rounded-lg items-center justify-center bg-white"
             >
               <Feather name="plus" size={32} color="black" />
               <Text className="text-[17px] text-ink mt-1">Add</Text>
             </Pressable>
            )}

            {/* Third placeholder for visual consistency with screenshot */}
            {images.length < MAX_IMAGES - 2 && (
               <View
               style={{ width: 60, height: 210 }}
               className="border-l border-t border-b border-ink-hair rounded-l-lg bg-white opacity-40"
             />
            )}
          </ScrollView>

          {/* AI Prefill toggle */}
          <View className="bg-ink-panel rounded-2xl p-5 mb-10 flex-row items-center">
            <View className="flex-1 mr-4">
              <View className="flex-row items-center mb-1.5">
                <Ionicons name="sparkles" size={20} color="black" style={{ marginRight: 8 }} />
                <Text className="text-[17px] font-bold text-ink">Help me prefill my ad</Text>
              </View>
              <Text className="text-[15px] text-ink-mute leading-[22px]">
                Let our AI help you describe your item. It won't get easier than this!
              </Text>
            </View>
            <Pressable
              onPress={() => setAiPrefill(!aiPrefill)}
              className={`w-[52px] h-[32px] rounded-full p-1 transition-colors duration-300 ${aiPrefill ? 'bg-primary' : 'bg-ink-hair'}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: aiPrefill ? 'flex-end' : 'flex-start'
              }}
            >
              <View
                className="w-6 h-6 rounded-full bg-white"
                style={{
                  elevation: 2,
                  boxShadow: '0px 1px 1.5px rgba(0,0,0,0.2)',
                }}
              />
            </Pressable>
          </View>
        </ScrollView>

        {/* Continue button */}
        <View className="px-5 pb-8 pt-3 border-t border-ink-hair">
          <Pressable
            onPress={handleContinue}
            className="bg-primary rounded-xl py-[18px] items-center"
          >
            <Text className="text-white font-bold text-[17px]">Continue</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Details step
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-ink-hair">
        <Pressable onPress={() => setStep('photos')} className="mr-4">
          <Feather name="arrow-left" size={22} color="#0F0F0F" />
        </Pressable>
        <Text className="text-base font-semibold text-ink">Listing details</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Thumbnail strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }} contentContainerStyle={{ gap: 8 }}>
          {images.map((img, i) => (
            <Image
              key={i}
              source={{ uri: img.uri }}
              style={{ width: 80, height: 80 }}
              className="rounded-xl bg-ink-panel"
              contentFit="cover"
            />
          ))}
        </ScrollView>

        {/* Title */}
        <Text className="text-sm font-medium text-ink-mute mb-1">Title *</Text>
        <TextInput
          className="border border-ink-hair rounded-xl px-3 py-3 text-sm text-ink mb-4"
          placeholder="e.g. Zara floral midi dress"
          value={title}
          onChangeText={setTitle}
        />

        {/* Brand */}
        <Text className="text-sm font-medium text-ink-mute mb-1">Brand</Text>
        <TextInput
          className="border border-ink-hair rounded-xl px-3 py-3 text-sm text-ink mb-4"
          placeholder="e.g. Zara, Nike, Khaadi"
          value={brand}
          onChangeText={setBrand}
        />

        {/* Price */}
        <Text className="text-sm font-medium text-ink-mute mb-1">Price (USD) *</Text>
        <TextInput
          className="border border-ink-hair rounded-xl px-3 py-3 text-sm text-ink mb-4"
          placeholder="e.g. 2500"
          keyboardType="numeric"
          value={price}
          onChangeText={setPrice}
        />

        {/* Category */}
        <Text className="text-sm font-medium text-ink-mute mb-2">Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ gap: 8 }}>
          {CATEGORIES.map((c) => (
            <Pressable
              key={c.value}
              onPress={() => setCategory(c.value)}
              className={`px-3 py-1.5 rounded-full border ${category === c.value ? 'bg-primary border-primary' : 'border-ink-hair'}`}
            >
              <Text className={`text-sm ${category === c.value ? 'text-white' : 'text-ink-mute'}`}>{c.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Gender */}
        <Text className="text-sm font-medium text-ink-mute mb-2">For</Text>
        <View className="flex-row mb-4" style={{ gap: 8 }}>
          {GENDERS.map((g) => (
            <Pressable
              key={g.value}
              onPress={() => setGender(g.value)}
              className={`flex-1 py-2 rounded-xl border items-center ${gender === g.value ? 'bg-primary border-primary' : 'border-ink-hair'}`}
            >
              <Text className={`text-sm ${gender === g.value ? 'text-white' : 'text-ink'}`}>{g.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Condition */}
        <Text className="text-sm font-medium text-ink-mute mb-2">Condition</Text>
        <View className="mb-4" style={{ gap: 8 }}>
          {CONDITIONS.map((c) => (
            <Pressable
              key={c.value}
              onPress={() => setCondition(c.value)}
              className={`flex-row items-center px-3 py-3 rounded-xl border ${condition === c.value ? 'border-primary bg-primary-soft' : 'border-ink-hair'}`}
            >
              <View className={`w-4 h-4 rounded-full border-2 mr-3 items-center justify-center ${condition === c.value ? 'border-primary' : 'border-ink-hair'}`}>
                {condition === c.value && <View className="w-2 h-2 rounded-full bg-primary" />}
              </View>
              <Text className="text-sm text-ink">{c.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Size */}
        <Text className="text-sm font-medium text-ink-mute mb-1">Size</Text>
        <TextInput
          className="border border-ink-hair rounded-xl px-3 py-3 text-sm text-ink mb-4"
          placeholder="e.g. S, M, L, 42, Free"
          value={size}
          onChangeText={setSize}
        />

        {/* Description */}
        <Text className="text-sm font-medium text-ink-mute mb-1">Description</Text>
        <TextInput
          className="border border-ink-hair rounded-xl px-3 py-3 text-sm text-ink mb-6"
          placeholder="Describe the item — condition, measurements, why selling..."
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          style={{ minHeight: 100 }}
        />

        {/* Tags — buyers find your listing through these */}
        <Text className="text-sm font-medium text-ink-mute mb-1">Tags</Text>
        <View
          className="border border-ink-hair rounded-xl px-3 py-2 mb-2"
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', minHeight: 48 }}
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
              // Commit on space or comma — feels native for hashtags.
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
              // Backspace on empty input removes the last chip — standard
              // hashtag-input affordance buyers expect.
              if (e.nativeEvent.key === 'Backspace' && tagDraft.length === 0 && tags.length > 0) {
                setTags((prev) => prev.slice(0, -1));
              }
            }}
            placeholder={tags.length === 0 ? 'e.g. arcteryx jacket hiking' : 'add tag…'}
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
            } as any}
          />
        </View>
        <Text className="text-xs text-ink-mute mb-6">
          Up to 10 tags. Press space, comma, or return to add.
        </Text>

        <Pressable
          onPress={handlePublish}
          disabled={publishing}
          style={({ pressed }) => ({
            height: 58,
            borderRadius: 16,
            backgroundColor: '#0F0F0F',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: publishing ? 0.7 : 1,
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
              backgroundColor: '#6C47FF',
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
              color: 'white',
              letterSpacing: 0.2,
              marginRight: 58,
            }}
          >
            {publishing ? 'Publishing…' : 'Publish listing'}
          </Text>
        </Pressable>
      </ScrollView>
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
