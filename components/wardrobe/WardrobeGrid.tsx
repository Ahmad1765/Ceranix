import { View, Pressable, useWindowDimensions } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import type { WardrobePost } from '@/lib/wardrobe';

export function WardrobeGrid({ posts, onDelete }: { posts: WardrobePost[]; onDelete?: (id: string) => void }) {
  const { width } = useWindowDimensions();
  const tile = (Math.min(width, 560) - 20 * 2 - 10) / 2;

  if (posts.length === 0) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 60 }}>
        <Feather name="image" size={28} color="rgba(15,15,15,0.3)" />
        <Text style={{ marginTop: 10, color: 'rgba(15,15,15,0.5)' }}>Nothing here yet</Text>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 20 }}>
      {posts.map((p) => (
        <View key={p.id} style={{ width: tile, height: tile * 1.3, borderRadius: 14, overflow: 'hidden', backgroundColor: '#F2F2F4' }}>
          <Image source={{ uri: p.image_url }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
          <View style={{ position: 'absolute', bottom: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Feather name="heart" size={11} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{p.likes_count}</Text>
          </View>
          {onDelete && (
            <Pressable onPress={() => onDelete(p.id)} hitSlop={8} style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 999, backgroundColor: 'rgba(15,15,15,0.72)', alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="trash-2" size={13} color="#fff" />
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}
