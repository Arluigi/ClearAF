import axios from 'axios';

const API_URL = 'https://clearaf.onrender.com';

async function testAuth() {
  console.log('🧪 Testing Clear AF Production Authentication\n');
  
  // Test 1: Health check
  try {
    const health = await axios.get(`${API_URL}/health`);
    console.log('✅ Health check passed:', health.data);
  } catch (error: any) {
    console.log('❌ Health check failed:', error.message);
  }
  
  // Test 2: Login with detailed error logging
  console.log('\n📝 Testing login endpoint...');
  const loginData = {
    email: 'test@clearaf.com',
    password: 'password123'
  };
  
  try {
    console.log('Request body:', JSON.stringify(loginData, null, 2));
    const response = await axios.post(`${API_URL}/api/auth/login`, loginData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    console.log('✅ Login successful:', response.data);
  } catch (error: any) {
    console.log('❌ Login failed');
    console.log('Status:', error.response?.status);
    console.log('Response:', error.response?.data);
    console.log('Headers:', error.response?.headers);
  }
  
  // Test 3: Try with a known iOS user
  console.log('\n📝 Testing with iOS user credentials...');
  const iosUserData = {
    email: 'john.doe@example.com',
    password: 'password123'
  };
  
  try {
    console.log('Request body:', JSON.stringify(iosUserData, null, 2));
    const response = await axios.post(`${API_URL}/api/auth/login`, iosUserData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    console.log('✅ iOS user login successful:', response.data);
    
    // If successful, test photo endpoints
    const token = response.data.token;
    console.log('\n📸 Testing photo endpoints with auth token...');
    
    // Test photo list
    try {
      const photos = await axios.get(`${API_URL}/api/photos`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      console.log('✅ GET /api/photos:', photos.status, `- Found ${photos.data.photos?.length || 0} photos`);
    } catch (error: any) {
      console.log('❌ GET /api/photos failed:', error.response?.status, error.response?.data);
    }
    
    // Test photo timeline
    try {
      const timeline = await axios.get(`${API_URL}/api/photos/timeline/progress`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      console.log('✅ GET /api/photos/timeline/progress:', timeline.status);
    } catch (error: any) {
      console.log('❌ GET /api/photos/timeline/progress failed:', error.response?.status, error.response?.data);
    }
    
  } catch (error: any) {
    console.log('❌ iOS user login failed');
    console.log('Status:', error.response?.status);
    console.log('Response:', error.response?.data);
  }
}

testAuth().catch(console.error);