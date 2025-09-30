"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const API_URL = 'https://clearaf.onrender.com';
async function debugPhotoUpload() {
    console.log('🔍 Debugging Photo Upload on Production\n');
    const testUser = {
        email: `debug-${Date.now()}@clearaf.com`,
        password: 'password123',
        name: 'Debug User',
        userType: 'patient'
    };
    let authToken;
    try {
        const registerResponse = await axios_1.default.post(`${API_URL}/api/auth/register`, testUser);
        authToken = registerResponse.data.token;
        console.log('✅ User registered successfully\n');
    }
    catch (error) {
        console.error('❌ Registration failed:', error.response?.data);
        return;
    }
    console.log('1️⃣ Testing if upload route exists:');
    try {
        const optionsResponse = await axios_1.default.options(`${API_URL}/api/photos/upload`);
        console.log('✅ OPTIONS request successful');
        console.log(`   Allowed methods: ${optionsResponse.headers['access-control-allow-methods'] || 'Not specified'}`);
    }
    catch (error) {
        console.log('❌ OPTIONS request failed:', error.response?.status);
    }
    console.log('\n2️⃣ Testing upload without file:');
    try {
        const response = await axios_1.default.post(`${API_URL}/api/photos/upload`, {}, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'multipart/form-data'
            }
        });
        console.log('Response:', response.data);
    }
    catch (error) {
        console.log(`Status: ${error.response?.status}`);
        console.log(`Error: ${error.response?.data?.error || error.message}`);
        console.log(`Code: ${error.response?.data?.code || 'N/A'}`);
        if (error.response?.status === 404) {
            console.log('❌ Route not found - might be deployment issue');
        }
        else if (error.response?.data?.code === 'NO_FILE') {
            console.log('✅ Route exists! (Expected error for no file)');
        }
    }
    console.log('\n3️⃣ Testing with real image file:');
    const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
        0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
        0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D,
        0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
        0x44, 0xAE, 0x42, 0x60, 0x82
    ]);
    const formData = new form_data_1.default();
    formData.append('photo', pngBuffer, {
        filename: 'test.png',
        contentType: 'image/png'
    });
    formData.append('skinScore', '80');
    formData.append('notes', 'Debug test upload');
    try {
        const uploadResponse = await axios_1.default.post(`${API_URL}/api/photos/upload`, formData, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                ...formData.getHeaders()
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });
        console.log('✅ Upload successful!');
        console.log('Response:', JSON.stringify(uploadResponse.data, null, 2));
    }
    catch (error) {
        console.log(`❌ Upload failed: ${error.response?.status}`);
        console.log(`Error: ${error.response?.data?.error || error.message}`);
        console.log(`Code: ${error.response?.data?.code || 'N/A'}`);
        if (error.response?.data?.code === 'S3_UPLOAD_FAILED') {
            console.log('\n⚠️  S3 Configuration Issue:');
            console.log('The photo route is working, but S3 upload is failing.');
            console.log('This means the AWS environment variables are not set on Render.');
            console.log('\nRequired environment variables:');
            console.log('- AWS_ACCESS_KEY_ID');
            console.log('- AWS_SECRET_ACCESS_KEY');
            console.log('- S3_BUCKET_NAME (should be: clearaf-photos)');
            console.log('- AWS_REGION (should be: us-east-2)');
        }
    }
    console.log('\n4️⃣ Checking server configuration:');
    console.log('If you see "Route not found" errors, the server might not have the latest code.');
    console.log('If you see "S3_UPLOAD_FAILED", the S3 environment variables are missing.');
    console.log('\nCurrent deployment commit: 5279538 (Migrate photo storage from local files to AWS S3)');
}
debugPhotoUpload().catch(console.error);
//# sourceMappingURL=test-photo-upload-debug.js.map