-- Pro sellers are postponed: remove the ways to grant it.
-- The app no longer has a Pro sheet or an admin "Make Pro" button, and the
-- update-seller-subscription edge function was deleted (it was never deployed).
--
-- profiles.is_pro stays: no row has it set, guard_profile_trust_fields and
-- admin_get_users reference it, and the column is cheap to keep for when Pro
-- comes back as a paid plan.

drop function if exists public.update_seller_subscription(boolean);
drop function if exists public.update_seller_subscription(uuid, boolean);
drop function if exists public.admin_toggle_pro_seller(uuid, boolean);
