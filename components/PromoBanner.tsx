import { View, Text, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface PromoBannerProps {
  onReadMore?: () => void;
}

export function PromoBanner({ onReadMore }: PromoBannerProps) {
  return (
    <View className="px-4 pb-2">
      <LinearGradient
        colors={['#7C3AED', '#A855F7', '#c8e83a']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.4 }}
        style={{ borderRadius: 16, padding: 16 }}
      >
        <View className="flex-row items-center">
          <View className="flex-1 pr-3">
            <Text className="text-[11px] text-white/80 font-medium">The Carrinex lottery</Text>
            <Text className="text-[15px] font-bold text-white leading-[21px] mt-0.5">
              Win a Carrinex gift card{'\n'}worth 5000 SEK
            </Text>
            <Pressable
              onPress={onReadMore}
              className="mt-3 bg-black rounded-full px-4 py-1.5 self-start"
            >
              <Text className="text-white text-[12px] font-bold">Read more</Text>
            </Pressable>
            <Text className="text-[9px] text-white/60 mt-2 leading-[12px]">
              1 uploaded listing = 1 entry in the lottery. Three winners in total.{'\n'}
              The campaign runs from April 12 to April 20.
            </Text>
          </View>

          <View className="items-center justify-center">
            <LinearGradient
              colors={['#5B21B6', '#7C3AED']}
              style={{
                width: 80,
                height: 52,
                borderRadius: 8,
                padding: 8,
                overflow: 'hidden',
                transform: [{ rotate: '-6deg' }],
              }}
            >
              <Text style={{ color: 'white', fontStyle: 'italic', fontWeight: '800', fontSize: 14 }}>
                Carrinex
              </Text>
              <View
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  width: 38,
                  height: 28,
                  backgroundColor: '#c8e83a',
                  borderTopLeftRadius: 22,
                  borderBottomRightRadius: 8,
                }}
              />
            </LinearGradient>
          </View>
        </View>
      </LinearGradient>

      <View className="flex-row justify-center items-center mt-2">
        <View style={{ width: 18, height: 5, borderRadius: 3, backgroundColor: '#1f2937' }} />
        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#d1d5db', marginLeft: 4 }} />
      </View>
    </View>
  );
}
