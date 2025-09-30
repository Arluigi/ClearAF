-- Drop old users table and recreate linked to Supabase Auth
DROP TABLE IF EXISTS users CASCADE;

-- Create user profiles table linked to Supabase Auth
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
    "dermatologistId" TEXT
);

-- Update foreign keys to reference user_profiles instead of users
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_patientId_fkey;
ALTER TABLE appointments ADD CONSTRAINT appointments_patientId_fkey
    FOREIGN KEY ("patientId") REFERENCES user_profiles(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE prescriptions DROP CONSTRAINT IF EXISTS prescriptions_patientId_fkey;
ALTER TABLE prescriptions ADD CONSTRAINT prescriptions_patientId_fkey
    FOREIGN KEY ("patientId") REFERENCES user_profiles(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_userId_fkey;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_userId_fkey
    FOREIGN KEY ("userId") REFERENCES user_profiles(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE skin_photos DROP CONSTRAINT IF EXISTS skin_photos_userId_fkey;
ALTER TABLE skin_photos ADD CONSTRAINT skin_photos_userId_fkey
    FOREIGN KEY ("userId") REFERENCES user_profiles(id) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Create index for better performance
CREATE INDEX idx_user_profiles_dermatologist ON user_profiles("dermatologistId");

-- Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user_profiles
CREATE POLICY "Users can view own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = id);

-- Create function to automatically create user profile on signup
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

-- Trigger to create profile when user signs up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();