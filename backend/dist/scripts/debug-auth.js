"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function debugAuth() {
    try {
        console.log('🔍 Debugging authentication and assignments...\n');
        console.log('👨‍⚕️ All dermatologists in database:');
        const allDerms = await prisma.dermatologist.findMany({
            select: {
                id: true,
                name: true,
                title: true,
                email: true,
                isAvailable: true,
                createdAt: true
            }
        });
        allDerms.forEach((derm, index) => {
            console.log(`   ${index + 1}. ${derm.title} ${derm.name}`);
            console.log(`      Email: ${derm.email}`);
            console.log(`      ID: ${derm.id}`);
            console.log(`      Created: ${derm.createdAt.toISOString()}`);
            console.log('');
        });
        console.log('👤 Demo patient assignment:');
        const demoPatient = await prisma.user.findUnique({
            where: { email: 'demo@clearaf.com' },
            include: {
                assignedDermatologist: {
                    select: {
                        id: true,
                        name: true,
                        title: true,
                        email: true
                    }
                }
            }
        });
        if (demoPatient) {
            console.log(`   Patient: ${demoPatient.name} (${demoPatient.email})`);
            console.log(`   Patient ID: ${demoPatient.id}`);
            console.log(`   Assigned to: ${demoPatient.assignedDermatologist?.title} ${demoPatient.assignedDermatologist?.name}`);
            console.log(`   Dermatologist ID: ${demoPatient.dermatologistId}`);
            console.log(`   Dermatologist Email: ${demoPatient.assignedDermatologist?.email}`);
        }
        else {
            console.log('   ❌ Demo patient not found!');
        }
        console.log('\n📸 Demo patient photos:');
        if (demoPatient) {
            const photos = await prisma.skinPhoto.findMany({
                where: { userId: demoPatient.id },
                select: {
                    id: true,
                    photoUrl: true,
                    skinScore: true,
                    captureDate: true
                },
                orderBy: { captureDate: 'desc' },
                take: 5
            });
            if (photos.length > 0) {
                console.log(`   Found ${photos.length} photos:`);
                photos.forEach((photo, index) => {
                    console.log(`     ${index + 1}. Score: ${photo.skinScore}, Date: ${photo.captureDate.toISOString()}`);
                    console.log(`        URL: ${photo.photoUrl}`);
                });
            }
            else {
                console.log('   ❌ No photos found for demo patient');
            }
        }
        console.log('\n🔗 API Endpoints expect:');
        console.log('   GET /api/photos/patient/:patientId');
        console.log('   GET /api/photos/patient/:patientId/timeline');
        console.log('   These require the logged-in dermatologist ID to match patient.dermatologistId');
        console.log('\n💡 To fix the issue:');
        console.log('   1. Log into web portal using: amit.om@clearaf.com');
        console.log('   2. Or create a new dermatologist account and reassign the demo patient');
    }
    catch (error) {
        console.error('❌ Error:', error);
    }
    finally {
        await prisma.$disconnect();
    }
}
debugAuth();
//# sourceMappingURL=debug-auth.js.map