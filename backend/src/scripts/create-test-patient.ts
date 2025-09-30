import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createTestPatient() {
  try {
    console.log('👤 Creating test patient with known password...\n');

    const email = 'test.patient@clearaf.com';
    const password = 'test123';
    
    // Check if already exists
    const existing = await prisma.user.findUnique({
      where: { email }
    });

    if (existing) {
      console.log('✅ Test patient already exists');
      console.log(`   Email: ${existing.email}`);
      console.log(`   Password: ${password}`);
      console.log(`   Name: ${existing.name}`);
      return;
    }

    // Find dermatologist to assign to
    const dermatologist = await prisma.dermatologist.findFirst({
      where: { isAvailable: true },
      orderBy: { createdAt: 'asc' }
    });

    if (!dermatologist) {
      console.log('❌ No dermatologist available for assignment');
      return;
    }

    // Create test patient
    const hashedPassword = await bcrypt.hash(password, 12);
    
    const testPatient = await prisma.user.create({
      data: {
        name: 'Test Patient',
        email,
        password: hashedPassword,
        skinType: 'Normal',
        skinConcerns: 'Acne',
        onboardingCompleted: true,
        dermatologistId: dermatologist.id,
        currentSkinScore: 50,
        streakCount: 0
      },
      include: {
        assignedDermatologist: {
          select: {
            name: true,
            title: true,
            email: true
          }
        }
      }
    });

    console.log('✅ Test patient created successfully!');
    console.log(`   Email: ${testPatient.email}`);
    console.log(`   Password: ${password}`);
    console.log(`   Name: ${testPatient.name}`);
    console.log(`   Assigned to: ${testPatient.assignedDermatologist?.title} ${testPatient.assignedDermatologist?.name}`);
    console.log(`   ID: ${testPatient.id}`);

    console.log('\n📱 To test on iOS:');
    console.log(`   1. Login with: ${email} / ${password}`);
    console.log(`   2. Take a daily photo`);
    console.log(`   3. Check if it appears in the derm portal`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestPatient();