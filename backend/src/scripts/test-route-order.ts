import axios from 'axios';

const API_URL = 'https://clearaf.onrender.com';

async function testRouteOrder() {
  console.log('🔍 Testing Route Order Issue\n');
  
  // Create test user
  const userData = {
    name: 'Route Test',
    email: `route.${Date.now()}@clearaf.com`,
    password: 'TestPass123!',
    userType: 'patient' as const
  };
  
  let token: string;
  
  try {
    const registerResponse = await axios.post(`${API_URL}/api/auth/register`, userData);
    token = registerResponse.data.token;
    console.log('✅ Test user created\n');
  } catch (error: any) {
    console.log('❌ Failed to create test user:', error.response?.data);
    return;
  }
  
  // Test routes that might be conflicting
  const routes = [
    { path: '/api/photos', method: 'GET', description: 'List photos' },
    { path: '/api/photos/upload', method: 'GET', description: 'Should not match /:id' },
    { path: '/api/photos/timeline', method: 'GET', description: 'Should not match /:id' },
    { path: '/api/photos/timeline/progress', method: 'GET', description: 'Timeline endpoint' },
    { path: '/api/photos/abc123', method: 'GET', description: 'Specific photo (/:id)' },
  ];
  
  console.log('Testing GET requests to check route matching:\n');
  
  for (const route of routes) {
    try {
      const response = await axios({
        method: route.method as any,
        url: `${API_URL}${route.path}`,
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      console.log(`✅ ${route.path}: ${response.status} - ${route.description}`);
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.response?.statusText;
      const code = error.response?.data?.code || '';
      console.log(`❌ ${route.path}: ${error.response?.status} - ${errorMsg} ${code ? `(${code})` : ''}`);
    }
  }
  
  // Now test POST to /upload specifically
  console.log('\nTesting POST /api/photos/upload specifically:\n');
  
  try {
    // First, let's see what happens with a regular POST to /api/photos/upload
    const response = await axios.post(`${API_URL}/api/photos/upload`, 
      {},
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('Unexpected success:', response.status);
  } catch (error: any) {
    console.log(`POST /api/photos/upload (JSON): ${error.response?.status} - ${error.response?.data?.error}`);
    
    // If it's a 404, the route doesn't exist in the deployed version
    if (error.response?.status === 404) {
      console.log('\n⚠️  ISSUE FOUND: /api/photos/upload route is not registered in the deployed version!');
      console.log('This suggests the latest code with S3 upload is NOT deployed.');
    }
  }
}

testRouteOrder().catch(console.error);