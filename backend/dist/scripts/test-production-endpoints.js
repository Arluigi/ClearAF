"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const API_URL = 'https://clearaf.onrender.com';
const TEST_EMAIL = 'test@clearaf.com';
const TEST_PASSWORD = 'password123';
const endpoints = [
    { name: 'Health Check', method: 'GET', path: '/health', requiresAuth: false },
    { name: 'Login', method: 'POST', path: '/api/auth/login', requiresAuth: false, body: { email: TEST_EMAIL, password: TEST_PASSWORD } },
    { name: 'Register', method: 'POST', path: '/api/auth/register', requiresAuth: false, body: { email: 'new@test.com', password: 'pass123', name: 'Test User' } },
    { name: 'Get User Profile', method: 'GET', path: '/api/users/profile', requiresAuth: true },
    { name: 'Get Dashboard Stats', method: 'GET', path: '/api/dashboard/stats', requiresAuth: true },
    { name: 'Get Appointments', method: 'GET', path: '/api/appointments', requiresAuth: true },
    { name: 'Get Messages', method: 'GET', path: '/api/messages', requiresAuth: true },
    { name: 'Get Prescriptions', method: 'GET', path: '/api/prescriptions', requiresAuth: true },
    { name: 'Get Products', method: 'GET', path: '/api/products', requiresAuth: true },
    { name: 'Get Routines', method: 'GET', path: '/api/routines', requiresAuth: true },
    { name: 'Get Photos', method: 'GET', path: '/api/photos', requiresAuth: true },
    { name: 'Get Photo Timeline', method: 'GET', path: '/api/photos/timeline/progress', requiresAuth: true },
    { name: 'Photo Upload Test', method: 'POST', path: '/api/photos/upload', requiresAuth: true },
];
async function testEndpoints() {
    console.log(`🧪 Testing Clear AF Production API: ${API_URL}\n`);
    let authToken = null;
    try {
        console.log('🔐 Attempting authentication...');
        const loginResponse = await axios_1.default.post(`${API_URL}/api/auth/login`, {
            email: TEST_EMAIL,
            password: TEST_PASSWORD
        });
        authToken = loginResponse.data.token;
        console.log('✅ Authentication successful\n');
    }
    catch (error) {
        console.log('❌ Authentication failed:', error.response?.data?.error || error.message);
        console.log('   Will continue testing public endpoints only\n');
    }
    for (const endpoint of endpoints) {
        if (endpoint.requiresAuth && !authToken) {
            console.log(`⏭️  Skipping ${endpoint.name} (requires auth)`);
            continue;
        }
        try {
            const config = {
                method: endpoint.method,
                url: `${API_URL}${endpoint.path}`,
                headers: {}
            };
            if (authToken && endpoint.requiresAuth) {
                config.headers.Authorization = `Bearer ${authToken}`;
            }
            if (endpoint.body && endpoint.method !== 'GET') {
                config.data = endpoint.body;
            }
            const response = await (0, axios_1.default)(config);
            console.log(`✅ ${endpoint.name}: ${response.status} ${response.statusText}`);
            if (endpoint.path === '/api/photos' && response.data) {
                console.log(`   → Found ${response.data.photos?.length || 0} photos`);
            }
            else if (endpoint.path === '/api/dashboard/stats' && response.data) {
                console.log(`   → Total patients: ${response.data.data?.totalPatients || 0}`);
            }
        }
        catch (error) {
            const status = error.response?.status || 'Network Error';
            const message = error.response?.data?.error || error.message;
            console.log(`❌ ${endpoint.name}: ${status} - ${message}`);
            if (endpoint.path.includes('/photos')) {
                console.log(`   → Full error:`, error.response?.data);
            }
        }
    }
    console.log('\n📊 Summary:');
    console.log('- API is reachable:', authToken ? 'Yes' : 'Partially');
    console.log('- Authentication works:', authToken ? 'Yes' : 'No');
    console.log('- Photo endpoints:', authToken ? 'Need to verify' : 'Cannot test without auth');
}
testEndpoints().catch(console.error);
//# sourceMappingURL=test-production-endpoints.js.map