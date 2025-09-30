"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fetch_1 = __importDefault(require("node-fetch"));
const API_URL = 'https://clearaf.onrender.com/api';
async function testPhoto403() {
    try {
        console.log('🔐 Test 1: Login as patient...');
        const patientLoginResponse = await (0, node_fetch_1.default)(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'test.patient@clearaf.com',
                password: 'test123',
                userType: 'patient'
            })
        });
        if (patientLoginResponse.ok) {
            const { token: patientToken } = await patientLoginResponse.json();
            console.log('✅ Patient logged in');
            console.log('\n📸 Patient accessing own photos:');
            const ownPhotosResponse = await (0, node_fetch_1.default)(`${API_URL}/photos`, {
                headers: { 'Authorization': `Bearer ${patientToken}` }
            });
            console.log(`GET /photos → ${ownPhotosResponse.status} ${ownPhotosResponse.statusText}`);
            if (ownPhotosResponse.ok) {
                const data = await ownPhotosResponse.json();
                console.log('Response:', JSON.stringify(data, null, 2));
            }
            else {
                console.log('Response:', await ownPhotosResponse.text());
            }
        }
        console.log('\n🔐 Test 2: Login as dermatologist...');
        const dermLoginResponse = await (0, node_fetch_1.default)(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'amit.om@clearaf.com',
                password: 'demo123456',
                userType: 'dermatologist'
            })
        });
        if (dermLoginResponse.ok) {
            const { token: dermToken, user } = await dermLoginResponse.json();
            console.log('✅ Dermatologist logged in:', user.name);
            const testEndpoints = [
                '/photos',
                '/photos/patient/c2da46b7-6a66-414f-a154-c4a19b931c1f',
                '/photos/patient/32477f7b-2a50-44cc-9683-ceb328418583'
            ];
            for (const endpoint of testEndpoints) {
                console.log(`\n📸 Testing GET ${endpoint}:`);
                const response = await (0, node_fetch_1.default)(`${API_URL}${endpoint}`, {
                    headers: { 'Authorization': `Bearer ${dermToken}` }
                });
                console.log(`Status: ${response.status} ${response.statusText}`);
                const responseText = await response.text();
                console.log('Response:', responseText.substring(0, 200));
            }
        }
        console.log('\n🔍 Checking if photo routes are deployed...');
        console.log('The photo routes exist locally but may not be deployed to production.');
        console.log('Photo endpoints are returning 403/404 errors.');
    }
    catch (error) {
        console.error('❌ Error:', error);
    }
}
testPhoto403();
//# sourceMappingURL=test-photo-403.js.map