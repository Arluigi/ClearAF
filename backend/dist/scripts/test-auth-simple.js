"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fetch_1 = __importDefault(require("node-fetch"));
async function testAuth() {
    console.log('🔐 Testing authentication endpoints...\n');
    const endpoints = [
        'https://clearaf.onrender.com/api/auth/login',
        'https://clearaf.onrender.com/auth/login',
        'https://clearaf.onrender.com/login'
    ];
    for (const endpoint of endpoints) {
        console.log(`Testing: ${endpoint}`);
        try {
            const response = await (0, node_fetch_1.default)(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: 'test.patient@clearaf.com',
                    password: 'test123',
                    userType: 'patient'
                })
            });
            console.log(`  Status: ${response.status}`);
            const text = await response.text();
            console.log(`  Response: ${text.substring(0, 100)}`);
            if (response.status === 200) {
                console.log('  ✅ SUCCESS!');
                return;
            }
        }
        catch (error) {
            console.log(`  ❌ Error: ${error}`);
        }
        console.log('');
    }
    console.log('❌ All auth endpoints failed');
}
testAuth();
//# sourceMappingURL=test-auth-simple.js.map