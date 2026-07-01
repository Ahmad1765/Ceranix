import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import type { WardrobePost } from '@/lib/wardrobe';

export function WardrobeCard({ post }: { post: WardrobePost }) {
  return (
    <View style={{ flex: 1, borderRadius: 24, overflow: 'hidden', backgroundColor: '#F2F2F4' }}>
      <Image source={{ uri: post.image_url }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 18, backgroundColor: 'rgba(0,0,0,0.28)' }}>
        {!!post.author?.username && (
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>@{post.author.username}</Text>
        )}
        {!!post.caption && (
          <Text numberOfLines={2} style={{ color: 'rgba(255,255,255,0.92)', marginTop: 3, fontSize: 14 }}>{post.caption}</Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 }}>
          <Feather name="heart" size={14} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{post.likes_count}</Text>
        </View>
      </View>
    </View>
  );
}
