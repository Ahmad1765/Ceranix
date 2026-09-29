-- Set saved_collection_privacy column default to 'private'
ALTER TABLE public.profiles
  ALTER COLUMN saved_collection_privacy SET DEFAULT 'private';

-- Update all existing profiles that are currently 'public' or null to 'private'
UPDATE public.profiles
SET saved_collection_privacy = 'private'
WHERE saved_collection_privacy IS NULL OR saved_collection_privacy = 'public';
