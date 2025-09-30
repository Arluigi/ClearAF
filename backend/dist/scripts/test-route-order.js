"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const API_URL = 'https://clearaf.onrender.com';
async function testRouteOrder() {
    console.log('🔍 Testing Route Order Issue\n');
    const userData = {
        name: 'Route Test',
        email: `route.${Date.now()}@clearaf.com`,
        password: 'TestPass123!',
        userType: 'patient'
    };
    let token;
    try {
        const registerResponse = await axios_1.default.post(`${API_URL}/api/auth/register`, userData);
        token = registerResponse.data.token;
        console.log('✅ Test user created\n');
    }
    catch (error) {
        console.log('❌ Failed to create test user:', error.response?.data);
        return;
    }
    const routes = [
        { path: '/api/photos', method: 'GET', description: 'List photos' },
        { path: '/api/photos/upload', method: 'GET', description: 'Should not match /:id' },
        { path: '/api/photos/timeline', method: 'GET', description: 'Should not match /:id' },
        { path: '/api/photos/timeline/progress', method: 'GET', description: 'Timeline endpoint' },
        { path: '/api/photos/abc123', method: 'GET', description: 'Specific photo (/:id)' },
    ];
    console.log('Testing GET requests to check route matching:\n');
    for (const route of routes) {
        try {
            const response = await (0, axios_1.default)({
                method: route.method,
                url: `${API_URL}${route.path}`,
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            console.log(`✅ ${route.path}: ${response.status} - ${route.description}`);
        }
        catch (error) {
            const errorMsg = error.response?.data?.error || error.response?.statusText;
            const code = error.response?.data?.code || '';
            console.log(`❌ ${route.path}: ${error.response?.status} - ${errorMsg} ${code ? `(${code})` : ''}`);
        }
    }
    console.log('\nTesting POST /api/photos/upload specifically:\n');
    try {
        const response = await axios_1.default.post(`${API_URL}/api/photos/upload`, {}, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        console.log('Unexpected success:', response.status);
    }
    catch (error) {
        console.log(`POST /api/photos/upload (JSON): ${error.response?.status} - ${error.response?.data?.error}`);
        if (error.response?.status === 404) {
            console.log('\n⚠️  ISSUE FOUND: /api/photos/upload route is not registered in the deployed version!');
            console.log('This suggests the latest code with S3 upload is NOT deployed.');
        }
    }
}
testRouteOrder().catch(console.error);
//# sourceMappingURL=test-route-order.js.map