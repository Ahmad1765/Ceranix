import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';

interface BinocularsIconProps {
  width?: number;
  height?: number;
}

export function BinocularsIcon({ width = 52, height = 46 }: BinocularsIconProps) {
  return (
    <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
      <Image
        source={require('@/assets/images/binoculars.png')}
        style={{ width: '100%', height: '100%' }}
        contentFit="contain"
        transition={150}
      />
    </View>
  );
}
