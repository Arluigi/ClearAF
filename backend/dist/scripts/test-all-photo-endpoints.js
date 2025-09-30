"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const API_URL = 'https://clearaf.onrender.com';
async function testAllPhotoEndpoints() {
    console.log('🧪 Testing ALL Photo Endpoints on Production\n');
    const userData = {
        name: 'Photo Test User',
        email: `photo.test.${Date.now()}@clearaf.com`,
        password: 'TestPass123!',
        userType: 'patient',
        skinType: 'Combination',
        skinConcerns: 'Testing photo uploads'
    };
    let token;
    try {
        const registerResponse = await axios_1.default.post(`${API_URL}/api/auth/register`, userData);
        token = registerResponse.data.token;
        console.log('✅ Test user created:', userData.email);
    }
    catch (error) {
        console.log('❌ Failed to create test user:', error.response?.data);
        return;
    }
    const endpoints = [
        {
            name: 'GET /api/photos',
            method: 'GET',
            path: '/api/photos',
            description: 'List user photos'
        },
        {
            name: 'POST /api/photos',
            method: 'POST',
            path: '/api/photos',
            body: {
                photoUrl: 'https://example.com/test.jpg',
                skinScore: 75,
                notes: 'Test photo from API'
            },
            description: 'Create photo with URL'
        },
        {
            name: 'GET /api/photos/timeline/progress',
            method: 'GET',
            path: '/api/photos/timeline/progress',
            description: 'Get photo timeline'
        },
        {
            name: 'POST /api/photos/upload',
            method: 'POST',
            path: '/api/photos/upload',
            description: 'Upload photo file',
            isMultipart: true
        }
    ];
    console.log('\n📸 Testing Photo Endpoints:\n');
    for (const endpoint of endpoints) {
        try {
            const config = {
                method: endpoint.method,
                url: `${API_URL}${endpoint.path}`,
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            };
            if (endpoint.body && !endpoint.isMultipart) {
                config.data = endpoint.body;
            }
            if (endpoint.isMultipart) {
                const formData = new form_data_1.default();
                config.data = formData;
                config.headers = {
                    ...config.headers,
                    ...formData.getHeaders()
                };
            }
            const response = await (0, axios_1.default)(config);
            console.log(`✅ ${endpoint.name}: ${response.status} - ${endpoint.description}`);
            if (endpoint.path === '/api/photos' && endpoint.method === 'GET') {
                console.log(`   → Photos found: ${response.data.photos?.length || 0}`);
            }
            if (endpoint.method === 'POST' && response.data.photo) {
                console.log(`   → Photo created with ID: ${response.data.photo.id}`);
            }
        }
        catch (error) {
            const status = error.response?.status || 'Network Error';
            const message = error.response?.data?.error || error.message;
            console.log(`❌ ${endpoint.name}: ${status} - ${message}`);
            if (endpoint.path === '/api/photos/upload') {
                console.log(`   → Full response:`, {
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    data: error.response?.data,
                    path: error.config?.url
                });
            }
        }
    }
    console.log('\n🔍 Checking Route Registration:\n');
    const routesToCheck = [
        '/api/photos',
        '/api/photos/upload',
        '/api/photos/timeline/progress',
        '/api/photos/test-id'
    ];
    for (const route of routesToCheck) {
        try {
            await axios_1.default.get(`${API_URL}${route}`);
            console.log(`✅ ${route}: Route exists (returned success without auth - unexpected)`);
        }
        catch (error) {
            if (error.response?.status === 401) {
                console.log(`✅ ${route}: Route exists (requires auth)`);
            }
            else if (error.response?.status === 404) {
                console.log(`❌ ${route}: Route NOT FOUND`);
            }
            else {
                console.log(`⚠️  ${route}: Status ${error.response?.status}`);
            }
        }
    }
    console.log('\n📊 Summary:');
    console.log('- Check if all routes return 401 (exists) vs 404 (not found)');
    console.log('- Upload endpoint should be at POST /api/photos/upload');
    console.log('- All photo routes should require authentication');
}
testAllPhotoEndpoints().catch(console.error);
//# sourceMappingURL=test-all-photo-endpoints.js.map