"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function createDermAccounts() {
    try {
        console.log('👨‍⚕️ Creating dermatologist accounts...');
        const existingAmitOm = await prisma.dermatologist.findUnique({
            where: { email: 'amit.om@clearaf.com' }
        });
        if (existingAmitOm) {
            console.log('✅ Dr. Amit Om already exists');
        }
        const testDermEmail = 'derm@clearaf.com';
        const existingTestDerm = await prisma.dermatologist.findUnique({
            where: { email: testDermEmail }
        });
        if (!existingTestDerm) {
            const hashedPassword = await bcryptjs_1.default.hash('password123', 12);
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
            await prisma.user.update({
                where: { email: 'demo@clearaf.com' },
                data: { dermatologistId: testDerm.id }
            });
            console.log('✅ Assigned demo patient to test dermatologist');
        }
        else {
            console.log('✅ Test dermatologist already exists');
            await prisma.user.update({
                where: { email: 'demo@clearaf.com' },
                data: { dermatologistId: existingTestDerm.id }
            });
            console.log('✅ Ensured demo patient is assigned to test dermatologist');
        }
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
    }
    catch (error) {
        console.error('❌ Error:', error);
    }
    finally {
        await prisma.$disconnect();
    }
}
createDermAccounts();
//# sourceMappingURL=create-derm-accounts.js.map