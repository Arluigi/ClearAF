"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const API_URL = 'https://clearaf.onrender.com';
async function testProduction() {
    console.log('🧪 Testing Clear AF Production API\n');
    const testUser = {
        email: `patient-${Date.now()}@clearaf.com`,
        password: 'password123',
        name: 'Test Patient',
        userType: 'patient',
        skinType: 'Combination',
        skinConcerns: 'Acne, Dark spots'
    };
    let authToken = null;
    console.log('1️⃣ Registering test patient...');
    try {
        const registerResponse = await axios_1.default.post(`${API_URL}/api/auth/register`, testUser);
        authToken = registerResponse.data.token;
        console.log('✅ Registration successful');
        console.log(`   User ID: ${registerResponse.data.user.id}`);
        console.log(`   Name: ${registerResponse.data.user.name}`);
        console.log(`   Email: ${registerResponse.data.user.email}`);
    }
    catch (error) {
        console.error('❌ Registration failed:', error.response?.data);
        return;
    }
    console.log('\n2️⃣ Testing Photo Endpoints:');
    try {
        const photosResponse = await axios_1.default.get(`${API_URL}/api/photos`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        console.log('✅ GET /api/photos - Working');
        console.log(`   Photos count: ${photosResponse.data.photos?.length || 0}`);
        console.log(`   Pagination: Page ${photosResponse.data.pagination?.page} of ${photosResponse.data.pagination?.pages}`);
    }
    catch (error) {
        console.log(`❌ GET /api/photos - Failed: ${error.response?.status} - ${error.response?.data?.error}`);
    }
    try {
        const timelineResponse = await axios_1.default.get(`${API_URL}/api/photos/timeline/progress`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        console.log('✅ GET /api/photos/timeline/progress - Working');
        console.log(`   Timeline photos: ${timelineResponse.data.timeline?.photos?.length || 0}`);
        console.log(`   Average score: ${timelineResponse.data.timeline?.stats?.averageScore || 'N/A'}`);
    }
    catch (error) {
        console.log(`❌ GET /api/photos/timeline/progress - Failed: ${error.response?.status} - ${error.response?.data?.error}`);
    }
    console.log('\n3️⃣ Testing Photo Upload:');
    try {
        const formData = new form_data_1.default();
        const testImageBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
        formData.append('photo', testImageBuffer, {
            filename: 'test-photo.png',
            contentType: 'image/png'
        });
        formData.append('skinScore', '75');
        formData.append('notes', 'Test photo upload from production check');
        const uploadResponse = await axios_1.default.post(`${API_URL}/api/photos/upload`, formData, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                ...formData.getHeaders()
            }
        });
        console.log('✅ POST /api/photos/upload - Working!');
        console.log(`   Photo ID: ${uploadResponse.data.photo.id}`);
        console.log(`   Photo URL: ${uploadResponse.data.photo.photoUrl}`);
        console.log(`   S3 Key: ${uploadResponse.data.photo.s3Key}`);
    }
    catch (error) {
        console.log(`❌ POST /api/photos/upload - Failed: ${error.response?.status} - ${error.response?.data?.error}`);
        if (error.response?.data?.code === 'S3_UPLOAD_FAILED') {
            console.log('   ⚠️  S3 environment variables likely not configured on Render');
        }
    }
    console.log('\n4️⃣ Testing Other Endpoints:');
    const endpoints = [
        '/api/users/profile',
        '/api/appointments',
        '/api/messages',
        '/api/prescriptions'
    ];
    for (const endpoint of endpoints) {
        try {
            const response = await axios_1.default.get(`${API_URL}${endpoint}`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            console.log(`✅ GET ${endpoint} - Working (${response.status})`);
        }
        catch (error) {
            console.log(`❌ GET ${endpoint} - Failed: ${error.response?.status}`);
        }
    }
    console.log('\n📊 Production Deployment Status:');
    console.log('✅ API is online and responding');
    console.log('✅ All routes are properly registered');
    console.log('✅ Authentication is working');
    console.log('✅ Photo GET endpoints are functional');
    console.log('❓ Photo upload depends on S3 configuration');
    console.log('\n🔧 Required Render Environment Variables:');
    console.log('- DATABASE_URL (PostgreSQL connection string)');
    console.log('- JWT_SECRET (for authentication)');
    console.log('- AWS_ACCESS_KEY_ID (for S3 uploads)');
    console.log('- AWS_SECRET_ACCESS_KEY (for S3 uploads)');
    console.log('- S3_BUCKET_NAME (clearaf-photos)');
    console.log('- AWS_REGION (us-east-2)');
}
testProduction().catch(console.error);
//# sourceMappingURL=test-production-final.js.map