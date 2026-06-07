/**
 * Compresses an image file client-side to save bandwidth and API cost.
 * @param file The original image file
 * @param maxWidth Max width or height
 * @param quality JPEG quality (0 to 1)
 * @returns A base64 representation of the compressed image (e.g. data:image/jpeg;base64,...)
 */
export async function compressImage(
  file: File,
  maxWidth: number = 1024,
  quality: number = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxWidth) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Failed to get canvas context'));
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convert to JPEG format for best compression
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };

      if (e.target?.result) {
        img.src = e.target.result as string;
      } else {
        reject(new Error('File reader result is null'));
      }
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Helper to get only the base64 string without the data URI prefix.
 * e.g., "data:image/jpeg;base64,XXXX" -> "XXXX"
 */
export async function compressImageToBase64(
  file: File,
  maxWidth: number = 1024,
  quality: number = 0.8
): Promise<string> {
  const dataUrl = await compressImage(file, maxWidth, quality);
  return dataUrl.split(',')[1];
}
