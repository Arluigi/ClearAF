"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const API_URL = 'https://clearaf.onrender.com';
async function debugMultipart() {
    console.log('🔍 Debugging Multipart Upload Issue\n');
    const userData = {
        name: 'Debug User',
        email: `debug.${Date.now()}@clearaf.com`,
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
    console.log('Test 1: POST to /api/photos/upload without multipart');
    try {
        const response = await axios_1.default.post(`${API_URL}/api/photos/upload`, { test: 'data' }, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        console.log('Response:', response.status, response.data);
    }
    catch (error) {
        console.log('Status:', error.response?.status);
        console.log('Error:', error.response?.data);
    }
    console.log('\nTest 2: POST to /api/photos/upload with empty multipart');
    try {
        const formData = new form_data_1.default();
        const response = await axios_1.default.post(`${API_URL}/api/photos/upload`, formData, {
            headers: {
                'Authorization': `Bearer ${token}`,
                ...formData.getHeaders()
            }
        });
        console.log('Response:', response.status, response.data);
    }
    catch (error) {
        console.log('Status:', error.response?.status);
        console.log('Error:', error.response?.data);
    }
    console.log('\nTest 3: POST to /api/photos/upload with fake file');
    try {
        const formData = new form_data_1.default();
        formData.append('photo', Buffer.from('fake image data'), {
            filename: 'test.jpg',
            contentType: 'image/jpeg'
        });
        formData.append('skinScore', '75');
        formData.append('notes', 'Test upload');
        const response = await axios_1.default.post(`${API_URL}/api/photos/upload`, formData, {
            headers: {
                'Authorization': `Bearer ${token}`,
                ...formData.getHeaders()
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });
        console.log('Response:', response.status, response.data);
    }
    catch (error) {
        console.log('Status:', error.response?.status);
        console.log('Error:', error.response?.data);
        console.log('Headers:', error.response?.headers);
    }
    console.log('\nTest 4: Testing other HTTP methods on /api/photos/upload');
    const methods = ['GET', 'PUT', 'DELETE', 'PATCH'];
    for (const method of methods) {
        try {
            const response = await (0, axios_1.default)({
                method: method,
                url: `${API_URL}/api/photos/upload`,
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            console.log(`${method}: ${response.status}`);
        }
        catch (error) {
            console.log(`${method}: ${error.response?.status} - ${error.response?.data?.error || error.response?.statusText}`);
        }
    }
}
debugMultipart().catch(console.error);
//# sourceMappingURL=test-multipart-debug.js.map