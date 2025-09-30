import { PrismaClient } from '@prisma/client';
import { supabaseAdmin } from '../config/supabase';

const prisma = new PrismaClient();

async function migrateDermToSupabase() {
  try {
    // Get Dr. Amit Om from database
    const drAmit = await prisma.dermatologist.findUnique({
      where: { email: 'dr.amitom@clearaf.com' }
    });

    if (!drAmit) {
      console.error('❌ Dr. Amit Om not found in database');
      return;
    }

    console.log('✅ Found Dr. Amit Om in database:', drAmit.name);

    // Create Supabase Auth user for Dr. Amit Om
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: drAmit.email,
      password: 'amit123',
      email_confirm: true,
      user_metadata: {
        name: drAmit.name,
        userType: 'dermatologist',
        dermatologistId: drAmit.id
      }
    });

    if (error) {
      if (error.message.includes('already been registered')) {
        console.log('⚠️  Dr. Amit Om already exists in Supabase Auth');

        // Get existing user
        const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
        const amitUser = existingUser.users.find(u => u.email === drAmit.email);

        if (amitUser) {
          console.log('✅ Found existing Supabase Auth user:', amitUser.id);
          console.log('\nLogin credentials:');
          console.log('Email: dr.amitom@clearaf.com');
          console.log('Password: amit123');
        }
      } else {
        throw error;
      }
    } else {
      console.log('✅ Created Supabase Auth user for Dr. Amit Om');
      console.log('User ID:', data.user?.id);
      console.log('\nLogin credentials:');
      console.log('Email: dr.amitom@clearaf.com');
      console.log('Password: amit123');
    }

    console.log('\n🎉 Dermatologist migration complete!');
    console.log('Web portal can now login with Supabase Auth');

  } catch (error) {
    console.error('Error migrating dermatologist:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

migrateDermToSupabase();
