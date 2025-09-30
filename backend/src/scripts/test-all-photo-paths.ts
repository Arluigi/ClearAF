import axios from 'axios';

const API_URL = 'https://clearaf.onrender.com';

async function testAllPhotoPaths() {
  console.log('🔍 Testing all possible photo upload paths\n');
  
  // Register a test user
  const testUser = {
    email: `path-test-${Date.now()}@clearaf.com`,
    password: 'password123',
    name: 'Path Test User',
    userType: 'patient'
  };
  
  let authToken: string;
  
  try {
    const registerResponse = await axios.post(`${API_URL}/api/auth/register`, testUser);
    authToken = registerResponse.data.token;
    console.log('✅ User registered\n');
  } catch (error: any) {
    console.error('❌ Registration failed:', error.response?.data);
    return;
  }
  
  // Test different possible paths
  const paths = [
    '/api/photos/upload',
    '/api/photos/upload/',
    '/api/photo/upload',
    '/api/uploads/photo',
    '/api/photos',
    '/api/photos/',
    '/photos/upload',
    '/upload'
  ];
  
  console.log('Testing different path variations:');
  
  for (const path of paths) {
    try {
      const response = await axios.post(`${API_URL}${path}`, {}, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'multipart/form-data'
        },
        validateStatus: () => true // Don't throw on any status
      });
      
      if (response.status === 404 && response.data.error === 'Route not found') {
        console.log(`❌ ${path} - Not found (catch-all 404)`);
      } else if (response.status === 400 && response.data.code === 'NO_FILE') {
        console.log(`✅ ${path} - FOUND! Upload endpoint exists here`);
      } else if (response.status === 400 || response.status === 422) {
        console.log(`✅ ${path} - Route exists (validation error)`);
      } else if (response.status === 401) {
        console.log(`ℹ️  ${path} - Route exists (auth required)`);
      } else {
        console.log(`ℹ️  ${path} - Status ${response.status}: ${response.data.error || response.data.message}`);
      }
    } catch (error: any) {
      console.log(`❌ ${path} - Network error: ${error.message}`);
    }
  }
  
  // Also test GET on /api/photos to confirm route mounting
  console.log('\n\nVerifying photo routes are mounted:');
  try {
    const getResponse = await axios.get(`${API_URL}/api/photos`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    console.log('✅ GET /api/photos works - routes are mounted correctly');
    console.log(`   Found ${getResponse.data.photos?.length || 0} photos`);
  } catch (error: any) {
    console.log('❌ GET /api/photos failed:', error.response?.status);
  }
}

testAllPhotoPaths().catch(console.error);