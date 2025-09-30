export declare const supabase: import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any>;
export declare const supabaseAdmin: import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any>;
export declare const PHOTO_BUCKET = "patient-photos";
export declare function getPublicUrl(bucket: string, filePath: string): string;
export declare function generatePhotoPath(userId: string, originalName: string): string;
//# sourceMappingURL=supabase.d.ts.map