import { Modal, Pressable, Text, View, useWindowDimensions } from 'react-native'
import { Image } from 'expo-image'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { X } from 'lucide-react-native'

// Full-screen image proof viewer with pinch-zoom + pan (gesture-handler on the
// UI thread). PDFs never reach here — they open via WebBrowser on a fresh
// signed URL (iOS Safari VC and Android custom tabs both render them).
export default function ProofViewer({
  url,
  fileName,
  onClose,
}: {
  url: string
  fileName: string
  onClose: () => void
}) {
  const { width, height } = useWindowDimensions()
  const scale = useSharedValue(1)
  const saved = useSharedValue(1)
  const tx = useSharedValue(0)
  const ty = useSharedValue(0)
  const savedTx = useSharedValue(0)
  const savedTy = useSharedValue(0)

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.set(Math.min(6, Math.max(1, saved.get() * e.scale)))
    })
    .onEnd(() => {
      saved.set(scale.get())
      if (scale.get() <= 1.02) {
        scale.set(withTiming(1))
        saved.set(1)
        tx.set(withTiming(0))
        ty.set(withTiming(0))
        savedTx.set(0)
        savedTy.set(0)
      }
    })

  const pan = Gesture.Pan()
    .minPointers(1)
    .onUpdate((e) => {
      if (saved.get() > 1.02) {
        tx.set(savedTx.get() + e.translationX)
        ty.set(savedTy.get() + e.translationY)
      }
    })
    .onEnd(() => {
      savedTx.set(tx.get())
      savedTy.set(ty.get())
    })

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const zoomed = saved.get() > 1.02
      scale.set(withTiming(zoomed ? 1 : 2.5))
      saved.set(zoomed ? 1 : 2.5)
      if (zoomed) {
        tx.set(withTiming(0))
        ty.set(withTiming(0))
        savedTx.set(0)
        savedTy.set(0)
      }
    })

  const gestures = Gesture.Simultaneous(pinch, pan, doubleTap)

  const imgStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.get() }, { translateY: ty.get() }, { scale: scale.get() }],
  }))

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 bg-black">
        <GestureDetector gesture={gestures}>
          <Animated.View style={[{ flex: 1 }, imgStyle]}>
            <Image
              source={{ uri: url }}
              style={{ width, height }}
              contentFit="contain"
              transition={150}
            />
          </Animated.View>
        </GestureDetector>
        <View className="absolute left-0 right-0 top-14 flex-row items-center justify-between px-5">
          <Text className="flex-1 pr-3 font-sans-medium text-sm text-white" numberOfLines={1}>
            {fileName}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            className="rounded-full bg-white/20 p-2"
            accessibilityLabel="Close"
          >
            <X size={20} color="#ffffff" />
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}
