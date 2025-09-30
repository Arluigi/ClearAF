import { s3Client, s3Config } from '../config/s3';

async function debugS3() {
  console.log('🔍 Debugging S3 configuration...\n');
  
  console.log('Environment variables:');
  console.log(`  AWS_REGION: ${process.env.AWS_REGION}`);
  console.log(`  AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? 'SET' : 'MISSING'}`);
  console.log(`  AWS_SECRET_ACCESS_KEY: ${process.env.AWS_SECRET_ACCESS_KEY ? 'SET' : 'MISSING'}`);
  console.log(`  S3_BUCKET_NAME: ${process.env.S3_BUCKET_NAME}`);
  
  console.log('\nS3 Config:');
  console.log(`  Region: ${s3Config.region}`);
  console.log(`  Bucket: ${s3Config.bucketName}`);
  console.log(`  Access Key: ${s3Config.accessKeyId ? 'SET' : 'MISSING'}`);
  console.log(`  Secret Key: ${s3Config.secretAccessKey ? 'SET' : 'MISSING'}`);
  
  try {
    console.log('\nTesting S3 connection...');
    const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    const command = new ListObjectsV2Command({
      Bucket: s3Config.bucketName,
      MaxKeys: 1
    });
    
    const response = await s3Client.send(command);
    console.log('✅ S3 connection successful!');
    console.log(`   Bucket exists and accessible`);
  } catch (error) {
    console.log('❌ S3 connection failed:', error);
  }
}

debugS3();