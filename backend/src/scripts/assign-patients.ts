import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function assignUnassignedPatients() {
  try {
    console.log('🔍 Looking for patients without assigned dermatologists...');
    
    // Find patients without dermatologist assignment
    const unassignedPatients = await prisma.user.findMany({
      where: {
        dermatologistId: null
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true
      }
    });

    if (unassignedPatients.length === 0) {
      console.log('✅ All patients are already assigned to dermatologists');
      return;
    }

    console.log(`📝 Found ${unassignedPatients.length} unassigned patients:`);
    unassignedPatients.forEach(patient => {
      console.log(`   - ${patient.name || 'Unnamed'} (${patient.email})`);
    });

    // Find first available dermatologist (Dr. Amit Om)
    const defaultDermatologist = await prisma.dermatologist.findFirst({
      where: { isAvailable: true },
      orderBy: { createdAt: 'asc' }
    });

    if (!defaultDermatologist) {
      console.log('❌ No available dermatologists found. Please create a dermatologist account first.');
      return;
    }

    console.log(`👨‍⚕️ Assigning patients to: ${defaultDermatologist.name} (${defaultDermatologist.title})`);

    // Update all unassigned patients
    const updateResult = await prisma.user.updateMany({
      where: {
        dermatologistId: null
      },
      data: {
        dermatologistId: defaultDermatologist.id
      }
    });

    console.log(`✅ Successfully assigned ${updateResult.count} patients to ${defaultDermatologist.name}`);
    
  } catch (error) {
    console.error('❌ Error assigning patients:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
assignUnassignedPatients();