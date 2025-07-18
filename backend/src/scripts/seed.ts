import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create Dr. Amit Om (default dermatologist from iOS app)
  const hashedPassword = await bcrypt.hash('demo123456', 12);
  
  const drAmit = await prisma.dermatologist.upsert({
    where: { email: 'amit.om@clearaf.com' },
    update: {},
    create: {
      name: 'Dr. Amit Om',
      email: 'amit.om@clearaf.com',
      password: hashedPassword,
      title: 'Dr.',
      specialization: 'Dermatology & Skin Care',
      phone: '+1 (555) 123-4567',
      isAvailable: true
    }
  });

  console.log('✅ Created Dr. Amit Om:', drAmit.name);

  // Create sample products
  const products = [
    {
      name: 'Gentle Cleansing Foam',
      brand: 'ClearAF',
      category: 'Cleanser',
      price: 24.99,
      productDescription: 'A gentle, pH-balanced cleanser suitable for all skin types',
      ingredients: 'Water, Sodium Cocoyl Glutamate, Glycerin, Niacinamide',
      isPrescriptionRequired: false
    },
    {
      name: 'Vitamin C Serum',
      brand: 'ClearAF',
      category: 'Serum',
      price: 45.99,
      productDescription: 'Brightening vitamin C serum with antioxidants',
      ingredients: 'L-Ascorbic Acid, Hyaluronic Acid, Vitamin E',
      isPrescriptionRequired: false
    },
    {
      name: 'Retinol Treatment 0.5%',
      brand: 'ClearAF',
      category: 'Treatment',
      price: 65.99,
      productDescription: 'Professional-strength retinol for acne and anti-aging',
      ingredients: 'Retinol, Squalane, Ceramides, Peptides',
      isPrescriptionRequired: true
    },
    {
      name: 'Daily Moisturizer SPF 30',
      brand: 'ClearAF',
      category: 'Moisturizer',
      price: 32.99,
      productDescription: 'Lightweight daily moisturizer with broad-spectrum SPF',
      ingredients: 'Zinc Oxide, Hyaluronic Acid, Ceramides, Niacinamide',
      isPrescriptionRequired: false
    }
  ];

  for (const product of products) {
    await prisma.product.create({
      data: product
    });
  }

  console.log(`✅ Created ${products.length} sample products`);

  // Create a demo patient
  const demoPatient = await prisma.user.upsert({
    where: { email: 'demo@clearaf.com' },
    update: {},
    create: {
      name: 'Demo Patient',
      email: 'demo@clearaf.com',
      password: hashedPassword,
      skinType: 'Combination',
      currentSkinScore: 75,
      streakCount: 5,
      onboardingCompleted: true,
      skinConcerns: 'Acne, occasional breakouts',
      dermatologistId: drAmit.id
    }
  });

  console.log('✅ Created demo patient:', demoPatient.name);

  // Create sample appointment
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(14, 0, 0, 0); // 2:00 PM tomorrow

  await prisma.appointment.create({
    data: {
      scheduledDate: tomorrow,
      type: 'consultation',
      concern: 'Routine check-up and skin assessment',
      duration: 30,
      status: 'scheduled',
      patientId: demoPatient.id,
      dermatologistId: drAmit.id
    }
  });

  console.log('✅ Created sample appointment');

  // Create sample message
  await prisma.message.create({
    data: {
      content: 'Welcome to Clear AF! I\'m Dr. Amit Om, your assigned dermatologist. Feel free to reach out with any questions about your skincare routine.',
      messageType: 'text',
      senderId: demoPatient.id,
      recipientId: drAmit.id,
      isRead: false
    }
  });

  console.log('✅ Created welcome message');

  console.log('🎉 Database seeded successfully!');
  console.log('\n📋 Demo Credentials:');
  console.log('Patient: demo@clearaf.com / demo123456');
  console.log('Doctor: amit.om@clearaf.com / demo123456');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });