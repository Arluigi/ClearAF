"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fetch_1 = __importDefault(require("node-fetch"));
const form_data_1 = __importDefault(require("form-data"));
const fs_1 = __importDefault(require("fs"));
async function testIOSPhotoUpload() {
    console.log('🧪 Testing iOS Photo Upload Flow...\n');
    try {
        console.log('1. Testing login with demo credentials...');
        const baseURL = 'https://clearaf.onrender.com';
        const credentials = [
            { email: 'demo@clearaf.com', password: 'demo123' },
            { email: 'demo@clearaf.com', password: 'demo' },
            { email: 'test@clearaf.com', password: 'test123' },
            { email: 'test.patient@clearaf.com', password: 'test123' }
        ];
        let loginSuccess = false;
        let authToken = '';
        for (const cred of credentials) {
            console.log(`   Trying ${cred.email}...`);
            const response = await (0, node_fetch_1.default)(`${baseURL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...cred,
                    userType: 'patient'
                })
            });
            if (response.ok) {
                const data = await response.json();
                authToken = data.token;
                console.log(`   ✅ Login successful with ${cred.email}`);
                loginSuccess = true;
                break;
            }
            else {
                console.log(`   ❌ Failed: ${response.status}`);
            }
        }
        if (!loginSuccess) {
            console.log('\n❌ Could not login with any demo credentials');
            console.log('   The iOS app might be using different credentials');
            return;
        }
        console.log('\n2. Testing photo upload endpoint...');
        const testImagePath = '/tmp/ios-test-photo.jpg';
        const minimalJpeg = Buffer.from([
            0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
            0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
            0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
            0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
            0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
            0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
            0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
            0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00,
            0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11,
            0x01, 0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0xFF,
            0xC4, 0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xDA, 0x00,
            0x0C, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3F, 0x00, 0x80,
            0xFF, 0xD9
        ]);
        fs_1.default.writeFileSync(testImagePath, minimalJpeg);
        const form = new form_data_1.default();
        form.append('photo', fs_1.default.createReadStream(testImagePath), {
            filename: 'photo.jpg',
            contentType: 'image/jpeg'
        });
        form.append('skinScore', '50');
        form.append('notes', 'Daily progress photo');
        console.log('   Uploading with multipart/form-data...');
        const uploadResponse = await (0, node_fetch_1.default)(`${baseURL}/api/photos/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                ...form.getHeaders()
            },
            body: form
        });
        console.log(`   Response status: ${uploadResponse.status}`);
        const responseText = await uploadResponse.text();
        if (uploadResponse.ok) {
            const data = JSON.parse(responseText);
            console.log('   ✅ Upload successful!');
            console.log(`   Photo URL: ${data.photo.photoUrl}`);
        }
        else {
            console.log('   ❌ Upload failed:');
            console.log(`   ${responseText}`);
        }
        console.log('\n3. Checking S3 configuration...');
        console.log('   S3 Bucket: clearaf-photos');
        console.log('   Region: us-east-2');
        console.log('   Note: If S3 credentials are invalid, uploads will fail silently');
        fs_1.default.unlinkSync(testImagePath);
    }
    catch (error) {
        console.error('❌ Test error:', error);
    }
}
testIOSPhotoUpload();
//# sourceMappingURL=test-ios-photo-upload.js.map