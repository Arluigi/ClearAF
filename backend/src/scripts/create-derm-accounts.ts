import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createDermAccounts() {
  try {
    console.log('👨‍⚕️ Creating dermatologist accounts...');
    
    // Check if Dr. Amit Om already exists
    const existingAmitOm = await prisma.dermatologist.findUnique({
      where: { email: 'amit.om@clearaf.com' }
    });

    if (existingAmitOm) {
      console.log('✅ Dr. Amit Om already exists');
    }

    // Create a test dermatologist account for web portal login
    const testDermEmail = 'derm@clearaf.com';
    const existingTestDerm = await prisma.dermatologist.findUnique({
      where: { email: testDermEmail }
    });

    if (!existingTestDerm) {
      const hashedPassword = await bcrypt.hash('password123', 12);
      
      const testDerm = await prisma.dermatologist.create({
        data: {
          name: 'Test Dermatologist',
          email: testDermEmail,
          password: hashedPassword,
          title: 'Dr.',
          specialization: 'Dermatology',
          isAvailable: true
        }
      });

      console.log(`✅ Created test dermatologist: ${testDerm.name} (${testDerm.email})`);
      console.log(`🔑 Password: password123`);

      // Assign the demo patient to this new dermatologist too
      await prisma.user.update({
        where: { email: 'demo@clearaf.com' },
        data: { dermatologistId: testDerm.id }
      });

      console.log('✅ Assigned demo patient to test dermatologist');
    } else {
      console.log('✅ Test dermatologist already exists');

      // Make sure demo patient is assigned to this dermatologist
      await prisma.user.update({
        where: { email: 'demo@clearaf.com' },
        data: { dermatologistId: existingTestDerm.id }
      });

      console.log('✅ Ensured demo patient is assigned to test dermatologist');
    }

    // List final assignments
    console.log('\n📋 Final assignments:');
    const assignments = await prisma.user.findMany({
      where: { email: 'demo@clearaf.com' },
      include: {
        assignedDermatologist: {
          select: {
            name: true,
            email: true,
            title: true
          }
        }
      }
    });

    assignments.forEach(patient => {
      console.log(`   ${patient.name} → ${patient.assignedDermatologist?.title} ${patient.assignedDermatologist?.name} (${patient.assignedDermatologist?.email})`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createDermAccounts();