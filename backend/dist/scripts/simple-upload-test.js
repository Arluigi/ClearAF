"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fetch_1 = __importDefault(require("node-fetch"));
async function simpleTest() {
    console.log('🧪 Simple endpoint test...\n');
    const baseURL = 'https://clearaf.onrender.com';
    const endpoints = [
        '/api/auth/login',
        '/api/photos',
        '/api/photos/upload'
    ];
    for (const endpoint of endpoints) {
        console.log(`Testing: ${endpoint}`);
        try {
            const response = await (0, node_fetch_1.default)(`${baseURL}${endpoint}`, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer invalid-token',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ test: 'data' })
            });
            console.log(`  Status: ${response.status}`);
            if (response.status === 401) {
                console.log('  ✅ Endpoint exists (needs auth)');
            }
            else if (response.status === 404) {
                console.log('  ❌ Endpoint not found');
            }
            else {
                console.log(`  ? Unexpected status: ${response.status}`);
            }
        }
        catch (error) {
            console.log(`  ❌ Error: ${error}`);
        }
        console.log('');
    }
}
simpleTest();
//# sourceMappingURL=simple-upload-test.js.map