-- PlaceGuard: Clean up broken staff auth records
-- This deletes the broken test staff accounts (which have invalid UUID variants)
-- and all their associated dev data.
-- Student accounts are NOT touched.
-- After running this, use repair-staff-accounts.mjs to recreate via GoTrue Admin API.

DO $$
BEGIN
  -- 1. Remove applications (reference drives which reference profiles)
  DELETE FROM public.applications
  WHERE application_id IN (
    SELECT a.id FROM public.applications a
    JOIN public.drives d ON d.id = a.drive_id
    WHERE d.created_by IN (
      SELECT id FROM public.profiles 
      WHERE email LIKE '%placeguard.test%'
    )
  );

  -- Also remove applications by students for any drive
  -- (safe to keep student applications for non-test-company drives,
  --  but we need to clean up if the drives get deleted)
  DELETE FROM public.applications
  WHERE drive_id IN (
    SELECT id FROM public.drives
    WHERE created_by IN (
      SELECT id FROM public.profiles WHERE email LIKE '%placeguard.test%'
    )
  );

  -- 2. Remove eligibility_rules for test drives  
  DELETE FROM public.eligibility_rules
  WHERE drive_id IN (
    SELECT id FROM public.drives
    WHERE created_by IN (
      SELECT id FROM public.profiles WHERE email LIKE '%placeguard.test%'
    )
  );

  -- 3. Remove drives created by test company
  DELETE FROM public.drives
  WHERE created_by IN (
    SELECT id FROM public.profiles WHERE email LIKE '%placeguard.test%'
  );

  -- 4. Remove companies associated with test staff
  DELETE FROM public.companies
  WHERE profile_id IN (
    SELECT id FROM public.profiles WHERE email LIKE '%placeguard.test%'
  );

  -- 5. Remove profiles of test staff (auth.users FK cascade will handle auth.identities)
  DELETE FROM public.profiles WHERE email LIKE '%placeguard.test%';

  -- 6. Remove auth.users (cascades auth.identities automatically)
  DELETE FROM auth.users WHERE email LIKE '%placeguard.test%';

  RAISE NOTICE 'Cleanup complete. Recreate accounts via scripts/repair-staff-accounts.mjs';
END $$;
