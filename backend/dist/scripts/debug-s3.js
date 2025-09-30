"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const s3_1 = require("../config/s3");
async function debugS3() {
    console.log('🔍 Debugging S3 configuration...\n');
    console.log('Environment variables:');
    console.log(`  AWS_REGION: ${process.env.AWS_REGION}`);
    console.log(`  AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? 'SET' : 'MISSING'}`);
    console.log(`  AWS_SECRET_ACCESS_KEY: ${process.env.AWS_SECRET_ACCESS_KEY ? 'SET' : 'MISSING'}`);
    console.log(`  S3_BUCKET_NAME: ${process.env.S3_BUCKET_NAME}`);
    console.log('\nS3 Config:');
    console.log(`  Region: ${s3_1.s3Config.region}`);
    console.log(`  Bucket: ${s3_1.s3Config.bucketName}`);
    console.log(`  Access Key: ${s3_1.s3Config.accessKeyId ? 'SET' : 'MISSING'}`);
    console.log(`  Secret Key: ${s3_1.s3Config.secretAccessKey ? 'SET' : 'MISSING'}`);
    try {
        console.log('\nTesting S3 connection...');
        const { ListObjectsV2Command } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-s3')));
        const command = new ListObjectsV2Command({
            Bucket: s3_1.s3Config.bucketName,
            MaxKeys: 1
        });
        const response = await s3_1.s3Client.send(command);
        console.log('✅ S3 connection successful!');
        console.log(`   Bucket exists and accessible`);
    }
    catch (error) {
        console.log('❌ S3 connection failed:', error);
    }
}
debugS3();
//# sourceMappingURL=debug-s3.js.map