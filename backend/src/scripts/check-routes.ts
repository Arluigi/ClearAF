import fetch from 'node-fetch';

async function checkRoutes() {
  const routes = [
    '/api/auth/login',
    '/api/users',
    '/api/appointments', 
    '/api/messages',
    '/api/prescriptions',
    '/api/photos',
    '/api/photos/upload',
    '/api/photos/patient/test',
    '/api/dashboard'
  ];

  console.log('🔍 Checking API routes on production server...\n');

  for (const route of routes) {
    try {
      const response = await fetch(`https://clearaf.onrender.com${route}`, {
        method: 'GET',
        headers: { 'Authorization': 'Bearer invalid-token' }
      });

      const status = response.status;
      let message = '';

      if (status === 401) {
        message = '✅ EXISTS (needs auth)';
      } else if (status === 404) {
        message = '❌ NOT FOUND';
      } else if (status === 405) {
        message = '✅ EXISTS (wrong method)';
      } else {
        message = `? Status ${status}`;
      }

      console.log(`${route.padEnd(30)} → ${message}`);
    } catch (error) {
      console.log(`${route.padEnd(30)} → ❌ ERROR: ${error}`);
    }
  }
}

checkRoutes();