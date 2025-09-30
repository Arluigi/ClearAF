import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAssignments() {
  try {
    console.log('👨‍⚕️ Checking dermatologists:');
    const dermatologists = await prisma.dermatologist.findMany({
      select: {
        id: true,
        name: true,
        title: true,
        email: true,
        isAvailable: true,
        createdAt: true,
        patients: {
          select: {
            id: true,
            name: true,
            email: true,
            currentSkinScore: true
          }
        }
      }
    });

    if (dermatologists.length === 0) {
      console.log('❌ No dermatologists found!');
      return;
    }

    dermatologists.forEach(derm => {
      console.log(`\n📋 ${derm.title} ${derm.name} (${derm.email})`);
      console.log(`   ID: ${derm.id}`);
      console.log(`   Available: ${derm.isAvailable ? '✅' : '❌'}`);
      console.log(`   Patients: ${derm.patients.length}`);
      
      if (derm.patients.length > 0) {
        derm.patients.forEach(patient => {
          console.log(`     - ${patient.name || 'Unnamed'} (${patient.email}) - Score: ${patient.currentSkinScore || 'N/A'}`);
        });
      }
    });

    console.log('\n👤 Checking all patients:');
    const allPatients = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        dermatologistId: true,
        currentSkinScore: true,
        assignedDermatologist: {
          select: {
            id: true,
            name: true,
            title: true
          }
        }
      }
    });

    if (allPatients.length === 0) {
      console.log('❌ No patients found!');
      return;
    }

    allPatients.forEach(patient => {
      const assignedTo = patient.assignedDermatologist 
        ? `${patient.assignedDermatologist.title} ${patient.assignedDermatologist.name}`
        : 'UNASSIGNED';
      console.log(`   - ${patient.name || 'Unnamed'} (${patient.email}) → ${assignedTo}`);
    });

  } catch (error) {
    console.error('❌ Error checking assignments:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAssignments();