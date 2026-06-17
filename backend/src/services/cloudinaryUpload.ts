import { v2 as cloudinary } from "cloudinary";
import { ENV } from "../config/env";

cloudinary.config({
  cloud_name: ENV.CLOUDINARY_CLOUD_NAME,
  api_key: ENV.CLOUDINARY_API_KEY,
  api_secret: ENV.CLOUDINARY_API_SECRET,
});

export async function uploadImage(dataUrl: string): Promise<string> {
  const result = await cloudinary.uploader.upload(dataUrl, {
    folder: "concreteflow/site-photos",
    resource_type: "image",
  });
  return result.secure_url;
}

export async function uploadImages(dataUrls: string[]): Promise<string[]> {
  return Promise.all(
    dataUrls.map((url) =>
      url.startsWith("data:") ? uploadImage(url) : url
    )
  );
}

/** Extract Cloudinary public_id from a secure_url, e.g.
 *  https://res.cloudinary.com/{cloud}/image/upload/v123/{public_id}.jpg
 *  → "concreteflow/site-photos/abc123"
 */
function publicIdFromUrl(url: string): string | null {
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/);
  return match ? match[1] : null;
}

export async function deleteImages(urls: string[]): Promise<void> {
  const ids = urls.map(publicIdFromUrl).filter(Boolean) as string[];
  await Promise.all(ids.map((id) => cloudinary.uploader.destroy(id)));
}
