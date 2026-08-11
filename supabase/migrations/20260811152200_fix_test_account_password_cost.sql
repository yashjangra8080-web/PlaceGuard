-- Superseded: 2026-08-12
-- This migration attempted to re-hash test account passwords with bcrypt cost=10.
-- It is now a no-op because:
--   1. The original staff auth.users rows (with invalid UUID variant bits)
--      were deleted and recreated via GoTrue Admin API on 2026-08-12.
--   2. GoTrue-created accounts have correct bcrypt hashing by default.
--   3. The gen_salt(text, integer) form requires pgcrypto in the search_path
--      which is not available in the migration runner context.
-- No action required.
SELECT 1;
