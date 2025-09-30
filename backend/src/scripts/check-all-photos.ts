import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAllPhotos() {
  try {
    console.log('📸 Checking ALL photos in database...\n');
    
    const allPhotos = await prisma.skinPhoto.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (allPhotos.length === 0) {
      console.log('❌ No photos found in database at all!');
      console.log('\nThis means the iOS photo upload is not working.');
      console.log('The photo was likely saved only locally on the device.');
      return;
    }

    console.log(`📊 Found ${allPhotos.length} total photos:`);
    allPhotos.forEach((photo, index) => {
      console.log(`\n   ${index + 1}. Photo ID: ${photo.id}`);
      console.log(`      User: ${photo.user?.name || 'Unknown'} (${photo.user?.email || 'No email'})`);
      console.log(`      User ID: ${photo.userId}`);
      console.log(`      Score: ${photo.skinScore}`);
      console.log(`      Date: ${photo.captureDate.toISOString()}`);
      console.log(`      URL: ${photo.photoUrl}`);
      console.log(`      Notes: ${photo.notes || 'None'}`);
    });

    // Check users in database
    console.log('\n👥 All users in database:');
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true
      }
    });

    allUsers.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user.name || 'Unnamed'} (${user.email}) - ID: ${user.id}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAllPhotos();