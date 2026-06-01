import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';

export default function FeedScreen() {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        
        {/* Header & Hero Section */}
        <LinearGradient
          colors={['#6C47FF', '#6C47FF', '#6C47FF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="w-full pt-16 rounded-b-[40px] items-center justify-start relative mb-8"
          style={{ minHeight: 460, overflow: 'hidden' }}
        >
          {/* Subtle noise overlay simulation (optional depending on platform, using simple transparent gradient for now) */}
          <View className="absolute inset-0 bg-white/10" style={{ mixBlendMode: 'overlay' as any }} />

          <Text className="text-white text-[14px] mb-2 z-10">
            Say hi to <Text className="italic font-serif">Nybegagnat</Text>
          </Text>

          <Text className="text-white font-black text-[36px] text-center leading-[40px] tracking-[-0.7px] mb-4 px-4 z-10" style={{letterSpacing: -0.7}}>
            Cheaper than new,{'\n'}better than used.
          </Text>

          <Text className="text-white font-medium text-center text-[16px] mb-8 leading-relaxed px-8 z-10" style={{ opacity: 0.85 }}>
            As new. Perfected by professionals. Warranty included.
          </Text>

          {/* iPhones */}
          <View className="flex-row items-end justify-center w-full absolute bottom-[-5] z-0">
             {/* Lavender iPhone Back */}
             <View className="bg-white/30 rounded-[24px] shadow-lg border border-white/40 absolute" style={{ width: 85, height: 180, left: '12%', bottom: -10, transform: [{rotate: '-12deg'}], elevation: 2 }} />
             {/* Pink iPhone Back */}
             <View className="bg-white/50 rounded-[24px] shadow-lg border border-white/60 absolute" style={{ width: 90, height: 190, left: '26%', bottom: -5, zIndex: 3, transform: [{rotate: '-6deg'}], elevation: 3 }} />
             {/* Silver/White iPhone Back */}
             <View className="bg-white/70 rounded-[24px] shadow-lg border border-white/80 absolute" style={{ width: 90, height: 200, right: '23%', bottom: -15, zIndex: 4, transform: [{rotate: '8deg'}], elevation: 4 }} />

             {/* Front-most iPhone showing screen with Dynamic Island */}
             <View className="bg-white rounded-[26px] border-[6px] border-[#0F0F0F] items-center justify-center shadow-2xl absolute overflow-hidden" style={{ width: 110, height: 220, right: '35%', bottom: -20, zIndex: 10, transform: [{rotate: '2deg'}], elevation: 10 }}>
                {/* Dynamic island */}
                <View className="w-16 h-4 bg-[#0F0F0F] rounded-full absolute top-1 z-20" />

                {/* Screen content */}
                <View className="absolute inset-0 z-0" style={{ backgroundColor: 'rgba(108,71,255,0.10)' }} />
                <Text className="font-extrabold text-[24px] absolute z-10 bottom-14 italic tracking-tighter" style={{ color: '#6C47FF' }}>Carrinex</Text>
             </View>
          </View>
        </LinearGradient>

        {/* Feature / USP Section Grid (2x2) */}
        <View className="px-5">
          <View className="flex-row flex-wrap justify-between" style={{ gap: 10 }}>
             {/* Certified */}
             <View className="bg-primary-soft py-3 px-3 rounded-[10px] flex-row items-center flex-1 min-w-[45%]" style={{ shadowColor: '#6C47FF', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 }}>
               <MaterialCommunityIcons name="check-decagram" size={24} color="#6C47FF" className="mr-2" />
               <Text className="text-primary font-semibold text-[13px] flex-1 leading-tight">Certified by experts</Text>
             </View>
             {/* Warranty */}
             <View className="bg-primary-soft py-3 px-3 rounded-[10px] flex-row items-center flex-1 min-w-[45%]" style={{ shadowColor: '#6C47FF', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 }}>
               <MaterialCommunityIcons name="shield" size={24} color="#6C47FF" className="mr-2" />
               <Text className="text-primary font-semibold text-[13px] flex-1 leading-tight">Minimum 1 year warranty</Text>
             </View>
             {/* Return policy */}
             <View className="bg-primary-soft py-3 px-3 rounded-[10px] flex-row items-center flex-1 min-w-[45%]" style={{ shadowColor: '#6C47FF', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 }}>
               <View className="mr-2 flex-row items-center relative">
                 <View className="absolute left-[-4] z-10" style={{gap: 2}}>
                    <View className="w-2.5 h-[1.5px] bg-primary-soft rounded-full absolute top-[1px]" />
                    <View className="w-3.5 h-[1.5px] bg-primary-soft rounded-full absolute top-[5px]" />
                    <View className="w-2 h-[1.5px] bg-primary-soft rounded-full absolute top-[9px]" />

                    <View className="w-2 h-[1.5px] bg-[#6C47FF] rounded-full" style={{transform:[{translateX: -1}]}} />
                    <View className="w-3.5 h-[1.5px] bg-[#6C47FF] rounded-full" style={{transform:[{translateX: -2}]}} />
                    <View className="w-2 h-[1.5px] bg-[#6C47FF] rounded-full" style={{transform:[{translateX: 0}]}} />
                 </View>
                 <MaterialCommunityIcons name="shopping" size={22} color="#6C47FF" />
               </View>
               <Text className="text-primary font-semibold text-[13px] flex-1 leading-tight">30 days return policy</Text>
             </View>
             {/* Delivery */}
             <View className="bg-primary-soft py-3 px-3 rounded-[10px] flex-row items-center flex-1 min-w-[45%]" style={{ shadowColor: '#6C47FF', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 }}>
               <MaterialCommunityIcons name="truck-fast" size={24} color="#6C47FF" className="mr-2" />
               <Text className="text-primary font-semibold text-[13px] flex-1 leading-tight">Express delivery</Text>
             </View>
          </View>
        </View>

        {/* Category Selector (Pills) */}
        <View className="pt-8 mb-6">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            <Pressable className="bg-primary px-4 py-2 rounded-full">
              <Text className="font-semibold text-white text-[14px]">iPhones</Text>
            </Pressable>
            <Pressable className="bg-ink-panel px-4 py-2 rounded-full border border-ink-hair">
              <Text className="text-black text-[14px]">Samsung mobiler</Text>
            </Pressable>
            <Pressable className="bg-ink-panel px-4 py-2 rounded-full border border-ink-hair">
              <Text className="text-black text-[14px]">Smartklockor</Text>
            </Pressable>
          </ScrollView>
        </View>

        {/* Product Grid */}
        <View className="px-4">
          <View className="flex-row justify-between" style={{ gap: 16 }}>
            {/* Card 1: iPhone 11 */}
            <Pressable className="flex-1 bg-white rounded-[16px] pb-3" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 3 }}>
              {/* Image Box */}
              <View className="bg-ink-panel rounded-[12px] aspect-[4/5] items-center justify-center relative mb-3 overflow-hidden">
                 <Image source={{ uri: 'https://images.unsplash.com/photo-1591337676887-a4b1fbe40c56?w=400&q=80' }} className="w-[85%] h-[85%]" contentFit="contain" />
                 
                 {/* Condition Badge (Bottom-left) */}
                 <View className="absolute bottom-2 left-2 bg-white/90 px-2 py-1 rounded-[6px]">
                   <Text className="text-black text-[10px] font-bold">Great condition</Text>
                 </View>
              </View>
              {/* Product Text */}
              <View className="px-2">
                <Text className="text-[14px] font-medium text-black mb-1">iPhone 11</Text>
                <Text className="text-[16px] font-bold text-black">From $1399</Text>
              </View>
            </Pressable>

            {/* Card 2: iPhone 11 Pro */}
            <Pressable className="flex-1 bg-white rounded-[16px] pb-3" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 3 }}>
              {/* Image Box */}
              <View className="bg-ink-panel rounded-[12px] aspect-[4/5] items-center justify-center relative mb-3 overflow-hidden">
                 <Image source={{ uri: 'https://images.unsplash.com/photo-1603921326210-6edd2d60ca68?w=400&q=80' }} className="w-[85%] h-[85%]" contentFit="contain" />
                 
                 {/* Condition Badge (Bottom-left) */}
                 <View className="absolute bottom-2 left-2 bg-white/90 px-2 py-1 rounded-[6px]">
                   <Text className="text-black text-[10px] font-bold">Like new</Text>
                 </View>
              </View>
              {/* Product Text */}
              <View className="px-2">
                <Text className="text-[14px] font-medium text-black mb-1">iPhone 11 Pro</Text>
                <Text className="text-[16px] font-bold text-black">From $1890</Text>
              </View>
            </Pressable>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
