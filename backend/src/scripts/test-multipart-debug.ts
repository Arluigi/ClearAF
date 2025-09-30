import axios from 'axios';
import FormData from 'form-data';

const API_URL = 'https://clearaf.onrender.com';

async function debugMultipart() {
  console.log('🔍 Debugging Multipart Upload Issue\n');
  
  // Create test user
  const userData = {
    name: 'Debug User',
    email: `debug.${Date.now()}@clearaf.com`,
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
  
  // Test 1: POST without multipart
  console.log('Test 1: POST to /api/photos/upload without multipart');
  try {
    const response = await axios.post(`${API_URL}/api/photos/upload`, 
      { test: 'data' },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('Response:', response.status, response.data);
  } catch (error: any) {
    console.log('Status:', error.response?.status);
    console.log('Error:', error.response?.data);
  }
  
  // Test 2: POST with empty multipart
  console.log('\nTest 2: POST to /api/photos/upload with empty multipart');
  try {
    const formData = new FormData();
    const response = await axios.post(`${API_URL}/api/photos/upload`, 
      formData,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          ...formData.getHeaders()
        }
      }
    );
    console.log('Response:', response.status, response.data);
  } catch (error: any) {
    console.log('Status:', error.response?.status);
    console.log('Error:', error.response?.data);
  }
  
  // Test 3: POST with fake file
  console.log('\nTest 3: POST to /api/photos/upload with fake file');
  try {
    const formData = new FormData();
    formData.append('photo', Buffer.from('fake image data'), {
      filename: 'test.jpg',
      contentType: 'image/jpeg'
    });
    formData.append('skinScore', '75');
    formData.append('notes', 'Test upload');
    
    const response = await axios.post(`${API_URL}/api/photos/upload`, 
      formData,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          ...formData.getHeaders()
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );
    console.log('Response:', response.status, response.data);
  } catch (error: any) {
    console.log('Status:', error.response?.status);
    console.log('Error:', error.response?.data);
    console.log('Headers:', error.response?.headers);
  }
  
  // Test 4: Check other methods on the same path
  console.log('\nTest 4: Testing other HTTP methods on /api/photos/upload');
  const methods = ['GET', 'PUT', 'DELETE', 'PATCH'];
  
  for (const method of methods) {
    try {
      const response = await axios({
        method: method as any,
        url: `${API_URL}/api/photos/upload`,
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      console.log(`${method}: ${response.status}`);
    } catch (error: any) {
      console.log(`${method}: ${error.response?.status} - ${error.response?.data?.error || error.response?.statusText}`);
    }
  }
}

debugMultipart().catch(console.error);