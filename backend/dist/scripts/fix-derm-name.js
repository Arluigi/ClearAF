"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function fixDermName() {
    try {
        console.log('🔍 Checking current dermatologist names...');
        const dermatologists = await prisma.dermatologist.findMany({
            select: {
                id: true,
                name: true,
                title: true,
                email: true
            }
        });
        console.log('Current dermatologists:');
        dermatologists.forEach(derm => {
            console.log(`   ${derm.title} ${derm.name} (${derm.email})`);
        });
        const amitOm = dermatologists.find(d => d.email === 'amit.om@clearaf.com');
        if (amitOm && amitOm.name.includes('Dr.')) {
            console.log('\n🔧 Fixing doubled title for Amit Om...');
            await prisma.dermatologist.update({
                where: { id: amitOm.id },
                data: { name: 'Amit Om' }
            });
            console.log('✅ Updated name from "Dr. Amit Om" to "Amit Om"');
        }
        console.log('\n📋 Final result:');
        const updated = await prisma.dermatologist.findMany({
            select: {
                id: true,
                name: true,
                title: true,
                email: true
            }
        });
        updated.forEach(derm => {
            console.log(`   ${derm.title} ${derm.name} (${derm.email})`);
        });
    }
    catch (error) {
        console.error('❌ Error:', error);
    }
    finally {
        await prisma.$disconnect();
    }
}
fixDermName();
//# sourceMappingURL=fix-derm-name.js.map