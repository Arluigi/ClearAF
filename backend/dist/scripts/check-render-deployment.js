"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const API_URL = 'https://clearaf.onrender.com';
async function checkDeployment() {
    console.log('🔍 Checking Clear AF Production Deployment\n');
    console.log('1️⃣ Health Check:');
    try {
        const health = await axios_1.default.get(`${API_URL}/health`);
        console.log('✅ API is running');
        console.log(`   Version: ${health.data.version}`);
        console.log(`   Status: ${health.data.status}`);
        console.log(`   Time: ${health.data.timestamp}`);
    }
    catch (error) {
        console.log('❌ API is not responding');
        return;
    }
    console.log('\n2️⃣ Testing Route Registration:');
    const routesToTest = [
        { path: '/api/auth/login', method: 'POST', description: 'Auth route' },
        { path: '/api/photos', method: 'GET', description: 'Photo route (requires auth)' },
        { path: '/api/users/profile', method: 'GET', description: 'User route (requires auth)' },
        { path: '/api/dashboard/stats', method: 'GET', description: 'Dashboard route (requires auth)' },
        { path: '/non-existent-route', method: 'GET', description: 'Non-existent route (should 404)' }
    ];
    for (const route of routesToTest) {
        try {
            const response = await (0, axios_1.default)({
                method: route.method,
                url: `${API_URL}${route.path}`,
                validateStatus: () => true
            });
            if (response.status === 404 && response.data.error === 'Route not found') {
                console.log(`❌ ${route.description}: Route not registered (404 from catch-all handler)`);
            }
            else if (response.status === 401) {
                console.log(`✅ ${route.description}: Route exists (401 - needs auth)`);
            }
            else if (response.status === 400) {
                console.log(`✅ ${route.description}: Route exists (400 - validation error)`);
            }
            else {
                console.log(`ℹ️  ${route.description}: Status ${response.status}`);
            }
        }
        catch (error) {
            console.log(`❌ ${route.description}: Network error - ${error.message}`);
        }
    }
    console.log('\n3️⃣ Testing Authentication:');
    const testUser = {
        email: `test-${Date.now()}@clearaf.com`,
        password: 'password123',
        name: 'Deployment Test User',
        role: 'patient'
    };
    try {
        console.log('Attempting to register test user...');
        const registerResponse = await axios_1.default.post(`${API_URL}/api/auth/register`, testUser);
        console.log('✅ Registration successful');
        console.log(`   Token received: ${registerResponse.data.token ? 'Yes' : 'No'}`);
        const token = registerResponse.data.token;
        console.log('\n4️⃣ Testing Photo Endpoints with Auth:');
        try {
            const photosResponse = await axios_1.default.get(`${API_URL}/api/photos`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            console.log('✅ GET /api/photos working');
            console.log(`   Photos: ${photosResponse.data.photos?.length || 0}`);
        }
        catch (error) {
            console.log(`❌ GET /api/photos failed: ${error.response?.status} - ${error.response?.data?.error || error.message}`);
        }
        try {
            const formData = new form_data_1.default();
            formData.append('photo', Buffer.from('test'), 'test.jpg');
            formData.append('skinScore', '75');
            const uploadResponse = await axios_1.default.post(`${API_URL}/api/photos/upload`, formData, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    ...formData.getHeaders()
                }
            });
            console.log('✅ POST /api/photos/upload working');
        }
        catch (error) {
            console.log(`❌ POST /api/photos/upload failed: ${error.response?.status} - ${error.response?.data?.error || error.message}`);
            if (error.response?.data?.code) {
                console.log(`   Error code: ${error.response.data.code}`);
            }
        }
    }
    catch (error) {
        console.log(`❌ Registration failed: ${error.response?.status} - ${error.response?.data?.error || error.message}`);
    }
    console.log('\n5️⃣ Potential Issues:');
    console.log('- If photo routes return 404: Routes may not be registered in server.ts');
    console.log('- If photo upload fails with S3_UPLOAD_FAILED: S3 env vars not set on Render');
    console.log('- If auth fails: Database connection issues');
    console.log('\n📝 Deployment Checklist:');
    console.log('1. Check Render dashboard for environment variables:');
    console.log('   - DATABASE_URL');
    console.log('   - JWT_SECRET');
    console.log('   - AWS_ACCESS_KEY_ID');
    console.log('   - AWS_SECRET_ACCESS_KEY');
    console.log('   - S3_BUCKET_NAME');
    console.log('   - AWS_REGION');
    console.log('2. Check Render logs for startup errors');
    console.log('3. Verify latest commit is deployed');
}
checkDeployment().catch(console.error);
//# sourceMappingURL=check-render-deployment.js.map