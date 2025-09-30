import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createDrAmit() {
  try {
    // Check if Dr. Amit Om already exists
    const existing = await prisma.dermatologist.findUnique({
      where: { email: 'dr.amitom@clearaf.com' }
    });

    if (existing) {
      console.log('✅ Dr. Amit Om already exists');
      console.log('ID:', existing.id);
      console.log('Name:', existing.name);
      return existing;
    }

    // Create Dr. Amit Om
    const hashedPassword = await bcrypt.hash('amit123', 10);

    const drAmit = await prisma.dermatologist.create({
      data: {
        name: 'Amit Om',
        email: 'dr.amitom@clearaf.com',
        password: hashedPassword,
        title: 'MD, Board Certified Dermatologist',
        specialization: 'General Dermatology & Cosmetic Procedures',
        profileImageUrl: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=400',
        phone: '+1-555-DERM-DOC',
        isAvailable: true
      }
    });

    console.log('✅ Created Dr. Amit Om successfully!');
    console.log('ID:', drAmit.id);
    console.log('Name:', drAmit.name);
    console.log('Email:', drAmit.email);
    console.log('\nLogin credentials:');
    console.log('Email: dr.amitom@clearaf.com');
    console.log('Password: amit123');

    return drAmit;
  } catch (error) {
    console.error('Error creating Dr. Amit Om:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

createDrAmit();