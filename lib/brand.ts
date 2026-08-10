// Single source of truth for the brand name and public web URL. Previously the
// name was hardcoded per-screen and had drifted ("Carrinix" vs "Carrinex"), and
// the web base URL was duplicated in profile/settings/user. Import from here so
// user-facing copy and share links stay consistent everywhere.
export const BRAND = 'Carrinex';

// Public web base (deep links / share URLs).
export const APP_URL = 'https://ceranix.vercel.app';
