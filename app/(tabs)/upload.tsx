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
import { RequireAuth } from '@/components/RequireAuth';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { uploadListingImages, type LocalImage } from '@/lib/upload';
import { useToast } from '@/lib/toast';
import type { Category, Condition, Gender } from '@/types';

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
  const { user } = useAuth();
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
        })
        .select('id')
        .single();

      if (error) throw error;

      const newId = data!.id as string;
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
        <View className="flex-row items-center justify-center px-4 pt-4 pb-4 border-b border-gray-100 relative">
          <Pressable onPress={() => router.back()} className="absolute left-4 bottom-4">
            <Feather name="arrow-left" size={26} color="black" />
          </Pressable>
          <Text className="text-[17px] font-semibold text-gray-900">Upload listing</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          {/* Title */}
          <Text className="text-[34px] font-bold text-gray-900 leading-[42px] mb-2">
            What do you want to add?
          </Text>

          {/* Instruction card */}
          <View className="bg-gray-50 rounded-2xl p-5 mt-2 mb-8">
            <Text className="text-[17px] font-bold text-gray-900 mb-1.5 ">Start by uploading photos</Text>
            <Text className="text-[15px] text-gray-600 leading-[22px]">
              Choose clear images that show the front, back, label and details. Here you can see{' '}
              <Text className="font-bold underline text-gray-800">examples</Text>
            </Text>
          </View>

          {/* Image grid */}
          <Text className="text-[17px] font-bold text-gray-900 mb-4">
            <Text className="text-red-500">• </Text>
            Add images <Text className="text-gray-400 font-normal">max 7</Text>
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-8" contentContainerStyle={{ gap: 12 }}>
            {images.map((img, i) => (
              <View key={i} style={{ width: 160, height: 210 }} className="relative">
                <Image
                  source={{ uri: img.uri }}
                  style={{ width: '100%', height: '100%' }}
                  className="rounded-lg bg-gray-100 border border-gray-100"
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
                className="border border-gray-200 rounded-lg items-center justify-center bg-white"
              >
                <Feather name="plus" size={32} color="black" />
                <Text className="text-[17px] text-gray-900 mt-1">Add</Text>
              </Pressable>
            )}

            {/* Always show at least one more placeholder if we haven't reached max and don't have many images */}
            {images.length < MAX_IMAGES - 1 && (
               <Pressable
               onPress={pickImages}
               style={{ width: 160, height: 210 }}
               className="border border-gray-200 rounded-lg items-center justify-center bg-white"
             >
               <Feather name="plus" size={32} color="black" />
               <Text className="text-[17px] text-gray-900 mt-1">Add</Text>
             </Pressable>
            )}

            {/* Third placeholder for visual consistency with screenshot */}
            {images.length < MAX_IMAGES - 2 && (
               <View
               style={{ width: 60, height: 210 }}
               className="border-l border-t border-b border-gray-200 rounded-l-lg bg-white opacity-40"
             />
            )}
          </ScrollView>

          {/* AI Prefill toggle */}
          <View className="bg-gray-50 rounded-2xl p-5 mb-10 flex-row items-center">
            <View className="flex-1 mr-4">
              <View className="flex-row items-center mb-1.5">
                <Ionicons name="sparkles" size={20} color="black" style={{ marginRight: 8 }} />
                <Text className="text-[17px] font-bold text-gray-900">Help me prefill my ad</Text>
              </View>
              <Text className="text-[15px] text-gray-600 leading-[22px]">
                Let our AI help you describe your item. It won't get easier than this!
              </Text>
            </View>
            <Pressable
              onPress={() => setAiPrefill(!aiPrefill)}
              className={`w-[52px] h-[32px] rounded-full p-1 transition-colors duration-300 ${aiPrefill ? 'bg-[#651FFF]' : 'bg-gray-200'}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: aiPrefill ? 'flex-end' : 'flex-start'
              }}
            >
              <View
                className="w-6 h-6 rounded-full bg-white shadow-sm"
                style={{
                  elevation: 2,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.2,
                  shadowRadius: 1.5,
                }}
              />
            </Pressable>
          </View>
        </ScrollView>

        {/* Continue button */}
        <View className="px-5 pb-8 pt-3 border-t border-gray-50">
          <Pressable
            onPress={handleContinue}
            className="bg-black rounded-xl py-[18px] items-center"
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
      <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-gray-100">
        <Pressable onPress={() => setStep('photos')} className="mr-4">
          <Feather name="arrow-left" size={22} color="#374151" />
        </Pressable>
        <Text className="text-base font-semibold text-gray-900">Listing details</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Thumbnail strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }} contentContainerStyle={{ gap: 8 }}>
          {images.map((img, i) => (
            <Image
              key={i}
              source={{ uri: img.uri }}
              style={{ width: 80, height: 80 }}
              className="rounded-xl bg-gray-100"
              contentFit="cover"
            />
          ))}
        </ScrollView>

        {/* Title */}
        <Text className="text-sm font-medium text-gray-700 mb-1">Title *</Text>
        <TextInput
          className="border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-900 mb-4"
          placeholder="e.g. Zara floral midi dress"
          value={title}
          onChangeText={setTitle}
        />

        {/* Brand */}
        <Text className="text-sm font-medium text-gray-700 mb-1">Brand</Text>
        <TextInput
          className="border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-900 mb-4"
          placeholder="e.g. Zara, Nike, Khaadi"
          value={brand}
          onChangeText={setBrand}
        />

        {/* Price */}
        <Text className="text-sm font-medium text-gray-700 mb-1">Price (USD) *</Text>
        <TextInput
          className="border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-900 mb-4"
          placeholder="e.g. 2500"
          keyboardType="numeric"
          value={price}
          onChangeText={setPrice}
        />

        {/* Category */}
        <Text className="text-sm font-medium text-gray-700 mb-2">Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ gap: 8 }}>
          {CATEGORIES.map((c) => (
            <Pressable
              key={c.value}
              onPress={() => setCategory(c.value)}
              className={`px-3 py-1.5 rounded-full border ${category === c.value ? 'bg-gray-900 border-gray-900' : 'border-gray-200'}`}
            >
              <Text className={`text-sm ${category === c.value ? 'text-white' : 'text-gray-700'}`}>{c.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Gender */}
        <Text className="text-sm font-medium text-gray-700 mb-2">For</Text>
        <View className="flex-row mb-4" style={{ gap: 8 }}>
          {GENDERS.map((g) => (
            <Pressable
              key={g.value}
              onPress={() => setGender(g.value)}
              className={`flex-1 py-2 rounded-xl border items-center ${gender === g.value ? 'bg-gray-900 border-gray-900' : 'border-gray-200'}`}
            >
              <Text className={`text-sm ${gender === g.value ? 'text-white' : 'text-gray-700'}`}>{g.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Condition */}
        <Text className="text-sm font-medium text-gray-700 mb-2">Condition</Text>
        <View className="mb-4" style={{ gap: 8 }}>
          {CONDITIONS.map((c) => (
            <Pressable
              key={c.value}
              onPress={() => setCondition(c.value)}
              className={`flex-row items-center px-3 py-3 rounded-xl border ${condition === c.value ? 'border-[#6C47FF] bg-[#f1edff]' : 'border-gray-200'}`}
            >
              <View className={`w-4 h-4 rounded-full border-2 mr-3 items-center justify-center ${condition === c.value ? 'border-[#6C47FF]' : 'border-gray-300'}`}>
                {condition === c.value && <View className="w-2 h-2 rounded-full bg-[#6C47FF]" />}
              </View>
              <Text className="text-sm text-gray-800">{c.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Size */}
        <Text className="text-sm font-medium text-gray-700 mb-1">Size</Text>
        <TextInput
          className="border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-900 mb-4"
          placeholder="e.g. S, M, L, 42, Free"
          value={size}
          onChangeText={setSize}
        />

        {/* Description */}
        <Text className="text-sm font-medium text-gray-700 mb-1">Description</Text>
        <TextInput
          className="border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-900 mb-6"
          placeholder="Describe the item — condition, measurements, why selling..."
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          style={{ minHeight: 100 }}
        />

        <Pressable
          onPress={handlePublish}
          disabled={publishing}
          style={({ pressed }) => ({
            height: 58,
            borderRadius: 16,
            backgroundColor: '#0a0a0a',
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
              backgroundColor: '#d8f53a',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {publishing ? (
              <ActivityIndicator color="#0a0a0a" />
            ) : (
              <Feather name="arrow-up-right" size={20} color="#0a0a0a" />
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
