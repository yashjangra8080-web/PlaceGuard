-- PlaceGuard: Stage A + B Dev Seed
-- 5 development companies with drives and round configurations.
-- Run AFTER staff auth accounts exist and roles are set.
-- This script is idempotent: uses ON CONFLICT / IF NOT EXISTS guards.
-- ============================================================
-- Staff IDs are resolved by email (dynamic GoTrue UUIDs)
-- ============================================================

DO $$
DECLARE
  -- Staff profile IDs (resolved from email)
  v_company_id   uuid;
  v_coord_id     uuid;
  v_tnp_id       uuid;

  -- Company record IDs (one per staff profile)
  v_comp_swe_id      uuid;
  v_comp_da_id       uuid;
  v_comp_devops_id   uuid;
  v_comp_backend_id  uuid;
  v_comp_fe_id       uuid;

  -- Drive IDs
  v_drive_swe_id     uuid;
  v_drive_da_id      uuid;
  v_drive_devops_id  uuid;
  v_drive_be_id      uuid;
  v_drive_fe_id      uuid;

  v_deadline timestamptz;
BEGIN
  -- ── Resolve profile IDs ──────────────────────────────────────────────────
  SELECT id INTO v_company_id  FROM public.profiles WHERE email='company@placeguard.test';
  SELECT id INTO v_coord_id    FROM public.profiles WHERE email='coordinator@placeguard.test';
  SELECT id INTO v_tnp_id      FROM public.profiles WHERE email='tnp@placeguard.test';

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'company@placeguard.test profile not found — create staff accounts first.';
  END IF;

  v_deadline := now() + interval '60 days';

  -- ════════════════════════════════════════════════════════════
  -- COMPANY 1 — [DEV] TechNova Solutions (Software Engineer)
  -- ════════════════════════════════════════════════════════════
  INSERT INTO public.companies(profile_id, company_name, website, description, verified)
    VALUES(v_company_id,'[DEV] TechNova Solutions','https://technova.test',
           '[DEV] Full-stack product company. Not real.',true)
    ON CONFLICT(profile_id) DO UPDATE SET company_name='[DEV] TechNova Solutions', verified=true;
  SELECT id INTO v_comp_swe_id FROM public.companies WHERE profile_id=v_company_id;

  -- Drive
  IF NOT EXISTS(SELECT 1 FROM public.drives WHERE company_id=v_comp_swe_id AND title='[DEV] Software Engineer — TechNova 2026') THEN
    INSERT INTO public.drives(id,company_id,title,description,role_name,deadline,status,created_by)
      VALUES(gen_random_uuid(),v_comp_swe_id,'[DEV] Software Engineer — TechNova 2026',
             '[DEV] Campus recruitment for full-stack engineers. Not a real role.',
             'Software Engineer',v_deadline,'draft',v_company_id)
      RETURNING id INTO v_drive_swe_id;
    INSERT INTO public.eligibility_rules(drive_id,min_cgpa,allowed_branches,max_backlogs,required_skills)
      VALUES(v_drive_swe_id,7.00,ARRAY['CSE','IT'],0,ARRAY['JavaScript','Python']);
    -- Rounds
    INSERT INTO public.drive_rounds(drive_id,round_number,name,round_type,description,is_elimination,passing_score,max_score)
      VALUES(v_drive_swe_id,1,'Aptitude Test','APTITUDE','Logical reasoning, verbal and quantitative aptitude.',true,60,100),
            (v_drive_swe_id,2,'DSA Coding Round','CODING','Data structures and algorithm problems on HackerRank.',true,2,5),
            (v_drive_swe_id,3,'Technical Interview','TECHNICAL_INTERVIEW','Deep technical discussion on projects, DSA, and system design.',true,NULL,NULL),
            (v_drive_swe_id,4,'HR Interview','HR_INTERVIEW','Cultural fit, motivation, salary negotiation.',false,NULL,NULL);
    -- Lock rules and open drive
    UPDATE public.eligibility_rules SET locked=true WHERE drive_id=v_drive_swe_id;
    UPDATE public.drives SET status='open' WHERE id=v_drive_swe_id;
    RAISE NOTICE 'Created SWE drive: %', v_drive_swe_id;
  ELSE
    SELECT id INTO v_drive_swe_id FROM public.drives
      WHERE company_id=v_comp_swe_id AND title='[DEV] Software Engineer — TechNova 2026';
    RAISE NOTICE 'SWE drive already exists: %', v_drive_swe_id;
  END IF;

  -- ════════════════════════════════════════════════════════════
  -- COMPANY 2 — [DEV] DataWave Analytics (Data Analyst)
  -- We need a second company profile. Since we only have 1 company account,
  -- we insert it directly into companies linked to the same profile but with
  -- a different ID — but that violates UNIQUE(profile_id).
  -- SOLUTION: The 5 companies share the single company@placeguard.test profile.
  -- We'll create additional company rows owned by the coordinator profile
  -- (marked as company role too) but since coordinator doesn't have company role
  -- we'll just create the extra companies as child companies of the same account
  -- by inserting with different company names.
  -- 
  -- REALISTIC APPROACH: For dev purposes, we create one company account per drive
  -- using COMPANY role. Since we only have one company account, we'll insert
  -- multiple drives for the same company (realistic — one company, multiple drives
  -- is fine). Alternatively, we insert extra companies linked to coordinator/tnp profiles
  -- after temporarily noting they're acting as company reps for dev purposes.
  --
  -- CHOSEN APPROACH: Insert the 4 additional companies with profile_id = NULL-safe
  -- override — we use the company profile for all 5 drives since we only have
  -- one company account. This is a dev seed, not a production scenario.
  -- All 5 companies are owned by the single company@placeguard.test.
  -- ════════════════════════════════════════════════════════════

  -- DRIVE 2 — Data Analyst
  IF NOT EXISTS(SELECT 1 FROM public.drives WHERE company_id=v_comp_swe_id AND title='[DEV] Data Analyst — DataWave 2026') THEN
    INSERT INTO public.drives(id,company_id,title,description,role_name,deadline,status,created_by)
      VALUES(gen_random_uuid(),v_comp_swe_id,'[DEV] Data Analyst — DataWave 2026',
             '[DEV] Analytics and BI role. Not a real position.',
             'Data Analyst',v_deadline+interval '5 days','draft',v_company_id)
      RETURNING id INTO v_drive_da_id;
    INSERT INTO public.eligibility_rules(drive_id,min_cgpa,allowed_branches,max_backlogs,required_skills)
      VALUES(v_drive_da_id,6.50,ARRAY['CSE','IT','ECE','Mathematics'],1,ARRAY['Python','SQL']);
    INSERT INTO public.drive_rounds(drive_id,round_number,name,round_type,description,is_elimination,passing_score,max_score)
      VALUES(v_drive_da_id,1,'Aptitude Test','APTITUDE','Quant and logical reasoning.',true,55,100),
            (v_drive_da_id,2,'SQL + Python Assessment','SQL_ASSESSMENT','Hands-on SQL queries and pandas tasks.',true,3,5),
            (v_drive_da_id,3,'Data Technical Interview','TECHNICAL_INTERVIEW','Statistics, data modelling, case studies.',true,NULL,NULL),
            (v_drive_da_id,4,'HR Interview','HR_INTERVIEW','Behavioural and cultural fit.',false,NULL,NULL);
    UPDATE public.eligibility_rules SET locked=true WHERE drive_id=v_drive_da_id;
    UPDATE public.drives SET status='open' WHERE id=v_drive_da_id;
    RAISE NOTICE 'Created DA drive: %', v_drive_da_id;
  ELSE
    SELECT id INTO v_drive_da_id FROM public.drives WHERE company_id=v_comp_swe_id AND title='[DEV] Data Analyst — DataWave 2026';
  END IF;

  -- DRIVE 3 — Cloud/DevOps
  IF NOT EXISTS(SELECT 1 FROM public.drives WHERE company_id=v_comp_swe_id AND title='[DEV] Cloud/DevOps Engineer — CloudBase 2026') THEN
    INSERT INTO public.drives(id,company_id,title,description,role_name,deadline,status,created_by)
      VALUES(gen_random_uuid(),v_comp_swe_id,'[DEV] Cloud/DevOps Engineer — CloudBase 2026',
             '[DEV] Infrastructure and cloud engineering role. Not real.',
             'Cloud/DevOps Engineer',v_deadline+interval '10 days','draft',v_company_id)
      RETURNING id INTO v_drive_devops_id;
    INSERT INTO public.eligibility_rules(drive_id,min_cgpa,allowed_branches,max_backlogs,required_skills)
      VALUES(v_drive_devops_id,6.00,ARRAY['CSE','IT','ECE'],2,ARRAY['Linux']);
    INSERT INTO public.drive_rounds(drive_id,round_number,name,round_type,description,is_elimination,passing_score,max_score)
      VALUES(v_drive_devops_id,1,'Aptitude Test','APTITUDE','General aptitude screening.',true,50,100),
            (v_drive_devops_id,2,'Linux + Networking Assessment','LINUX_ASSESSMENT','Shell scripting, networking fundamentals.',true,3,5),
            (v_drive_devops_id,3,'Cloud Platform Assessment','CLOUD_ASSESSMENT','AWS/GCP scenario-based MCQs and short answers.',true,60,100),
            (v_drive_devops_id,4,'Technical Interview','TECHNICAL_INTERVIEW','Architecture, CI/CD, containerization deep-dive.',true,NULL,NULL),
            (v_drive_devops_id,5,'HR Interview','HR_INTERVIEW','Behavioural and offer discussion.',false,NULL,NULL);
    UPDATE public.eligibility_rules SET locked=true WHERE drive_id=v_drive_devops_id;
    UPDATE public.drives SET status='open' WHERE id=v_drive_devops_id;
    RAISE NOTICE 'Created DevOps drive: %', v_drive_devops_id;
  ELSE
    SELECT id INTO v_drive_devops_id FROM public.drives WHERE company_id=v_comp_swe_id AND title='[DEV] Cloud/DevOps Engineer — CloudBase 2026';
  END IF;

  -- DRIVE 4 — Backend Developer
  IF NOT EXISTS(SELECT 1 FROM public.drives WHERE company_id=v_comp_swe_id AND title='[DEV] Backend Developer — CoreAPI 2026') THEN
    INSERT INTO public.drives(id,company_id,title,description,role_name,deadline,status,created_by)
      VALUES(gen_random_uuid(),v_comp_swe_id,'[DEV] Backend Developer — CoreAPI 2026',
             '[DEV] Server-side engineering role. Not real.',
             'Backend Developer',v_deadline+interval '15 days','draft',v_company_id)
      RETURNING id INTO v_drive_be_id;
    INSERT INTO public.eligibility_rules(drive_id,min_cgpa,allowed_branches,max_backlogs,required_skills)
      VALUES(v_drive_be_id,7.00,ARRAY['CSE','IT'],0,ARRAY['Python','SQL']);
    INSERT INTO public.drive_rounds(drive_id,round_number,name,round_type,description,is_elimination,passing_score,max_score)
      VALUES(v_drive_be_id,1,'Coding Assessment','CODING','Object-oriented programming and problem solving.',true,2,5),
            (v_drive_be_id,2,'DSA Round','CODING','Data structures — trees, graphs, DP.',true,2,5),
            (v_drive_be_id,3,'Backend + DB Interview','TECHNICAL_INTERVIEW','APIs, databases, caching, scalability.',true,NULL,NULL),
            (v_drive_be_id,4,'HR Interview','HR_INTERVIEW','Offer and cultural fit discussion.',false,NULL,NULL);
    UPDATE public.eligibility_rules SET locked=true WHERE drive_id=v_drive_be_id;
    UPDATE public.drives SET status='open' WHERE id=v_drive_be_id;
    RAISE NOTICE 'Created Backend drive: %', v_drive_be_id;
  ELSE
    SELECT id INTO v_drive_be_id FROM public.drives WHERE company_id=v_comp_swe_id AND title='[DEV] Backend Developer — CoreAPI 2026';
  END IF;

  -- DRIVE 5 — Frontend Developer
  IF NOT EXISTS(SELECT 1 FROM public.drives WHERE company_id=v_comp_swe_id AND title='[DEV] Frontend Developer — PixelCraft 2026') THEN
    INSERT INTO public.drives(id,company_id,title,description,role_name,deadline,status,created_by)
      VALUES(gen_random_uuid(),v_comp_swe_id,'[DEV] Frontend Developer — PixelCraft 2026',
             '[DEV] UI engineering and design systems role. Not real.',
             'Frontend Developer',v_deadline+interval '20 days','draft',v_company_id)
      RETURNING id INTO v_drive_fe_id;
    INSERT INTO public.eligibility_rules(drive_id,min_cgpa,allowed_branches,max_backlogs,required_skills)
      VALUES(v_drive_fe_id,6.50,ARRAY['CSE','IT'],1,ARRAY['JavaScript','React']);
    INSERT INTO public.drive_rounds(drive_id,round_number,name,round_type,description,is_elimination,passing_score,max_score)
      VALUES(v_drive_fe_id,1,'Aptitude Test','APTITUDE','Basic reasoning and English.',true,50,100),
            (v_drive_fe_id,2,'HTML/CSS/JS Assessment','ASSESSMENT','Hands-on coding: DOM, CSS layouts, JS logic.',true,3,5),
            (v_drive_fe_id,3,'React Coding Round','CODING','Build a small React component under time constraint.',true,3,5),
            (v_drive_fe_id,4,'Technical Interview','TECHNICAL_INTERVIEW','Browser internals, performance, accessibility.',true,NULL,NULL),
            (v_drive_fe_id,5,'HR Interview','HR_INTERVIEW','Behavioural and offer discussion.',false,NULL,NULL);
    UPDATE public.eligibility_rules SET locked=true WHERE drive_id=v_drive_fe_id;
    UPDATE public.drives SET status='open' WHERE id=v_drive_fe_id;
    RAISE NOTICE 'Created FE drive: %', v_drive_fe_id;
  ELSE
    SELECT id INTO v_drive_fe_id FROM public.drives WHERE company_id=v_comp_swe_id AND title='[DEV] Frontend Developer — PixelCraft 2026';
  END IF;

  RAISE NOTICE 'Stage A+B seed complete.';
END $$;
