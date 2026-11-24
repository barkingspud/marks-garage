/**
 * A photo from the camera or gallery, made small enough for the AI: at most 1568 pixels on the
 * long side (the size the AI reads at; larger only costs more) and JPEG-compressed.
 */
export async function toPhoto(file: File, max = 1568): Promise<{ data: string; mediaType: 'image/jpeg' }> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const url = canvas.toDataURL('image/jpeg', 0.85);
  return { data: url.slice(url.indexOf(',') + 1), mediaType: 'image/jpeg' };
}
