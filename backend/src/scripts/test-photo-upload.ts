import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';

const prisma = new PrismaClient();

async function testPhotoUpload() {
  try {
    console.log('🔐 Testing photo upload flow...\n');

    // 1. Login as demo patient to get valid token
    console.log('1. Logging in as demo patient...');
    const baseURL = process.env.TEST_BASE_URL || 'https://clearaf.onrender.com';
    const loginResponse = await fetch(`${baseURL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test.patient@clearaf.com',
        password: 'test123',
        userType: 'patient'
      })
    });

    if (!loginResponse.ok) {
      console.log('❌ Login failed. Let me check if demo patient exists...');
      
      const demoPatient = await prisma.user.findUnique({
        where: { email: 'demo@clearaf.com' },
        select: { id: true, name: true, email: true }
      });

      if (!demoPatient) {
        console.log('❌ Demo patient not found in database!');
        console.log('The iOS app user might be different or password is different.');
      } else {
        console.log('✅ Demo patient exists in database:', demoPatient);
        console.log('❌ But login failed - password might be wrong');
      }
      return;
    }

    const loginData = await loginResponse.json() as any;
    console.log('✅ Login successful!');
    console.log(`   User: ${loginData.user.name} (${loginData.user.email})`);
    console.log(`   Token: ${loginData.token.substring(0, 20)}...`);

    // 2. Create a dummy image file for testing
    console.log('\n2. Creating test image...');
    const testImagePath = '/tmp/test-photo.jpg';
    
    // Create a minimal JPEG file (1x1 pixel)
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
    
    fs.writeFileSync(testImagePath, minimalJpeg);
    console.log('✅ Test image created');

    // 3. Upload photo using multipart form data
    console.log('\n3. Uploading photo...');
    const form = new FormData();
    form.append('photo', fs.createReadStream(testImagePath), {
      filename: 'test-photo.jpg',
      contentType: 'image/jpeg'
    });
    form.append('skinScore', '85');
    form.append('notes', 'Test photo from backend script');

    const uploadResponse = await fetch(`${baseURL}/api/photos/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${loginData.token}`,
        ...form.getHeaders()
      },
      body: form
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.log('❌ Photo upload failed:');
      console.log(`   Status: ${uploadResponse.status}`);
      console.log(`   Error: ${errorText}`);
      return;
    }

    const uploadData = await uploadResponse.json() as any;
    console.log('✅ Photo upload successful!');
    console.log(`   Photo ID: ${uploadData.photo.id}`);
    console.log(`   Photo URL: ${uploadData.photo.photoUrl}`);
    console.log(`   Skin Score: ${uploadData.photo.skinScore}`);

    // 4. Check if photo is in database
    console.log('\n4. Verifying photo in database...');
    const photoInDb = await prisma.skinPhoto.findUnique({
      where: { id: uploadData.photo.id },
      include: {
        user: {
          select: { name: true, email: true }
        }
      }
    });

    if (photoInDb) {
      console.log('✅ Photo found in database:');
      console.log(`   User: ${photoInDb.user?.name} (${photoInDb.user?.email})`);
      console.log(`   Score: ${photoInDb.skinScore}`);
      console.log(`   Date: ${photoInDb.captureDate}`);
    } else {
      console.log('❌ Photo not found in database');
    }

    // Clean up
    fs.unlinkSync(testImagePath);
    console.log('\n✅ Test completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testPhotoUpload();