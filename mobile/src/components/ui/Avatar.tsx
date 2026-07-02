import { Text, View } from 'react-native'
import { Image } from 'expo-image'
import { colors } from '../../theme'

// Photo-or-initial circle (web Avatar parity), cached via expo-image.
export default function Avatar({
  name,
  url,
  size = 36,
}: {
  name: string
  url?: string | null
  size?: number
}) {
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        transition={150}
      />
    )
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.navy800,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontFamily: 'IBMPlexSans_600SemiBold', fontSize: size * 0.4 }}>
        {(name?.[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  )
}
