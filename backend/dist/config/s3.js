"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.s3Client = exports.s3Config = void 0;
exports.generatePhotoKey = generatePhotoKey;
exports.getS3PublicUrl = getS3PublicUrl;
const client_s3_1 = require("@aws-sdk/client-s3");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.s3Config = {
    region: process.env.AWS_REGION || 'us-east-2',
    bucketName: process.env.S3_BUCKET_NAME || 'clearaf-photos',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};
const requiredEnvVars = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'S3_BUCKET_NAME'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.warn(`⚠️  Missing S3 environment variables: ${missingVars.join(', ')}`);
    console.warn('   Photo uploads will not work until these are configured.');
}
exports.s3Client = new client_s3_1.S3Client({
    region: exports.s3Config.region,
    credentials: {
        accessKeyId: exports.s3Config.accessKeyId || '',
        secretAccessKey: exports.s3Config.secretAccessKey || '',
    },
});
function generatePhotoKey(userId, fileName) {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const extension = fileName.split('.').pop() || 'jpg';
    return `photos/${userId}/${timestamp}_${randomId}.${extension}`;
}
function getS3PublicUrl(key) {
    return `https://${exports.s3Config.bucketName}.s3.${exports.s3Config.region}.amazonaws.com/${key}`;
}
exports.default = exports.s3Client;
//# sourceMappingURL=s3.js.map