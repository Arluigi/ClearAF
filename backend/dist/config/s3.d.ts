import { S3Client } from '@aws-sdk/client-s3';
export declare const s3Config: {
    region: string;
    bucketName: string;
    accessKeyId: string;
    secretAccessKey: string;
};
export declare const s3Client: S3Client;
export declare function generatePhotoKey(userId: string, fileName: string): string;
export declare function getS3PublicUrl(key: string): string;
export default s3Client;
//# sourceMappingURL=s3.d.ts.map