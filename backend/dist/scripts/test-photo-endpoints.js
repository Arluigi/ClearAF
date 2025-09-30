"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fetch_1 = __importDefault(require("node-fetch"));
const API_URL = 'https://clearaf.onrender.com/api';
async function testPhotoEndpoints() {
    try {
        console.log('🔐 Step 1: Login as dermatologist...');
        const loginResponse = await (0, node_fetch_1.default)(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'amit.om@clearaf.com',
                password: 'demo123456',
                userType: 'dermatologist'
            })
        });
        if (!loginResponse.ok) {
            const error = await loginResponse.text();
            console.error('❌ Login failed:', error);
            return;
        }
        const { token, user } = await loginResponse.json();
        console.log('✅ Logged in as:', user.name);
        console.log('\n👥 Step 2: Fetching patients...');
        const patientsResponse = await (0, node_fetch_1.default)(`${API_URL}/users?userType=patient`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!patientsResponse.ok) {
            console.error('❌ Failed to fetch patients:', await patientsResponse.text());
            return;
        }
        const patientsData = await patientsResponse.json();
        console.log(`✅ Found ${patientsData.data.length} patients`);
        for (const patient of patientsData.data) {
            console.log(`\n📸 Testing photo endpoints for ${patient.name || patient.email} (ID: ${patient.id})...`);
            console.log('   Testing GET /api/photos/patient/{patientId}...');
            const photosResponse = await (0, node_fetch_1.default)(`${API_URL}/photos/patient/${patient.id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (photosResponse.ok) {
                const photosData = await photosResponse.json();
                console.log(`   ✅ Endpoint working! Found ${photosData.data.length} photos`);
                if (photosData.data.length > 0) {
                    console.log('   First photo:', photosData.data[0]);
                }
            }
            else {
                const errorText = await photosResponse.text();
                console.log(`   ❌ Status ${photosResponse.status}: ${errorText}`);
            }
            console.log('   Testing GET /api/photos/patient/{patientId}/timeline...');
            const timelineResponse = await (0, node_fetch_1.default)(`${API_URL}/photos/patient/${patient.id}/timeline?days=30`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (timelineResponse.ok) {
                const timelineData = await timelineResponse.json();
                console.log(`   ✅ Timeline endpoint working!`);
                console.log(`   Stats:`, timelineData.timeline.stats);
            }
            else {
                const errorText = await timelineResponse.text();
                console.log(`   ❌ Status ${timelineResponse.status}: ${errorText}`);
            }
        }
    }
    catch (error) {
        console.error('❌ Error:', error);
    }
}
testPhotoEndpoints();
//# sourceMappingURL=test-photo-endpoints.js.map