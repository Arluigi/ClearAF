import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function assignExistingPatients() {
  try {
    // Get Dr. Amit Om's ID
    const drAmit = await prisma.dermatologist.findUnique({
      where: { email: 'dr.amitom@clearaf.com' }
    });

    if (!drAmit) {
      console.error('❌ Dr. Amit Om not found. Run create-dr-amit.ts first.');
      return;
    }

    console.log('✅ Found Dr. Amit Om:', drAmit.name, `(${drAmit.id})`);

    // Find all patients without a dermatologist
    const unassignedPatients = await prisma.user.findMany({
      where: {
        dermatologistId: null
      }
    });

    console.log(`\n📋 Found ${unassignedPatients.length} unassigned patients\n`);

    if (unassignedPatients.length === 0) {
      console.log('✅ All patients already assigned!');
      return;
    }

    // Assign each patient to Dr. Amit Om
    for (const patient of unassignedPatients) {
      await prisma.user.update({
        where: { id: patient.id },
        data: { dermatologistId: drAmit.id }
      });

      console.log(`✅ Assigned patient: ${patient.name || 'Unknown'} (${patient.id})`);
    }

    console.log(`\n🎉 Successfully assigned ${unassignedPatients.length} patients to Dr. Amit Om`);

  } catch (error) {
    console.error('Error assigning patients:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

assignExistingPatients();
