import axios from 'axios';

const API_URL = 'https://clearaf.onrender.com';

// iOS test user credentials
const IOS_USER = {
  email: 'ios.test.user@clearaf.com',
  password: 'testpassword123',
  name: 'iOS Test User',
  role: 'patient'
};

async function testProductionEndpoints() {
  console.log(`🧪 Testing Clear AF Production API: ${API_URL}\n`);
  
  let authToken: string | null = null;
  let userId: string | null = null;
  
  // 1. Try to login first
  try {
    console.log('🔐 Attempting to login iOS test user...');
    const loginResponse = await axios.post(`${API_URL}/api/auth/login`, {
      email: IOS_USER.email,
      password: IOS_USER.password
    });
    authToken = loginResponse.data.token;
    userId = loginResponse.data.user.id;
    console.log('✅ Login successful');
    console.log(`   User ID: ${userId}`);
    console.log(`   Name: ${loginResponse.data.user.name}`);
    console.log(`   Role: ${loginResponse.data.user.role}\n`);
  } catch (error: any) {
    if (error.response?.status === 401) {
      console.log('❌ User not found. Creating new iOS test user...\n');
      
      // 2. Register new user
      try {
        const registerResponse = await axios.post(`${API_URL}/api/auth/register`, IOS_USER);
        authToken = registerResponse.data.token;
        userId = registerResponse.data.user.id;
        console.log('✅ Registration successful');
        console.log(`   User ID: ${userId}`);
        console.log(`   Name: ${registerResponse.data.user.name}\n`);
      } catch (regError: any) {
        console.error('❌ Registration failed:', regError.response?.data?.error || regError.message);
        return;
      }
    } else {
      console.error('❌ Login failed:', error.response?.data?.error || error.message);
      return;
    }
  }
  
  // 3. Test photo endpoints
  console.log('📸 Testing Photo Endpoints:');
  
  const photoEndpoints = [
    { name: 'Get Photos', path: '/api/photos', method: 'GET' },
    { name: 'Get Photo Timeline', path: '/api/photos/timeline/progress', method: 'GET' },
    { name: 'Test Photo Upload (no file)', path: '/api/photos/upload', method: 'POST' }
  ];
  
  for (const endpoint of photoEndpoints) {
    try {
      const config: any = {
        method: endpoint.method,
        url: `${API_URL}${endpoint.path}`,
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      };
      
      const response = await axios(config);
      console.log(`✅ ${endpoint.name}: ${response.status}`);
      
      if (endpoint.path === '/api/photos') {
        console.log(`   → Photos count: ${response.data.photos?.length || 0}`);
        console.log(`   → Total pages: ${response.data.pagination?.pages || 0}`);
      } else if (endpoint.path === '/api/photos/timeline/progress') {
        console.log(`   → Timeline photos: ${response.data.timeline?.photos?.length || 0}`);
        console.log(`   → Average score: ${response.data.timeline?.stats?.averageScore || 0}`);
      }
    } catch (error: any) {
      console.log(`❌ ${endpoint.name}: ${error.response?.status || 'Error'} - ${error.response?.data?.error || error.message}`);
      if (error.response?.data?.code) {
        console.log(`   → Error code: ${error.response.data.code}`);
      }
    }
  }
  
  // 4. Test other endpoints
  console.log('\n🏥 Testing Other Endpoints:');
  
  const otherEndpoints = [
    { name: 'Get User Profile', path: '/api/users/profile', method: 'GET' },
    { name: 'Get Appointments', path: '/api/appointments', method: 'GET' },
    { name: 'Get Messages', path: '/api/messages', method: 'GET' },
    { name: 'Get Prescriptions', path: '/api/prescriptions', method: 'GET' }
  ];
  
  for (const endpoint of otherEndpoints) {
    try {
      const response = await axios.get(`${API_URL}${endpoint.path}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      console.log(`✅ ${endpoint.name}: ${response.status}`);
    } catch (error: any) {
      console.log(`❌ ${endpoint.name}: ${error.response?.status || 'Error'} - ${error.response?.data?.error || error.message}`);
    }
  }
  
  // 5. Summary
  console.log('\n📊 Summary:');
  console.log('- API Status: Online ✅');
  console.log('- Authentication: Working ✅');
  console.log('- Photo Routes: Need to verify on server');
  console.log('- User Type: Patient (iOS user)');
  console.log('\n🔍 Next Steps:');
  console.log('1. Check Render logs for any deployment errors');
  console.log('2. Verify S3 environment variables are set on Render');
  console.log('3. Test actual photo upload with multipart form data');
}

testProductionEndpoints().catch(console.error);