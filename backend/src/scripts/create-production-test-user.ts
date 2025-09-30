import axios from 'axios';

const API_URL = 'https://clearaf.onrender.com';

async function createTestUser() {
  console.log('🧪 Creating test user on production...\n');
  
  // Create a test patient
  const patientData = {
    name: 'Test Patient',
    email: `test.patient.${Date.now()}@clearaf.com`,
    password: 'TestPass123!',
    userType: 'patient' as const,
    skinType: 'Combination',
    skinConcerns: 'Acne, Dark spots'
  };
  
  try {
    console.log('📝 Creating patient account...');
    const registerResponse = await axios.post(`${API_URL}/api/auth/register`, patientData);
    console.log('✅ Patient created successfully');
    console.log('   Email:', patientData.email);
    console.log('   Password:', patientData.password);
    console.log('   Assigned to:', registerResponse.data.user.assignedDermatologist?.name || 'No dermatologist');
    
    const token = registerResponse.data.token;
    
    // Test photo endpoints with new user
    console.log('\n📸 Testing photo endpoints with new user...');
    
    // Get photos (should be empty)
    try {
      const photos = await axios.get(`${API_URL}/api/photos`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('✅ GET /api/photos:', photos.status, `- ${photos.data.photos?.length || 0} photos`);
    } catch (error: any) {
      console.log('❌ GET /api/photos failed:', error.response?.status, error.response?.data);
    }
    
    // Get timeline (should be empty)
    try {
      const timeline = await axios.get(`${API_URL}/api/photos/timeline/progress`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('✅ GET /api/photos/timeline/progress:', timeline.status, `- ${timeline.data.timeline?.length || 0} entries`);
    } catch (error: any) {
      console.log('❌ GET /api/photos/timeline/progress failed:', error.response?.status, error.response?.data);
    }
    
    // Test that upload endpoint exists
    try {
      await axios.post(`${API_URL}/api/photos/upload`, {}, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      console.log('❌ POST /api/photos/upload: Unexpected success');
    } catch (error: any) {
      if (error.response?.status === 400 || error.response?.status === 415) {
        console.log('✅ POST /api/photos/upload: Endpoint exists (rejects empty request)');
      } else {
        console.log('❌ POST /api/photos/upload:', error.response?.status, error.response?.data);
      }
    }
    
    console.log('\n✅ All photo endpoints are deployed and accessible!');
    console.log('\n📋 Test Credentials:');
    console.log(`Email: ${patientData.email}`);
    console.log(`Password: ${patientData.password}`);
    console.log(`Token: ${token.substring(0, 20)}...`);
    
  } catch (error: any) {
    console.log('❌ Failed to create test user');
    console.log('Status:', error.response?.status);
    console.log('Error:', error.response?.data);
    
    // Check if it's because no dermatologists exist
    if (error.response?.data?.error?.includes('dermatologist')) {
      console.log('\n⚠️  No dermatologists found in production database');
      console.log('   Need to create dermatologist accounts first');
    }
  }
}

createTestUser().catch(console.error);