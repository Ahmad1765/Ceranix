-- Add saved_collection_privacy column to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS saved_collection_privacy text NOT NULL DEFAULT 'public' CHECK (saved_collection_privacy IN ('public', 'private'));

COMMENT ON COLUMN public.profiles.saved_collection_privacy IS 'Privacy setting for the user saved collection (public vs private)';
