import fetch from 'node-fetch';

async function testAuth() {
  console.log('🔐 Testing authentication endpoints...\n');

  const endpoints = [
    'https://clearaf.onrender.com/api/auth/login',
    'https://clearaf.onrender.com/auth/login',
    'https://clearaf.onrender.com/login'
  ];

  for (const endpoint of endpoints) {
    console.log(`Testing: ${endpoint}`);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test.patient@clearaf.com',
          password: 'test123',
          userType: 'patient'
        })
      });

      console.log(`  Status: ${response.status}`);
      const text = await response.text();
      console.log(`  Response: ${text.substring(0, 100)}`);
      
      if (response.status === 200) {
        console.log('  ✅ SUCCESS!');
        return;
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error}`);
    }
    console.log('');
  }

  console.log('❌ All auth endpoints failed');
}

testAuth();