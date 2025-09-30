"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PHOTO_BUCKET = exports.supabaseAdmin = exports.supabase = void 0;
exports.getPublicUrl = getPublicUrl;
exports.generatePhotoPath = generatePhotoPath;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
}
exports.supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseAnonKey);
exports.supabaseAdmin = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceKey || supabaseAnonKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});
exports.PHOTO_BUCKET = 'patient-photos';
function getPublicUrl(bucket, filePath) {
    const { data } = exports.supabase.storage.from(bucket).getPublicUrl(filePath);
    return data.publicUrl;
}
function generatePhotoPath(userId, originalName) {
    const timestamp = new Date().getTime();
    const extension = originalName.split('.').pop() || 'jpg';
    return `${userId}/${timestamp}.${extension}`;
}
//# sourceMappingURL=supabase.js.map