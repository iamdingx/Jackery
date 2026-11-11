const targetBytes = 800 * 1024;
const variants = [[1920, 0.86], [1920, 0.76], [1600, 0.72]];
const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function needsPhotoCompression(file) {
  return file.size > targetBytes;
}

export async function compressPhoto(file) {
  const header = new Uint8Array(await file.slice(0, pngSignature.length).arrayBuffer());
  const validType = file.type === 'image/png'
    ? pngSignature.every((byte, index) => header[index] === byte)
    : file.type === 'image/jpeg' && header[0] === 0xff && header[1] === 0xd8;
  if (!validType) throw new Error('Unsupported image format');
  const source = URL.createObjectURL(file);
  const canvas = document.createElement('canvas');
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Image decoding failed'));
      image.src = source;
    });
    const context = canvas.getContext('2d', {alpha:false});
    if (!context || !image.naturalWidth || !image.naturalHeight) {
      throw new Error('Image dimensions are unavailable');
    }
    let compressed;
    for (const [longEdge, quality] of variants) {
      const scale = Math.min(1, longEdge / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      if (canvas.width !== width || canvas.height !== height || !compressed) {
        canvas.width = width;
        canvas.height = height;
        context.fillStyle = '#fff';
        context.fillRect(0, 0, width, height);
        context.imageSmoothingQuality = 'high';
        context.drawImage(image, 0, 0, width, height);
      }
      compressed = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (compressed?.size && compressed.type === 'image/jpeg' && compressed.size <= targetBytes) break;
    }
    if (!compressed?.size || compressed.type !== 'image/jpeg') throw new Error('JPEG encoding failed');
    return compressed;
  } finally {
    URL.revokeObjectURL(source);
    canvas.width = canvas.height = 0;
  }
}
