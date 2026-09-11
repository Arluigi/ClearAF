-- Step 1: Drop all foreign key constraints first
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_patientId_fkey;
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_dermatologistId_fkey;
ALTER TABLE prescriptions DROP CONSTRAINT IF EXISTS prescriptions_patientId_fkey;
ALTER TABLE prescriptions DROP CONSTRAINT IF EXISTS prescriptions_dermatologistId_fkey;
ALTER TABLE prescriptions DROP CONSTRAINT IF EXISTS prescriptions_productId_fkey;
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_userId_fkey;
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_productId_fkey;
ALTER TABLE skin_photos DROP CONSTRAINT IF EXISTS skin_photos_userId_fkey;
ALTER TABLE skin_photos DROP CONSTRAINT IF EXISTS skin_photos_appointmentId_fkey;
ALTER TABLE routine_steps DROP CONSTRAINT IF EXISTS routine_steps_routineId_fkey;
ALTER TABLE routines DROP CONSTRAINT IF EXISTS routines_userId_fkey CASCADE;

-- Step 2: Drop old users table
DROP TABLE IF EXISTS users CASCADE;

-- Step 3: Convert all ID columns to UUID type
ALTER TABLE appointments ALTER COLUMN id TYPE UUID USING id::uuid;
ALTER TABLE appointments ALTER COLUMN "patientId" TYPE UUID USING "patientId"::uuid;
ALTER TABLE appointments ALTER COLUMN "dermatologistId" TYPE UUID USING "dermatologistId"::uuid;

ALTER TABLE prescriptions ALTER COLUMN id TYPE UUID USING id::uuid;
ALTER TABLE prescriptions ALTER COLUMN "patientId" TYPE UUID USING "patientId"::uuid;
ALTER TABLE prescriptions ALTER COLUMN "dermatologistId" TYPE UUID USING "dermatologistId"::uuid;
ALTER TABLE prescriptions ALTER COLUMN "productId" TYPE UUID USING "productId"::uuid;

ALTER TABLE skin_photos ALTER COLUMN id TYPE UUID USING id::uuid;
ALTER TABLE skin_photos ALTER COLUMN "userId" TYPE UUID USING "userId"::uuid;
ALTER TABLE skin_photos ALTER COLUMN "appointmentId" TYPE UUID USING NULLIF("appointmentId", '')::uuid;

ALTER TABLE subscriptions ALTER COLUMN id TYPE UUID USING id::uuid;
ALTER TABLE subscriptions ALTER COLUMN "userId" TYPE UUID USING "userId"::uuid;
ALTER TABLE subscriptions ALTER COLUMN "productId" TYPE UUID USING "productId"::uuid;

ALTER TABLE routines ALTER COLUMN id TYPE UUID USING id::uuid;
ALTER TABLE routines ALTER COLUMN "userId" TYPE UUID USING "userId"::uuid;

ALTER TABLE routine_steps ALTER COLUMN id TYPE UUID USING id::uuid;
ALTER TABLE routine_steps ALTER COLUMN "routineId" TYPE UUID USING "routineId"::uuid;

ALTER TABLE products ALTER COLUMN id TYPE UUID USING id::uuid;

ALTER TABLE dermatologists ALTER COLUMN id TYPE UUID USING id::uuid;

-- Step 4: Create user_profiles table linked to Supabase Auth
CREATE TABLE "user_profiles" (
    "id" UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    "name" TEXT,
    "skinType" TEXT,
    "currentSkinScore" INTEGER NOT NULL DEFAULT 0,
    "streakCount" INTEGER NOT NULL DEFAULT 0,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "allergies" TEXT,
    "currentMedications" TEXT,
    "skinConcerns" TEXT,
    "joinDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dermatologistId" UUID
);

-- Step 5: Recreate foreign keys with UUID types
ALTER TABLE appointments ADD CONSTRAINT appointments_patientId_fkey
    FOREIGN KEY ("patientId") REFERENCES user_profiles(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE appointments ADD CONSTRAINT appointments_dermatologistId_fkey
    FOREIGN KEY ("dermatologistId") REFERENCES dermatologists(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE prescriptions ADD CONSTRAINT prescriptions_patientId_fkey
    FOREIGN KEY ("patientId") REFERENCES user_profiles(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE prescriptions ADD CONSTRAINT prescriptions_dermatologistId_fkey
    FOREIGN KEY ("dermatologistId") REFERENCES dermatologists(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE prescriptions ADD CONSTRAINT prescriptions_productId_fkey
    FOREIGN KEY ("productId") REFERENCES products(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_userId_fkey
    FOREIGN KEY ("userId") REFERENCES user_profiles(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_productId_fkey
    FOREIGN KEY ("productId") REFERENCES products(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE skin_photos ADD CONSTRAINT skin_photos_userId_fkey
    FOREIGN KEY ("userId") REFERENCES user_profiles(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE skin_photos ADD CONSTRAINT skin_photos_appointmentId_fkey
    FOREIGN KEY ("appointmentId") REFERENCES appointments(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE routines ADD CONSTRAINT routines_userId_fkey
    FOREIGN KEY ("userId") REFERENCES user_profiles(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE routine_steps ADD CONSTRAINT routine_steps_routineId_fkey
    FOREIGN KEY ("routineId") REFERENCES routines(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_dermatologistId_fkey
    FOREIGN KEY ("dermatologistId") REFERENCES dermatologists(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 6: Create indexes
CREATE INDEX idx_user_profiles_dermatologist ON user_profiles("dermatologistId");

-- Step 7: Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Step 8: Create RLS policies
CREATE POLICY "Users can view own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = id);

-- Step 9: Create trigger function to auto-create user profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_profiles (id, name, "createdAt", "updatedAt")
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', new.email),
    now(),
    now()
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 10: Create trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();