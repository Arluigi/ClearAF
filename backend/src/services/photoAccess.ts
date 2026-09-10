import { supabaseAdmin, PHOTO_BUCKET } from '../config/supabase';

export const PHOTO_URL_TTL_SECONDS = 300;

// Supports legacy public URLs only for this exact project/bucket. Reject ambiguous
// encodings before URL normalization can hide traversal or a different owner.
export function ownedPhotoPath(value: string, ownerId: string): string {
  let path = value;
  if (/[%\\?#]/.test(value)) throw new Error('Invalid stored photo path');
  if (value.startsWith('https://')) {
    const url = new URL(value);
    const project = new URL(process.env.SUPABASE_URL!);
    const prefix = `/storage/v1/object/public/${PHOTO_BUCKET}/`;
    if (url.origin !== project.origin || url.username || url.password || !url.pathname.startsWith(prefix)) {
      throw new Error('Untrusted stored photo URL');
    }
    path = value.slice(project.origin.length + prefix.length);
  }
  if (!/^[a-f0-9-]{36}\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp|heic)$/i.test(path) || path.split('/')[0] !== ownerId) {
    throw new Error('Photo object does not belong to its record owner');
  }
  return path;
}

export async function privatePhoto<T extends { photoUrl: string }>(photo: T, ownerId: string): Promise<T> {
  const path = ownedPhotoPath(photo.photoUrl, ownerId);
  const { data, error } = await supabaseAdmin.storage.from(PHOTO_BUCKET).createSignedUrl(path, PHOTO_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new Error('Unable to authorize photo download');
  return { ...photo, photoUrl: data.signedUrl };
}

export async function privatePhotos<T extends { photoUrl: string }>(photos: T[], ownerId: string): Promise<T[]> {
  return Promise.all(photos.map(photo => privatePhoto(photo, ownerId)));
}

export async function deletePhotoObject(photo: { photoUrl: string; userId: string }): Promise<void> {
  const path = ownedPhotoPath(photo.photoUrl, photo.userId);
  const { error } = await supabaseAdmin.storage.from(PHOTO_BUCKET).remove([path]);
  if (error) throw new Error('Unable to delete photo object; retry the deletion');
}
