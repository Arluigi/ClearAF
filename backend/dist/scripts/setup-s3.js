"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_1 = require("../config/s3");
async function setupS3Bucket() {
    console.log('🪣 Setting up S3 bucket for Clear AF photos...\n');
    try {
        console.log(`Creating bucket: ${s3_1.s3Config.bucketName}`);
        try {
            await s3_1.s3Client.send(new client_s3_1.CreateBucketCommand({
                Bucket: s3_1.s3Config.bucketName,
                CreateBucketConfiguration: s3_1.s3Config.region !== 'us-east-1' ? {
                    LocationConstraint: s3_1.s3Config.region
                } : undefined
            }));
            console.log('✅ Bucket created successfully');
        }
        catch (error) {
            if (error.name === 'BucketAlreadyOwnedByYou') {
                console.log('✅ Bucket already exists and owned by you');
            }
            else if (error.name === 'BucketAlreadyExists') {
                console.log('❌ Bucket name already taken by someone else');
                return;
            }
            else {
                throw error;
            }
        }
        console.log('\nSetting up CORS policy...');
        const corsConfiguration = {
            CORSRules: [
                {
                    AllowedHeaders: ['*'],
                    AllowedMethods: ['GET', 'HEAD'],
                    AllowedOrigins: ['*'],
                    ExposeHeaders: [],
                    MaxAgeSeconds: 3000
                }
            ]
        };
        await s3_1.s3Client.send(new client_s3_1.PutBucketCorsCommand({
            Bucket: s3_1.s3Config.bucketName,
            CORSConfiguration: corsConfiguration
        }));
        console.log('✅ CORS policy configured');
        console.log('\nSetting up public read policy...');
        const bucketPolicy = {
            Version: '2012-10-17',
            Statement: [
                {
                    Sid: 'PublicReadGetObject',
                    Effect: 'Allow',
                    Principal: '*',
                    Action: 's3:GetObject',
                    Resource: `arn:aws:s3:::${s3_1.s3Config.bucketName}/*`
                }
            ]
        };
        await s3_1.s3Client.send(new client_s3_1.PutBucketPolicyCommand({
            Bucket: s3_1.s3Config.bucketName,
            Policy: JSON.stringify(bucketPolicy)
        }));
        console.log('✅ Public read policy configured');
        console.log('\n🎉 S3 bucket setup complete!');
        console.log(`\n📝 Bucket details:`);
        console.log(`   Name: ${s3_1.s3Config.bucketName}`);
        console.log(`   Region: ${s3_1.s3Config.region}`);
        console.log(`   Public URL: https://${s3_1.s3Config.bucketName}.s3.${s3_1.s3Config.region}.amazonaws.com/`);
        console.log(`\n🔧 Next steps:`);
        console.log(`   1. Set environment variables in Render dashboard:`);
        console.log(`      AWS_ACCESS_KEY_ID=${s3_1.s3Config.accessKeyId}`);
        console.log(`      AWS_SECRET_ACCESS_KEY=***`);
        console.log(`      S3_BUCKET_NAME=${s3_1.s3Config.bucketName}`);
        console.log(`      AWS_REGION=${s3_1.s3Config.region}`);
        console.log(`   2. Deploy the updated backend`);
        console.log(`   3. Test photo upload from iOS app`);
    }
    catch (error) {
        console.error('❌ Failed to setup S3 bucket:', error);
        console.log('\n💡 Make sure your AWS credentials are correct and have S3 permissions');
    }
}
setupS3Bucket();
//# sourceMappingURL=setup-s3.js.map