-- Fresh start: Drop everything and recreate with UUID types

-- Drop all tables in correct order (respecting dependencies)
DROP TABLE IF EXISTS routine_steps CASCADE;
DROP TABLE IF EXISTS routines CASCADE;
DROP TABLE IF EXISTS skin_photos CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS prescriptions CASCADE;
DROP TABLE IF EXISTS appointments CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
DROP TABLE IF EXISTS dermatologists CASCADE;

-- Create dermatologists table with UUID
CREATE TABLE dermatologists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    title TEXT,
    specialization TEXT,
    "profileImageUrl" TEXT,
    phone TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create user_profiles table linked to Supabase Auth
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT,
    "skinType" TEXT,
    "currentSkinScore" INTEGER NOT NULL DEFAULT 0,
    "streakCount" INTEGER NOT NULL DEFAULT 0,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    allergies TEXT,
    "currentMedications" TEXT,
    "skinConcerns" TEXT,
    "joinDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dermatologistId" UUID REFERENCES dermatologists(id) ON DELETE SET NULL
);

-- Create products table
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    brand TEXT,
    category TEXT NOT NULL,
    price DECIMAL(65,30) NOT NULL,
    "productDescription" TEXT,
    ingredients TEXT,
    "imageUrl" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "isPrescriptionRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create appointments table
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    duration INTEGER NOT NULL DEFAULT 30,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    concern TEXT,
    notes TEXT,
    "visitNotes" TEXT,
    "videoCallURL" TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patientId" UUID NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
    "dermatologistId" UUID NOT NULL REFERENCES dermatologists(id) ON DELETE RESTRICT
);

-- Create prescriptions table
CREATE TABLE prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "medicationName" TEXT NOT NULL,
    dosage TEXT NOT NULL,
    instructions TEXT NOT NULL,
    "prescribedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryDate" TIMESTAMP(3),
    "refillsRemaining" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    pharmacy TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patientId" UUID NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
    "dermatologistId" UUID NOT NULL REFERENCES dermatologists(id) ON DELETE RESTRICT,
    "productId" UUID REFERENCES products(id) ON DELETE SET NULL
);

-- Create messages table
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    "sentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "attachmentUrl" TEXT,
    "attachmentType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "senderId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL DEFAULT 'patient',
    "recipientId" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL DEFAULT 'dermatologist'
);

-- Create subscriptions table
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextDeliveryDate" TIMESTAMP(3) NOT NULL,
    frequency TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active',
    "totalPrice" DECIMAL(65,30) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
    "productId" UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT
);

-- Create skin_photos table
CREATE TABLE skin_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "photoUrl" TEXT NOT NULL,
    "skinScore" INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    "captureDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
    "appointmentId" UUID REFERENCES appointments(id) ON DELETE SET NULL
);

-- Create routines table
CREATE TABLE routines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    "timeOfDay" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "completedToday" BOOLEAN NOT NULL DEFAULT false,
    "userId" UUID NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create routine_steps table
CREATE TABLE routine_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "productName" TEXT NOT NULL,
    "productType" TEXT,
    instructions TEXT,
    duration INTEGER NOT NULL DEFAULT 0,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "routineId" UUID NOT NULL REFERENCES routines(id) ON DELETE RESTRICT
);

-- Create indexes
CREATE INDEX idx_user_profiles_dermatologist ON user_profiles("dermatologistId");
CREATE INDEX idx_appointments_patient ON appointments("patientId");
CREATE INDEX idx_appointments_dermatologist ON appointments("dermatologistId");
CREATE INDEX idx_skin_photos_user ON skin_photos("userId");
CREATE INDEX idx_prescriptions_patient ON prescriptions("patientId");

-- Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = id);

-- Create trigger function to auto-create user profile on signup
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

-- Create trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();