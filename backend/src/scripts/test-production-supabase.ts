import axios from 'axios';
import FormData from 'form-data';

const API_URL = 'https://clearaf.onrender.com';

async function testProductionSupabase() {
  console.log('🧪 Testing Production Supabase Integration\n');

  try {
    // Step 1: Check health
    console.log('1️⃣ Checking production health...');
    const healthResponse = await axios.get(`${API_URL}/health`);
    console.log('✅ Health check:', healthResponse.data);

    if (!healthResponse.data.supabaseEnabled || !healthResponse.data.storageReady) {
      console.error('❌ Supabase not properly configured!');
      process.exit(1);
    }

    // Step 2: Register test user
    console.log('\n2️⃣ Registering test user...');
    let authToken: string;

    try {
      const registerResponse = await axios.post(`${API_URL}/api/auth/register`, {
        email: 'prod.supabase.test@clearaf.com',
        password: 'test123',
        name: 'Production Supabase Test',
        userType: 'patient'
      });
      authToken = registerResponse.data.token;
      console.log('✅ User registered successfully');
    } catch (error: any) {
      if (error.response?.status === 400) {
        const loginResponse = await axios.post(`${API_URL}/api/auth/login`, {
          email: 'prod.supabase.test@clearaf.com',
          password: 'test123'
        });
        authToken = loginResponse.data.token;
        console.log('✅ User logged in successfully');
      } else {
        throw error;
      }
    }

    // Step 3: Upload photo
    console.log('\n3️⃣ Uploading photo to production Supabase Storage...');
    const testImageBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    const formData = new FormData();
    formData.append('photo', testImageBuffer, {
      filename: 'production-test.png',
      contentType: 'image/png'
    });
    formData.append('skinScore', '80');
    formData.append('notes', 'Production Supabase Storage test photo');

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
    console.log('\n📸 Photo Details:');
    console.log(`  - ID: ${uploadResponse.data.photo.id}`);
    console.log(`  - Score: ${uploadResponse.data.photo.skinScore}`);
    console.log(`  - URL: ${uploadResponse.data.photo.photoUrl}`);

    // Step 4: Verify photo URL is accessible
    console.log('\n4️⃣ Verifying photo URL is publicly accessible...');
    const photoUrl = uploadResponse.data.photo.photoUrl;
    const imageResponse = await axios.head(photoUrl);

    if (imageResponse.status === 200) {
      console.log('✅ Photo is publicly accessible!');
    } else {
      console.log('⚠️  Photo URL returned status:', imageResponse.status);
    }

    // Step 5: Fetch photos list
    console.log('\n5️⃣ Fetching photos from production...');
    const photosResponse = await axios.get(`${API_URL}/api/photos`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    console.log(`✅ Found ${photosResponse.data.photos.length} photo(s) in database`);

    console.log('\n✨ Production Supabase integration test PASSED! ✨');
    console.log('\n🎯 Summary:');
    console.log('  ✅ Health check: Supabase enabled');
    console.log('  ✅ User authentication: Working');
    console.log('  ✅ Photo upload: Working');
    console.log('  ✅ Supabase Storage: Photos stored successfully');
    console.log('  ✅ Public URLs: Accessible');
    console.log('  ✅ Database: Photo records created');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  }
}

testProductionSupabase();