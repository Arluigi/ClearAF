import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Client for general operations (with anon key)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client for file operations (with service role key)
export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceKey || supabaseAnonKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Storage bucket configuration
export const PHOTO_BUCKET = 'patient-photos';

// Helper function to get public URL
export function getPublicUrl(bucket: string, filePath: string) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}

// Helper function to generate unique filename
export function generatePhotoPath(userId: string, originalName: string): string {
  const timestamp = new Date().getTime();
  const extension = originalName.split('.').pop() || 'jpg';
  return `${userId}/${timestamp}.${extension}`;
}