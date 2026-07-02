import { useState } from 'react'
import { Pressable, TextInput, TextInputProps, View } from 'react-native'
import Animated, { useAnimatedStyle, useDerivedValue, withTiming } from 'react-native-reanimated'
import { Eye, EyeOff } from 'lucide-react-native'
import { colors, fonts } from '../../theme'

// Web FloatingInput port: the label floats up when focused or filled (RN has
// no :placeholder-shown, so Reanimated drives it), with an eye toggle for
// password fields.
export default function FloatingInput({
  label,
  value,
  secure = false,
  ...props
}: TextInputProps & { label: string; value: string; secure?: boolean }) {
  const [focused, setFocused] = useState(false)
  const [hidden, setHidden] = useState(true)
  const up = useDerivedValue(
    () => withTiming(focused || value.length > 0 ? 1 : 0, { duration: 160 }),
    [focused, value],
  )

  const labelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -14 * up.value }, { scale: 1 - 0.22 * up.value }],
  }))

  return (
    <View
      className={`h-[58px] justify-end rounded-xl border bg-white px-4 pb-2 ${
        focused ? 'border-navy-400' : 'border-slate-300'
      }`}
    >
      <Animated.Text
        style={[
          labelStyle,
          {
            position: 'absolute',
            left: 16,
            top: 19,
            fontFamily: fonts.sans,
            fontSize: 15,
            color: focused ? colors.navy500 : colors.slate500,
            transformOrigin: 'left center',
          },
        ]}
        pointerEvents="none"
      >
        {label}
      </Animated.Text>
      <View className="flex-row items-center">
        <TextInput
          value={value}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          secureTextEntry={secure && hidden}
          style={{ flex: 1, fontFamily: fonts.sans, fontSize: 15, color: '#0f172a', paddingTop: 12 }}
          cursorColor={colors.navy800}
          selectionColor={colors.navy300}
          {...props}
        />
        {secure ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={10}
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          >
            {hidden ? (
              <Eye size={19} color={colors.slate500} />
            ) : (
              <EyeOff size={19} color={colors.slate500} />
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}
