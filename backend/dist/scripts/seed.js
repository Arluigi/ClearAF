"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🌱 Starting database seed...');
    const hashedPassword = await bcryptjs_1.default.hash('demo123456', 12);
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
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(14, 0, 0, 0);
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
    await prisma.message.create({
        data: {
            content: 'Hi Dr. Om, I have some questions about my skincare routine. When should I apply the retinol cream?',
            messageType: 'text',
            senderId: demoPatient.id,
            senderType: 'patient',
            recipientId: drAmit.id,
            recipientType: 'dermatologist',
            isRead: false
        }
    });
    await prisma.message.create({
        data: {
            content: 'Hello! Great question. Apply the retinol cream at night, starting with 2-3 times per week. Always use sunscreen during the day when using retinol products.',
            messageType: 'text',
            senderId: drAmit.id,
            senderType: 'dermatologist',
            recipientId: demoPatient.id,
            recipientType: 'patient',
            isRead: true
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
//# sourceMappingURL=seed.js.map