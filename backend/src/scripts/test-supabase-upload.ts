import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const API_URL = 'http://localhost:3000';

async function testSupabasePhotoUpload() {
  console.log('🧪 Testing Supabase Photo Upload\n');

  try {
    // Step 1: Register or login a test user
    console.log('1️⃣ Authenticating test user...');
    let authToken: string;

    try {
      const registerResponse = await axios.post(`${API_URL}/api/auth/register`, {
        email: 'test.supabase@clearaf.com',
        password: 'test123',
        name: 'Supabase Test User',
        userType: 'patient'
      });
      authToken = registerResponse.data.token;
      console.log('✅ User registered successfully');
    } catch (error: any) {
      if (error.response?.status === 400) {
        // User exists, try logging in
        const loginResponse = await axios.post(`${API_URL}/api/auth/login`, {
          email: 'test.supabase@clearaf.com',
          password: 'test123'
        });
        authToken = loginResponse.data.token;
        console.log('✅ User logged in successfully');
      } else {
        throw error;
      }
    }

    // Step 2: Create a test image buffer (1x1 pixel PNG)
    console.log('\n2️⃣ Creating test image...');
    const testImageBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    console.log('✅ Test image created (1x1 PNG)');

    // Step 3: Upload photo to Supabase Storage
    console.log('\n3️⃣ Uploading photo to Supabase Storage...');
    const formData = new FormData();
    formData.append('photo', testImageBuffer, {
      filename: 'test-photo.png',
      contentType: 'image/png'
    });
    formData.append('skinScore', '75');
    formData.append('notes', 'Test photo uploaded to Supabase Storage');

    const uploadResponse = await axios.post(
      `${API_URL}/api/photos/upload`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${authToken}`
        }
      }
    );

    console.log('✅ Photo uploaded successfully!');
    console.log('\n📸 Upload Response:');
    console.log(JSON.stringify(uploadResponse.data, null, 2));

    // Step 4: Verify photo URL
    const photoUrl = uploadResponse.data.photo.photoUrl;
    console.log('\n4️⃣ Verifying photo URL...');
    console.log(`📍 Photo URL: ${photoUrl}`);

    // Step 5: Get user's photos
    console.log('\n5️⃣ Fetching user photos...');
    const photosResponse = await axios.get(`${API_URL}/api/photos`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    console.log(`✅ Found ${photosResponse.data.photos.length} photo(s)`);
    console.log('\n📋 Photos list:');
    photosResponse.data.photos.forEach((photo: any, index: number) => {
      console.log(`  ${index + 1}. Score: ${photo.skinScore}, URL: ${photo.photoUrl.substring(0, 60)}...`);
    });

    console.log('\n✨ All tests passed! Supabase Storage is working correctly! ✨');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  }
}

testSupabasePhotoUpload();