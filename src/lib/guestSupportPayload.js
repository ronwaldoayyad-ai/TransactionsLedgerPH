// Keep guest screenshots below the function request limit. Signed-in documents
// already upload directly to Supabase Storage, outside the function body.
export async function guestSupportPayload(payload) {
  if (!payload.file) return payload
  const file = payload.file
  if (!/^data:image\/(jpeg|png|webp|gif|bmp|avif);base64,/.test(file.data || '')) throw Error('Choose a supported screenshot.')
  const blob = await fetch(file.data).then(response => response.blob())
  if (!blob.size || blob.size > 5242880) throw Error('Choose a screenshot up to 5 MB.')
  if (blob.size <= 2500000) return payload
  const bitmap = await createImageBitmap(blob)
  try {
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    let image
    for (const quality of [.92, .8, .65]) {
      image = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality))
      if (image && image.size <= 2500000) break
    }
    if (!image || image.size > 2500000) throw Error('Choose a smaller screenshot.')
    const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(image) })
    return { ...payload, file: { name: String(file.name || 'screenshot').replace(/\.[^.]+$/, '') + '.webp', data } }
  } finally { bitmap.close() }
}
