import fetch from 'node-fetch';

const API_URL = 'https://clearaf.onrender.com/api';

async function testAllRoutes() {
  try {
    // Login first
    console.log('🔐 Logging in...');
    const loginResponse = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'amit.om@clearaf.com',
        password: 'demo123456',
        userType: 'dermatologist'
      })
    });

    const { token } = await loginResponse.json();
    console.log('✅ Got token\n');

    // Test various endpoints
    const endpoints = [
      { method: 'GET', path: '/photos' },
      { method: 'GET', path: '/photos/' },
      { method: 'GET', path: '/photos/patient' },
      { method: 'GET', path: '/photos/patient/' },
      { method: 'GET', path: '/photos/patient/test-id' },
      { method: 'GET', path: '/users' },
      { method: 'GET', path: '/appointments' },
      { method: 'GET', path: '/messages' },
      { method: 'GET', path: '/prescriptions' },
      { method: 'GET', path: '/dashboard/stats' },
      { method: 'GET', path: '/products' },
      { method: 'GET', path: '/routines' }
    ];

    console.log('🔍 Testing endpoints:');
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${API_URL}${endpoint.path}`, {
          method: endpoint.method,
          headers: { 'Authorization': `Bearer ${token}` }
        });

        console.log(`${endpoint.method} ${endpoint.path} → ${response.status} ${response.statusText}`);
        
        if (response.status === 404) {
          const text = await response.text();
          console.log(`   Response: ${text.substring(0, 100)}`);
        }
      } catch (error) {
        console.log(`${endpoint.method} ${endpoint.path} → ERROR: ${error}`);
      }
    }

    // Check server info
    console.log('\n📡 Checking server health...');
    const healthResponse = await fetch('https://clearaf.onrender.com/health');
    if (healthResponse.ok) {
      const health = await healthResponse.json();
      console.log('Server health:', health);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testAllRoutes();