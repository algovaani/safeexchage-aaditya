import { v2 as cloudinary } from 'cloudinary';

const configured =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET;

if (configured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

export async function uploadBuffer(
  buffer: Buffer,
  folder: string,
  filename: string,
  mime: string
): Promise<string> {
  if (!configured) {
    const b64 = buffer.toString('base64');
    return `data:${mime};base64,${b64}`;
  }
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `safex/${folder}`, public_id: filename, resource_type: 'auto' },
      (err, result) => {
        if (err || !result) reject(err || new Error('Upload failed'));
        else resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}
