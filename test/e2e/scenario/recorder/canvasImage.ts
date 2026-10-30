// Decode the uploaded image onto a detached canvas and return its center pixel as [red, green, blue, alpha].
// Reading the uploaded bytes verifies the recorder's output, rather than just the original canvas drawing.
export async function readImagePixel(base64Image: string) {
  const image = new Image()
  image.src = `data:image/webp;base64,${base64Image}`
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')!
  context.drawImage(image, 0, 0)
  return Array.from(context.getImageData(5, 5, 1, 1).data)
}
