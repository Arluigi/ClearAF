import { S3Client } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

// S3 Configuration
export const s3Config = {
  region: process.env.AWS_REGION || 'us-east-2',
  bucketName: process.env.S3_BUCKET_NAME || 'clearaf-photos',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

// Validate required environment variables
const requiredEnvVars = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'S3_BUCKET_NAME'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.warn(`⚠️  Missing S3 environment variables: ${missingVars.join(', ')}`);
  console.warn('   Photo uploads will not work until these are configured.');
}

// Create S3 client
export const s3Client = new S3Client({
  region: s3Config.region,
  credentials: {
    accessKeyId: s3Config.accessKeyId || '',
    secretAccessKey: s3Config.secretAccessKey || '',
  },
});

// Helper function to generate S3 key for photos
export function generatePhotoKey(userId: string, fileName: string): string {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  const extension = fileName.split('.').pop() || 'jpg';
  
  return `photos/${userId}/${timestamp}_${randomId}.${extension}`;
}

// Helper function to get public URL from S3 key
export function getS3PublicUrl(key: string): string {
  return `https://${s3Config.bucketName}.s3.${s3Config.region}.amazonaws.com/${key}`;
}

export default s3Client;