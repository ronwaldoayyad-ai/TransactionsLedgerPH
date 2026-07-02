import { useEffect, useRef, useState } from 'react'
import { TextInput, TextInputProps } from 'react-native'
import { formatAmount, parseAmount } from '../../lib/amortization'
import { colors, fonts } from '../../theme'

// Web CurrencyInput port: magnitude-only regex while typing, pretty
// re-format on blur. Same parse/format helpers as the web app.
const magnitude = /^[\d,]*\.?\d{0,2}$/

export default function CurrencyInput({
  value,
  onValueChange,
  ...props
}: Omit<TextInputProps, 'value'> & {
  value: number | null
  onValueChange: (n: number) => void
}) {
  const [text, setText] = useState(value == null ? '' : formatAmount(value))
  const focusedRef = useRef(false)

  useEffect(() => {
    if (!focusedRef.current) setText(value == null ? '' : formatAmount(value))
  }, [value])

  return (
    <TextInput
      keyboardType="decimal-pad"
      value={text}
      onFocus={() => {
        focusedRef.current = true
      }}
      onChangeText={(raw) => {
        if (!magnitude.test(raw)) return
        setText(raw)
        onValueChange(parseAmount(raw))
      }}
      onBlur={() => {
        focusedRef.current = false
        setText(value == null || value === 0 ? '' : formatAmount(value))
      }}
      placeholder="0.00"
      placeholderTextColor="#94a3b8"
      style={{
        fontFamily: fonts.mono,
        fontSize: 15,
        color: '#0f172a',
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        backgroundColor: '#ffffff',
      }}
      cursorColor={colors.navy800}
      {...props}
    />
  )
}
