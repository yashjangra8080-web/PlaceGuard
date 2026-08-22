-- PlaceGuard Development Test Data (v2)
-- ============================================================
-- PURPOSE: Provision company record, drives, eligibility rules,
--          and student records using the ALREADY-CREATED GoTrue
--          auth accounts (created via Admin API).
-- SAFE:    All inserts use ON CONFLICT DO NOTHING/UPDATE.
--          Student real accounts and all other data are preserved.
-- WHEN:    Run this AFTER the 4 staff accounts exist in auth.users
--          (created via scripts/repair-staff-accounts.mjs or GoTrue API).
-- ============================================================

DO $$
DECLARE
  -- Look up the profile IDs of already-created staff accounts
  v_company_id   uuid;
  v_coord_id     uuid;
  v_tnp_id       uuid;
  v_admin_id     uuid;

  -- Existing real student profile IDs (created via normal signup – do not alter)
  v_s1_profile   uuid := '879f3208-6660-4adf-a91c-864c770af413';  -- ankan98@gmail.com
  v_s2_profile   uuid := 'ca886e78-d04c-41c7-8c80-ad2e9f16103c';  -- ankan30@gmail.com

  v_company_uuid uuid;
  v_drive_id     uuid;
BEGIN

  -- ══════════════════════════════════════════════════════════
  -- 0. RESOLVE PROFILE IDs FROM EMAILS
  -- ══════════════════════════════════════════════════════════
  SELECT id INTO v_company_id FROM public.profiles WHERE email = 'company@placeguard.test';
  SELECT id INTO v_coord_id   FROM public.profiles WHERE email = 'coordinator@placeguard.test';
  SELECT id INTO v_tnp_id     FROM public.profiles WHERE email = 'tnp@placeguard.test';
  SELECT id INTO v_admin_id   FROM public.profiles WHERE email = 'admin@placeguard.test';

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'company@placeguard.test profile not found. Create the account first via Admin API.';
  END IF;
  IF v_coord_id IS NULL THEN
    RAISE EXCEPTION 'coordinator@placeguard.test profile not found. Create the account first via Admin API.';
  END IF;
  IF v_tnp_id IS NULL THEN
    RAISE EXCEPTION 'tnp@placeguard.test profile not found. Create the account first via Admin API.';
  END IF;
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'admin@placeguard.test profile not found. Create the account first via Admin API.';
  END IF;

  RAISE NOTICE 'company_id=%, coord_id=%, tnp_id=%, admin_id=%', v_company_id, v_coord_id, v_tnp_id, v_admin_id;

  -- ══════════════════════════════════════════════════════════
  -- 1. PROFILE ROLES
  --    The trigger creates profiles with role='student' by default.
  --    Update to correct roles for each test account.
  -- ══════════════════════════════════════════════════════════
  UPDATE public.profiles SET role = 'company',     name = 'Test Company HR'    WHERE id = v_company_id;
  UPDATE public.profiles SET role = 'coordinator', name = 'Test Coordinator'   WHERE id = v_coord_id;
  UPDATE public.profiles SET role = 'tnp_head',    name = 'Test T&P Head'      WHERE id = v_tnp_id;
  UPDATE public.profiles SET role = 'admin',        name = 'Test Administrator' WHERE id = v_admin_id;

  -- ══════════════════════════════════════════════════════════
  -- 2. STUDENTS RECORDS for the two existing real users
  --    ankan98 (CGPA 8.50, CSE, 0 backlogs) → eligible for test drive
  --    ankan30 (CGPA 6.80, CSE, 0 backlogs) → ineligible (below 7.00)
  --    Both paths are tested intentionally.
  -- ══════════════════════════════════════════════════════════
  INSERT INTO public.students
    (profile_id, roll_number, branch, year, cgpa, backlogs, skills)
  VALUES
    (v_s1_profile, 'DEV2026001', 'CSE', 4, 8.50, 0, ARRAY['JavaScript', 'React']),
    (v_s2_profile, 'DEV2026002', 'CSE', 4, 6.80, 0, ARRAY['JavaScript'])
  ON CONFLICT (profile_id) DO UPDATE
    SET roll_number = EXCLUDED.roll_number,
        branch      = EXCLUDED.branch,
        year        = EXCLUDED.year,
        cgpa        = EXCLUDED.cgpa,
        backlogs    = EXCLUDED.backlogs,
        skills      = EXCLUDED.skills;

  -- ══════════════════════════════════════════════════════════
  -- 3. COMPANY RECORD (owned by the company test account)
  -- ══════════════════════════════════════════════════════════
  INSERT INTO public.companies
    (profile_id, company_name, website, description, verified)
  VALUES
    (v_company_id, '[DEV] PlaceGuard Test Corp',
     'https://placeguard.test',
     'Development/test company. Not a real organisation.',
     true)
  ON CONFLICT (profile_id) DO NOTHING;

  SELECT id INTO v_company_uuid FROM public.companies WHERE profile_id = v_company_id;

  -- ══════════════════════════════════════════════════════════
  -- 4. TEST PLACEMENT DRIVE
  --    Inserted as status='open' with deadline 30 days away.
  --    ankan98 (8.50 CGPA, CSE, JavaScript) → ELIGIBLE
  --    ankan30 (6.80 CGPA, CSE, JavaScript) → INELIGIBLE (CGPA < 7.00)
  -- ══════════════════════════════════════════════════════════
  v_drive_id := gen_random_uuid();

  -- Upsert by (company_id, title) to be idempotent
  IF NOT EXISTS (
    SELECT 1 FROM public.drives 
    WHERE company_id = v_company_uuid AND title = '[DEV] Software Engineer Test Drive'
  ) THEN
    INSERT INTO public.drives
      (id, company_id, title, description, role_name, deadline, status, created_by)
    VALUES
      (v_drive_id, v_company_uuid,
       '[DEV] Software Engineer Test Drive',
       'Development/test drive only. Not a real placement opportunity.',
       'Software Engineer',
       now() + interval '30 days',
       'open',
       v_company_id);

    -- ══════════════════════════════════════════════════════════
    -- 5. ELIGIBILITY RULES
    -- ══════════════════════════════════════════════════════════
    INSERT INTO public.eligibility_rules
      (drive_id, min_cgpa, allowed_branches, max_backlogs, required_skills, locked)
    VALUES
      (v_drive_id, 7.00, ARRAY['CSE', 'IT'], 0, ARRAY['JavaScript'], true)
    ON CONFLICT (drive_id) DO NOTHING;

    RAISE NOTICE 'Created drive id=%', v_drive_id;
  ELSE
    RAISE NOTICE 'Test drive already exists — skipping drive+eligibility insert.';
  END IF;

  RAISE NOTICE 'Dev seed complete.';
END $$;
