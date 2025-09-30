"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fetch_1 = __importDefault(require("node-fetch"));
const form_data_1 = __importDefault(require("form-data"));
const fs_1 = __importDefault(require("fs"));
async function testLocalUpload() {
    try {
        console.log('🔐 Testing local photo upload...\n');
        console.log('1. Logging in...');
        const loginResponse = await (0, node_fetch_1.default)('http://localhost:3000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'test.patient@clearaf.com',
                password: 'test123',
                userType: 'patient'
            })
        });
        if (!loginResponse.ok) {
            console.log('❌ Login failed');
            return;
        }
        const loginData = await loginResponse.json();
        console.log('✅ Login successful!');
        const testImagePath = '/tmp/test-photo-local.jpg';
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
        console.log('2. Uploading photo to localhost...');
        const form = new form_data_1.default();
        form.append('photo', fs_1.default.createReadStream(testImagePath), {
            filename: 'test-photo.jpg',
            contentType: 'image/jpeg'
        });
        form.append('skinScore', '75');
        form.append('notes', 'Local S3 test photo');
        const uploadResponse = await (0, node_fetch_1.default)('http://localhost:3000/api/photos/upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${loginData.token}`,
                ...form.getHeaders()
            },
            body: form
        });
        console.log(`Upload response status: ${uploadResponse.status}`);
        const responseText = await uploadResponse.text();
        console.log(`Response: ${responseText}`);
        if (uploadResponse.ok) {
            const uploadData = JSON.parse(responseText);
            console.log('✅ Photo uploaded successfully to S3!');
            console.log(`   S3 URL: ${uploadData.photo.photoUrl}`);
        }
        fs_1.default.unlinkSync(testImagePath);
    }
    catch (error) {
        console.error('❌ Error:', error);
    }
}
testLocalUpload();
//# sourceMappingURL=test-local-upload.js.map