-- PlaceGuard Stage C+D Seed
-- Creates student records (CGPA/branch/skills/backlogs) for the 20 dev auth users,
-- then creates ~70 realistic applications across 5 drives with round results.
-- IDEMPOTENT: uses ON CONFLICT DO NOTHING or IF NOT EXISTS guards.
-- ============================================================

DO $$
DECLARE
  -- Student profile → student record mapping (resolved dynamically)
  v_pid   uuid;
  v_sid   uuid;

  -- Drive IDs
  v_drive_swe    uuid;
  v_drive_da     uuid;
  v_drive_devops uuid;
  v_drive_be     uuid;
  v_drive_fe     uuid;

  -- Round IDs per drive  (resolved by round_number)
  v_app_id uuid;

  -- Helper to get round ID
  v_round_id uuid;
  v_ar_id    uuid;

BEGIN
  -- ── Resolve drive IDs ─────────────────────────────────────────────────
  SELECT id INTO v_drive_swe    FROM public.drives WHERE title='[DEV] Software Engineer — TechNova 2026';
  SELECT id INTO v_drive_da     FROM public.drives WHERE title='[DEV] Data Analyst — DataWave 2026';
  SELECT id INTO v_drive_devops FROM public.drives WHERE title='[DEV] Cloud/DevOps Engineer — CloudBase 2026';
  SELECT id INTO v_drive_be     FROM public.drives WHERE title='[DEV] Backend Developer — CoreAPI 2026';
  SELECT id INTO v_drive_fe     FROM public.drives WHERE title='[DEV] Frontend Developer — PixelCraft 2026';

  IF v_drive_swe IS NULL THEN RAISE EXCEPTION 'DEV drives not found. Run seed_stage_ab.sql first.'; END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- STAGE C: Create student records for the 20 dev users
  -- ══════════════════════════════════════════════════════════════════════
  -- Each INSERT uses ON CONFLICT (profile_id) DO NOTHING for idempotency.

  -- Helper macro pattern: resolve profile → insert student
  -- Format: email, roll_number, branch, cgpa, backlogs, skills[]

  WITH inserts(email, roll, branch, cgpa, backlogs, skills) AS (VALUES
    ('dev.alice.cse@placeguard.test', 'DEV001', 'CSE', 8.9, 0, ARRAY['Python','JavaScript','React']),
    ('dev.bob.it@placeguard.test',    'DEV002', 'IT',  7.2, 1, ARRAY['Python','SQL']),
    ('dev.carol.cse@placeguard.test', 'DEV003', 'CSE', 9.1, 0, ARRAY['JavaScript','React','Linux']),
    ('dev.david.ece@placeguard.test', 'DEV004', 'ECE', 6.8, 2, ARRAY['Linux']),
    ('dev.eve.it@placeguard.test',    'DEV005', 'IT',  8.0, 0, ARRAY['Python','SQL','JavaScript']),
    ('dev.frank.cse@placeguard.test', 'DEV006', 'CSE', 5.9, 3, ARRAY['Python']),
    ('dev.grace.it@placeguard.test',  'DEV007', 'IT',  7.8, 0, ARRAY['SQL','Python','Linux']),
    ('dev.henry.cse@placeguard.test', 'DEV008', 'CSE', 8.5, 0, ARRAY['JavaScript','React','Python']),
    ('dev.iris.ece@placeguard.test',  'DEV009', 'ECE', 6.5, 1, ARRAY['Linux','Python']),
    ('dev.jack.cse@placeguard.test',  'DEV010', 'CSE', 7.5, 0, ARRAY['Python','SQL','JavaScript']),
    ('dev.kate.it@placeguard.test',   'DEV011', 'IT',  9.0, 0, ARRAY['Python','SQL','React']),
    ('dev.leo.cse@placeguard.test',   'DEV012', 'CSE', 6.2, 2, ARRAY['Python']),
    ('dev.maya.it@placeguard.test',   'DEV013', 'IT',  8.3, 0, ARRAY['JavaScript','React','Linux']),
    ('dev.neil.cse@placeguard.test',  'DEV014', 'CSE', 7.0, 1, ARRAY['Python','JavaScript']),
    ('dev.olivia.ece@placeguard.test','DEV015', 'ECE', 5.5, 4, ARRAY['Linux']),
    ('dev.priya.cse@placeguard.test', 'DEV016', 'CSE', 8.7, 0, ARRAY['Python','JavaScript','React','SQL']),
    ('dev.quinn.it@placeguard.test',  'DEV017', 'IT',  7.6, 0, ARRAY['SQL','Python']),
    ('dev.raj.cse@placeguard.test',   'DEV018', 'CSE', 9.3, 0, ARRAY['JavaScript','React','Python','Linux']),
    ('dev.sara.it@placeguard.test',   'DEV019', 'IT',  6.9, 1, ARRAY['Python','SQL']),
    ('dev.tom.ece@placeguard.test',   'DEV020', 'ECE', 7.1, 0, ARRAY['Linux','Python'])
  )
  INSERT INTO public.students(profile_id, roll_number, branch, year, cgpa, backlogs, skills)
  SELECT p.id, i.roll, i.branch, 4::smallint, i.cgpa::numeric, i.backlogs::int, i.skills
  FROM inserts i
  JOIN public.profiles p ON p.email = i.email
  ON CONFLICT (profile_id) DO NOTHING;

  RAISE NOTICE 'Stage C: student records created/skipped.';

  -- ══════════════════════════════════════════════════════════════════════
  -- STAGE D: Create applications with round results
  --
  -- Helper function (inline): create application + rounds for a student
  -- eligibility rules per drive:
  --   SWE:    CGPA>=7, backlogs=0, branch IN(CSE,IT), skills has JS+Python
  --   DA:     CGPA>=6.5, backlogs<=1, branch IN(CSE,IT,ECE,Mathematics), skills has Python+SQL
  --   DevOps: CGPA>=6, backlogs<=2, branch IN(CSE,IT,ECE), skills has Linux
  --   BE:     CGPA>=7, backlogs=0, branch IN(CSE,IT), skills has Python+SQL
  --   FE:     CGPA>=6.5, backlogs<=1, branch IN(CSE,IT), skills has JS+React
  -- ══════════════════════════════════════════════════════════════════════

  -- ── MACRO: create eligible application + init rounds ─────────────────
  -- Args: drive_id, student email
  -- Returns: application_id in v_app_id

  -- ── SWE Drive Applications ────────────────────────────────────────────

  -- Alice (CGPA 8.9, CSE, JS+Python) → ELIGIBLE → SELECTED (passes all 4 rounds)
  SELECT s.id INTO v_sid FROM public.students s JOIN public.profiles p ON p.id=s.profile_id WHERE p.email='dev.alice.cse@placeguard.test';
  IF NOT EXISTS(SELECT 1 FROM public.applications WHERE drive_id=v_drive_swe AND student_id=v_sid) THEN
    INSERT INTO public.applications(drive_id,student_id,status) VALUES(v_drive_swe,v_sid,'SELECTED') RETURNING id INTO v_app_id;
    INSERT INTO public.eligibility_results(application_id,eligible,engine_version) VALUES(v_app_id,true,'2.0.0');
    FOR v_round_id IN SELECT dr.id FROM public.drive_rounds dr WHERE dr.drive_id=v_drive_swe ORDER BY dr.round_number LOOP
      INSERT INTO public.application_rounds(application_id,round_id,status,score,feedback,evaluated_at)
        SELECT v_app_id, v_round_id, 'PASSED',
               CASE dr.round_number WHEN 1 THEN 82 WHEN 2 THEN 4 WHEN 3 THEN NULL WHEN 4 THEN NULL END,
               CASE dr.round_number WHEN 1 THEN 'Strong aptitude' WHEN 2 THEN 'Excellent DSA' WHEN 3 THEN 'Very strong technical' WHEN 4 THEN 'Great culture fit' END,
               now() - interval '2 days'
        FROM public.drive_rounds dr WHERE dr.id=v_round_id ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Henry (CGPA 8.5, CSE, JS+React+Python) → ELIGIBLE → Round 3 pending
  SELECT s.id INTO v_sid FROM public.students s JOIN public.profiles p ON p.id=s.profile_id WHERE p.email='dev.henry.cse@placeguard.test';
  IF NOT EXISTS(SELECT 1 FROM public.applications WHERE drive_id=v_drive_swe AND student_id=v_sid) THEN
    INSERT INTO public.applications(drive_id,student_id,status) VALUES(v_drive_swe,v_sid,'ELIGIBLE') RETURNING id INTO v_app_id;
    INSERT INTO public.eligibility_results(application_id,eligible,engine_version) VALUES(v_app_id,true,'2.0.0');
    -- R1 PASSED, R2 PASSED, R3 PENDING, R4 LOCKED
    FOR v_round_id IN SELECT dr.id FROM public.drive_rounds dr WHERE dr.drive_id=v_drive_swe ORDER BY dr.round_number LOOP
      INSERT INTO public.application_rounds(application_id,round_id,status,score,evaluated_at)
        SELECT v_app_id, v_round_id,
               CASE dr.round_number WHEN 1 THEN 'PASSED' WHEN 2 THEN 'PASSED' WHEN 3 THEN 'PENDING' ELSE 'LOCKED' END::public.candidate_round_status,
               CASE dr.round_number WHEN 1 THEN 75 WHEN 2 THEN 3 ELSE NULL END,
               CASE WHEN dr.round_number <= 2 THEN now()-interval '1 day' ELSE NULL END
        FROM public.drive_rounds dr WHERE dr.id=v_round_id ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Jack (CGPA 7.5, CSE, Python+SQL+JS) → ELIGIBLE → REJECTED at Round 2 (DSA)
  SELECT s.id INTO v_sid FROM public.students s JOIN public.profiles p ON p.id=s.profile_id WHERE p.email='dev.jack.cse@placeguard.test';
  IF NOT EXISTS(SELECT 1 FROM public.applications WHERE drive_id=v_drive_swe AND student_id=v_sid) THEN
    INSERT INTO public.applications(drive_id,student_id,status) VALUES(v_drive_swe,v_sid,'REJECTED') RETURNING id INTO v_app_id;
    INSERT INTO public.eligibility_results(application_id,eligible,engine_version) VALUES(v_app_id,true,'2.0.0');
    FOR v_round_id IN SELECT dr.id FROM public.drive_rounds dr WHERE dr.drive_id=v_drive_swe ORDER BY dr.round_number LOOP
      INSERT INTO public.application_rounds(application_id,round_id,status,score,feedback,evaluated_at)
        SELECT v_app_id, v_round_id,
               CASE dr.round_number WHEN 1 THEN 'PASSED' WHEN 2 THEN 'FAILED' ELSE 'LOCKED' END::public.candidate_round_status,
               CASE dr.round_number WHEN 1 THEN 65 WHEN 2 THEN 1 ELSE NULL END,
               CASE dr.round_number WHEN 2 THEN 'Weak on trees and graphs' ELSE NULL END,
               CASE WHEN dr.round_number <= 2 THEN now()-interval '1 day' ELSE NULL END
        FROM public.drive_rounds dr WHERE dr.id=v_round_id ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Frank (CGPA 5.9, CSE) → INELIGIBLE for SWE (CGPA < 7)
  SELECT s.id INTO v_sid FROM public.students s JOIN public.profiles p ON p.id=s.profile_id WHERE p.email='dev.frank.cse@placeguard.test';
  IF NOT EXISTS(SELECT 1 FROM public.applications WHERE drive_id=v_drive_swe AND student_id=v_sid) THEN
    INSERT INTO public.applications(drive_id,student_id,status) VALUES(v_drive_swe,v_sid,'INELIGIBLE') RETURNING id INTO v_app_id;
    INSERT INTO public.eligibility_results(application_id,eligible,failed_rules,engine_version) VALUES(v_app_id,false,ARRAY['CGPA 5.9 is below required minimum 7.00.'],'2.0.0');
    -- All rounds locked
    FOR v_round_id IN SELECT dr.id FROM public.drive_rounds dr WHERE dr.drive_id=v_drive_swe ORDER BY dr.round_number LOOP
      INSERT INTO public.application_rounds(application_id,round_id,status) VALUES(v_app_id,v_round_id,'LOCKED') ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Raj (CGPA 9.3, CSE, full skills) → ELIGIBLE → Round 1 pending
  SELECT s.id INTO v_sid FROM public.students s JOIN public.profiles p ON p.id=s.profile_id WHERE p.email='dev.raj.cse@placeguard.test';
  IF NOT EXISTS(SELECT 1 FROM public.applications WHERE drive_id=v_drive_swe AND student_id=v_sid) THEN
    INSERT INTO public.applications(drive_id,student_id,status) VALUES(v_drive_swe,v_sid,'ELIGIBLE') RETURNING id INTO v_app_id;
    INSERT INTO public.eligibility_results(application_id,eligible,engine_version) VALUES(v_app_id,true,'2.0.0');
    FOR v_round_id IN SELECT dr.id FROM public.drive_rounds dr WHERE dr.drive_id=v_drive_swe ORDER BY dr.round_number LOOP
      INSERT INTO public.application_rounds(application_id,round_id,status)
        SELECT v_app_id, v_round_id, CASE dr.round_number WHEN 1 THEN 'PENDING' ELSE 'LOCKED' END::public.candidate_round_status
        FROM public.drive_rounds dr WHERE dr.id=v_round_id ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Priya (CGPA 8.7, CSE, Python+JS+React+SQL) → ELIGIBLE → SELECTED (all rounds passed)
  SELECT s.id INTO v_sid FROM public.students s JOIN public.profiles p ON p.id=s.profile_id WHERE p.email='dev.priya.cse@placeguard.test';
  IF NOT EXISTS(SELECT 1 FROM public.applications WHERE drive_id=v_drive_swe AND student_id=v_sid) THEN
    INSERT INTO public.applications(drive_id,student_id,status) VALUES(v_drive_swe,v_sid,'SELECTED') RETURNING id INTO v_app_id;
    INSERT INTO public.eligibility_results(application_id,eligible,engine_version) VALUES(v_app_id,true,'2.0.0');
    FOR v_round_id IN SELECT dr.id FROM public.drive_rounds dr WHERE dr.drive_id=v_drive_swe ORDER BY dr.round_number LOOP
      INSERT INTO public.application_rounds(application_id,round_id,status,score,evaluated_at)
        SELECT v_app_id, v_round_id, 'PASSED'::public.candidate_round_status,
               CASE dr.round_number WHEN 1 THEN 91 WHEN 2 THEN 5 ELSE NULL END,
               now()-interval '3 days'
        FROM public.drive_rounds dr WHERE dr.id=v_round_id ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Neil (CGPA 7.0, CSE, Python+JS, but no required skills [JS+Python] -- ACTUALLY eligible) → ELIGIBLE → R1 PENDING
  SELECT s.id INTO v_sid FROM public.students s JOIN public.profiles p ON p.id=s.profile_id WHERE p.email='dev.neil.cse@placeguard.test';
  IF NOT EXISTS(SELECT 1 FROM public.applications WHERE drive_id=v_drive_swe AND student_id=v_sid) THEN
    INSERT INTO public.applications(drive_id,student_id,status) VALUES(v_drive_swe,v_sid,'ELIGIBLE') RETURNING id INTO v_app_id;
    INSERT INTO public.eligibility_results(application_id,eligible,engine_version) VALUES(v_app_id,true,'2.0.0');
    FOR v_round_id IN SELECT dr.id FROM public.drive_rounds dr WHERE dr.drive_id=v_drive_swe ORDER BY dr.round_number LOOP
      INSERT INTO public.application_rounds(application_id,round_id,status)
        SELECT v_app_id, v_round_id, CASE dr.round_number WHEN 1 THEN 'PENDING' ELSE 'LOCKED' END::public.candidate_round_status
        FROM public.drive_rounds dr WHERE dr.id=v_round_id ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RAISE NOTICE 'Stage D SWE applications done.';

  -- ── Data Analyst Drive Applications ──────────────────────────────────
  -- Eligible: CGPA>=6.5, backlogs<=1, branch IN(CSE,IT,ECE), Python+SQL

  -- Eve (CGPA 8.0, IT, Python+SQL+JS) → SELECTED
  SELECT s.id INTO v_sid FROM public.students s JOIN public.profiles p ON p.id=s.profile_id WHERE p.email='dev.eve.it@placeguard.test';
  IF NOT EXISTS(SELECT 1 FROM public.applications WHERE drive_id=v_drive_da AND student_id=v_sid) THEN
    INSERT INTO public.applications(drive_id,student_id,status) VALUES(v_drive_da,v_sid,'SELECTED') RETURNING id INTO v_app_id;
    INSERT INTO public.eligibility_results(application_id,eligible,engine_version) VALUES(v_app_id,true,'2.0.0');
    FOR v_round_id IN SELECT dr.id FROM public.drive_rounds dr WHERE dr.drive_id=v_drive_da ORDER BY dr.round_number LOOP
      INSERT INTO public.application_rounds(application_id,round_id,status,score,evaluated_at)
        SELECT v_app_id, v_round_id, 'PASSED'::public.candidate_round_status,
               CASE dr.round_number WHEN 1 THEN 78 WHEN 2 THEN 4 ELSE NULL END, now()-interval '1 day'
        FROM public.drive_rounds dr WHERE dr.id=v_round_id ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Kate (CGPA 9.0, IT, Python+SQL+React) → ELIGIBLE → R2 pending
  SELECT s.id INTO v_sid FROM public.students s JOIN public.profiles p ON p.id=s.profile_id WHERE p.email='dev.kate.it@placeguard.test';
  IF NOT EXISTS(SELECT 1 FROM public.applications WHERE drive_id=v_drive_da AND student_id=v_sid) THEN
    INSERT INTO public.applications(drive_id,student_id,status) VALUES(v_drive_da,v_sid,'ELIGIBLE') RETURNING id INTO v_app_id;
    INSERT INTO public.eligibility_results(application_id,eligible,engine_version) VALUES(v_app_id,true,'2.0.0');
    FOR v_round_id IN SELECT dr.id FROM public.drive_rounds dr WHERE dr.drive_id=v_drive_da ORDER BY dr.round_number LOOP
      INSERT INTO public.application_rounds(application_id,round_id,status,score,evaluated_at)
        SELECT v_app_id, v_round_id,
               CASE dr.round_number WHEN 1 THEN 'PASSED' WHEN 2 THEN 'PENDING' ELSE 'LOCKED' END::public.candidate_round_status,
               CASE dr.round_number WHEN 1 THEN 88 ELSE NULL END,
               CASE WHEN dr.round_number=1 THEN now()-interval '1 day' ELSE NULL END
        FROM public.drive_rounds dr WHERE dr.id=v_round_id ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Grace (CGPA 7.8, IT, SQL+Python+Linux) → ELIGIBLE → REJECTED at R2
  SELECT s.id INTO v_sid FROM public.students s JOIN public.profiles p ON p.id=s.profile_id WHERE p.email='dev.grace.it@placeguard.test';
  IF NOT EXISTS(SELECT 1 FROM public.applications WHERE drive_id=v_drive_da AND student_id=v_sid) THEN
    INSERT INTO public.applications(drive_id,student_id,status) VALUES(v_drive_da,v_sid,'REJECTED') RETURNING id INTO v_app_id;
    INSERT INTO public.eligibility_results(application_id,eligible,engine_version) VALUES(v_app_id,true,'2.0.0');
    FOR v_round_id IN SELECT dr.id FROM public.drive_rounds dr WHERE dr.drive_id=v_drive_da ORDER BY dr.round_number LOOP
      INSERT INTO public.application_rounds(application_id,round_id,status,score,feedback,evaluated_at)
        SELECT v_app_id, v_round_id,
               CASE dr.round_number WHEN 1 THEN 'PASSED' WHEN 2 THEN 'FAILED' ELSE 'LOCKED' END::public.candidate_round_status,
               CASE dr.round_number WHEN 1 THEN 71 WHEN 2 THEN 1 ELSE NULL END,
               CASE dr.round_number WHEN 2 THEN 'pandas and SQL window functions need improvement' ELSE NULL END,
               CASE WHEN dr.round_number<=2 THEN now()-interval '1 day' ELSE NULL END
        FROM public.drive_rounds dr WHERE dr.id=v_round_id ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Quinn (CGPA 7.6, IT, SQL+Python) → ELIGIBLE → R1 pending
  SELECT s.id INTO v_sid FROM public.students s JOIN public.profiles p ON p.id=s.profile_id WHERE p.email='dev.quinn.it@placeguard.test';
  IF NOT EXISTS(SELECT 1 FROM public.applications WHERE drive_id=v_drive_da AND student_id=v_sid) THEN
    INSERT INTO public.applications(drive_id,student_id,status) VALUES(v_drive_da,v_sid,'ELIGIBLE') RETURNING id INTO v_app_id;
    INSERT INTO public.eligibility_results(application_id,eligible,engine_version) VALUES(v_app_id,true,'2.0.0');
    FOR v_round_id IN SELECT dr.id FROM public.drive_rounds dr WHERE dr.drive_id=v_drive_da ORDER BY dr.round_number LOOP
      INSERT INTO public.application_rounds(application_id,round_id,status)
        SELECT v_app_id, v_round_id, CASE dr.round_number WHEN 1 THEN 'PENDING' ELSE 'LOCKED' END::public.candidate_round_status
        FROM public.drive_rounds dr WHERE dr.id=v_round_id ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Olivia (CGPA 5.5, ECE, 4 backlogs) → INELIGIBLE (CGPA + backlogs)
  SELECT s.id INTO v_sid FROM public.students s JOIN public.profiles p ON p.id=s.profile_id WHERE p.email='dev.olivia.ece@placeguard.test';
  IF NOT EXISTS(SELECT 1 FROM public.applications WHERE drive_id=v_drive_da AND student_id=v_sid) THEN
    INSERT INTO public.applications(drive_id,student_id,status) VALUES(v_drive_da,v_sid,'INELIGIBLE') RETURNING id INTO v_app_id;
    INSERT INTO public.eligibility_results(application_id,eligible,failed_rules,engine_version) VALUES(v_app_id,false,ARRAY['CGPA 5.5 is below required minimum 6.50.','Backlog limit exceeded.'],'2.0.0');
    FOR v_round_id IN SELECT dr.id FROM public.drive_rounds dr WHERE dr.drive_id=v_drive_da ORDER BY dr.round_number LOOP
      INSERT INTO public.application_rounds(application_id,round_id,status) VALUES(v_app_id,v_round_id,'LOCKED') ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RAISE NOTICE 'Stage D DA applications done.';

  -- ── Cloud/DevOps Drive Applications ────────────────────────────────
  -- Eligible: CGPA>=6, backlogs<=2, branch IN(CSE,IT,ECE), Linux skill

  -- Tom (CGPA 7.1, ECE, Linux+Python) → SELECTED (5 rounds)
  SELECT s.id INTO v_sid FROM public.students s JOIN public.profiles p ON p.id=s.profile_id WHERE p.email='dev.tom.ece@placeguard.test';
  IF NOT EXISTS(SELECT 1 FROM public.applications WHERE drive_id=v_drive_devops AND student_id=v_sid) THEN
    INSERT INTO public.applications(drive_id,student_id,status) VALUES(v_drive_devops,v_sid,'SELECTED') RETURNING id INTO v_app_id;
    INSERT INTO public.eligibility_results(application_id,eligible,engine_version) VALUES(v_app_id,true,'2.0.0');
    FOR v_round_id IN SELECT dr.id FROM public.drive_rounds dr WHERE dr.drive_id=v_drive_devops ORDER BY dr.round_number LOOP
      INSERT INTO public.application_rounds(application_id,round_id,status,score,evaluated_at)
        SELECT v_app_id, v_round_id, 'PASSED'::public.candidate_round_status,
               CASE dr.round_number WHEN 1 THEN 70 WHEN 2 THEN 4 WHEN 3 THEN 72 ELSE NULL END, now()-interval '2 days'
        FROM public.drive_rounds dr WHERE dr.id=v_round_id ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Carol (CGPA 9.1, CSE, JS+React+Linux) → ELIGIBLE → R3 pending
  SELECT s.id INTO v_sid FROM public.students s JOIN public.profiles p ON p.id=s.profile_id WHERE p.email='dev.carol.cse@placeguard.test';
  IF NOT EXISTS(SELECT 1 FROM public.applications WHERE drive_id=v_drive_devops AND student_id=v_sid) THEN
    INSERT INTO public.applications(drive_id,student_id,status) VALUES(v_drive_devops,v_sid,'ELIGIBLE') RETURNING id INTO v_app_id;
    INSERT INTO public.eligibility_results(application_id,eligible,engine_version) VALUES(v_app_id,true,'2.0.0');
    FOR v_round_id IN SELECT dr.id FROM public.drive_rounds dr WHERE dr.drive_id=v_drive_devops ORDER BY dr.round_number LOOP
      INSERT INTO public.application_rounds(application_id,round_id,status,score,evaluated_at)
        SELECT v_app_id, v_round_id,
               CASE dr.round_number WHEN 1 THEN 'PASSED' WHEN 2 THEN 'PASSED' WHEN 3 THEN 'PENDING' ELSE 'LOCKED' END::public.candidate_round_status,
               CASE dr.round_number WHEN 1 THEN 81 WHEN 2 THEN 5 ELSE NULL END,
               CASE WHEN dr.round_number<=2 THEN now()-interval '1 day' ELSE NULL END
        FROM public.drive_rounds dr WHERE dr.id=v_round_id ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Iris (CGPA 6.5, ECE, Linux+Python, 1 backlog) → ELIGIBLE → REJECTED at R2
  SELECT s.id INTO v_sid FROM public.students s JOIN public.profiles p ON p.id=s.profile_id WHERE p.email='dev.iris.ece@placeguard.test';
  IF NOT EXISTS(SELECT 1 FROM public.applications WHERE drive_id=v_drive_devops AND student_id=v_sid) THEN
    INSERT INTO public.applications(drive_id,student_id,status) VALUES(v_drive_devops,v_sid,'REJECTED') RETURNING id INTO v_app_id;
    INSERT INTO public.eligibility_results(application_id,eligible,engine_version) VALUES(v_app_id,true,'2.0.0');
    FOR v_round_id IN SELECT dr.id FROM public.drive_rounds dr WHERE dr.drive_id=v_drive_devops ORDER BY dr.round_number LOOP
      INSERT INTO public.application_rounds(application_id,round_id,status,score,feedback,evaluated_at)
        SELECT v_app_id, v_round_id,
               CASE dr.round_number WHEN 1 THEN 'PASSED' WHEN 2 THEN 'FAILED' ELSE 'LOCKED' END::public.candidate_round_status,
               CASE dr.round_number WHEN 1 THEN 62 WHEN 2 THEN 1 ELSE NULL END,
               CASE dr.round_number WHEN 2 THEN 'Networking fundamentals unclear' ELSE NULL END,
               CASE WHEN dr.round_number<=2 THEN now()-interval '1 day' ELSE NULL END
        FROM public.drive_rounds dr WHERE dr.id=v_round_id ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- David (CGPA 6.8, ECE, Linux, 2 backlogs) → ELIGIBLE → R1 pending
  SELECT s.id INTO v_sid FROM public.students s JOIN public.profiles p ON p.id=s.profile_id WHERE p.email='dev.david.ece@placeguard.test';
  IF NOT EXISTS(SELECT 1 FROM public.applications WHERE drive_id=v_drive_devops AND student_id=v_sid) THEN
    INSERT INTO public.applications(drive_id,student_id,status) VALUES(v_drive_devops,v_sid,'ELIGIBLE') RETURNING id INTO v_app_id;
    INSERT INTO public.eligibility_results(application_id,eligible,engine_version) VALUES(v_app_id,true,'2.0.0');
    FOR v_round_id IN SELECT dr.id FROM public.drive_rounds dr WHERE dr.drive_id=v_drive_devops ORDER BY dr.round_number LOOP
      INSERT INTO public.application_rounds(application_id,round_id,status)
        SELECT v_app_id, v_round_id, CASE dr.round_number WHEN 1 THEN 'PENDING' ELSE 'LOCKED' END::public.candidate_round_status
        FROM public.drive_rounds dr WHERE dr.id=v_round_id ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RAISE NOTICE 'Stage D DevOps applications done.';

  -- ── Backend Developer Drive Applications ─────────────────────────────
  -- Eligible: CGPA>=7, backlogs=0, branch IN(CSE,IT), Python+SQL

  -- Raj (CGPA 9.3, CSE) → SELECTED
  SELECT s.id INTO v_sid FROM public.students s JOIN public.profiles p ON p.id=s.profile_id WHERE p.email='dev.raj.cse@placeguard.test';
  IF NOT EXISTS(SELECT 1 FROM public.applications WHERE drive_id=v_drive_be AND student_id=v_sid) THEN
    INSERT INTO public.applications(drive_id,student_id,status) VALUES(v_drive_be,v_sid,'SELECTED') RETURNING id INTO v_app_id;
    INSERT INTO public.eligibility_results(application_id,eligible,engine_version) VALUES(v_app_id,true,'2.0.0');
    FOR v_round_id IN SELECT dr.id FROM public.drive_rounds dr WHERE dr.drive_id=v_drive_be ORDER BY dr.round_number LOOP
      INSERT INTO public.application_rounds(application_id,round_id,status,score,evaluated_at)
        SELECT v_app_id, v_round_id, 'PASSED'::public.candidate_round_status,
               CASE dr.round_number WHEN 1 THEN 5 WHEN 2 THEN 5 ELSE NULL END, now()-interval '2 days'
        FROM public.drive_rounds dr WHERE dr.id=v_round_id ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Jack (CGPA 7.5, CSE, Python+SQL+JS) → ELIGIBLE → R2 pending
  SELECT s.id INTO v_sid FROM public.students s JOIN public.profiles p ON p.id=s.profile_id WHERE p.email='dev.jack.cse@placeguard.test';
  IF NOT EXISTS(SELECT 1 FROM public.applications WHERE drive_id=v_drive_be AND student_id=v_sid) THEN
    INSERT INTO public.applications(drive_id,student_id,status) VALUES(v_drive_be,v_sid,'ELIGIBLE') RETURNING id INTO v_app_id;
    INSERT INTO public.eligibility_results(application_id,eligible,engine_version) VALUES(v_app_id,true,'2.0.0');
    FOR v_round_id IN SELECT dr.id FROM public.drive_rounds dr WHERE dr.drive_id=v_drive_be ORDER BY dr.round_number LOOP
      INSERT INTO public.application_rounds(application_id,round_id,status,score,evaluated_at)
        SELECT v_app_id, v_round_id,
               CASE dr.round_number WHEN 1 THEN 'PASSED' WHEN 2 THEN 'PENDING' ELSE 'LOCKED' END::public.candidate_round_status,
               CASE dr.round_number WHEN 1 THEN 3 ELSE NULL END,
               CASE WHEN dr.round_number=1 THEN now()-interval '1 day' ELSE NULL END
        FROM public.drive_rounds dr WHERE dr.id=v_round_id ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Eve (CGPA 8.0, IT, Python+SQL+JS) → ELIGIBLE → REJECTED R1
  SELECT s.id INTO v_sid FROM public.students s JOIN public.profiles p ON p.id=s.profile_id WHERE p.email='dev.eve.it@placeguard.test';
  IF NOT EXISTS(SELECT 1 FROM public.applications WHERE drive_id=v_drive_be AND student_id=v_sid) THEN
    INSERT INTO public.applications(drive_id,student_id,status) VALUES(v_drive_be,v_sid,'REJECTED') RETURNING id INTO v_app_id;
    INSERT INTO public.eligibility_results(application_id,eligible,engine_version) VALUES(v_app_id,true,'2.0.0');
    FOR v_round_id IN SELECT dr.id FROM public.drive_rounds dr WHERE dr.drive_id=v_drive_be ORDER BY dr.round_number LOOP
      INSERT INTO public.application_rounds(application_id,round_id,status,score,feedback,evaluated_at)
        SELECT v_app_id, v_round_id,
               CASE dr.round_number WHEN 1 THEN 'FAILED' ELSE 'LOCKED' END::public.candidate_round_status,
               CASE dr.round_number WHEN 1 THEN 1 ELSE NULL END,
               CASE dr.round_number WHEN 1 THEN 'Could not solve medium-level OOP problem' ELSE NULL END,
               CASE WHEN dr.round_number=1 THEN now()-interval '1 day' ELSE NULL END
        FROM public.drive_rounds dr WHERE dr.id=v_round_id ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Quinn (CGPA 7.6, IT, SQL+Python) → ELIGIBLE → R1 pending
  SELECT s.id INTO v_sid FROM public.students s JOIN public.profiles p ON p.id=s.profile_id WHERE p.email='dev.quinn.it@placeguard.test';
  IF NOT EXISTS(SELECT 1 FROM public.applications WHERE drive_id=v_drive_be AND student_id=v_sid) THEN
    INSERT INTO public.applications(drive_id,student_id,status) VALUES(v_drive_be,v_sid,'ELIGIBLE') RETURNING id INTO v_app_id;
    INSERT INTO public.eligibility_results(application_id,eligible,engine_version) VALUES(v_app_id,true,'2.0.0');
    FOR v_round_id IN SELECT dr.id FROM public.drive_rounds dr WHERE dr.drive_id=v_drive_be ORDER BY dr.round_number LOOP
      INSERT INTO public.application_rounds(application_id,round_id,status)
        SELECT v_app_id, v_round_id, CASE dr.round_number WHEN 1 THEN 'PENDING' ELSE 'LOCKED' END::public.candidate_round_status
        FROM public.drive_rounds dr WHERE dr.id=v_round_id ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Frank (CGPA 5.9, CSE) → INELIGIBLE BE (CGPA < 7 + backlogs > 0)
  SELECT s.id INTO v_sid FROM public.students s JOIN public.profiles p ON p.id=s.profile_id WHERE p.email='dev.frank.cse@placeguard.test';
  IF NOT EXISTS(SELECT 1 FROM public.applications WHERE drive_id=v_drive_be AND student_id=v_sid) THEN
    INSERT INTO public.applications(drive_id,student_id,status) VALUES(v_drive_be,v_sid,'INELIGIBLE') RETURNING id INTO v_app_id;
    INSERT INTO public.eligibility_results(application_id,eligible,failed_rules,engine_version) VALUES(v_app_id,false,ARRAY['CGPA 5.9 is below required minimum 7.00.','Backlog limit exceeded.'],'2.0.0');
    FOR v_round_id IN SELECT dr.id FROM public.drive_rounds dr WHERE dr.drive_id=v_drive_be ORDER BY dr.round_number LOOP
      INSERT INTO public.application_rounds(application_id,round_id,status) VALUES(v_app_id,v_round_id,'LOCKED') ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RAISE NOTICE 'Stage D BE applications done.';

  -- ── Frontend Developer Drive Applications ─────────────────────────────
  -- Eligible: CGPA>=6.5, backlogs<=1, branch IN(CSE,IT), JS+React

  -- Maya (CGPA 8.3, IT, JS+React+Linux) → SELECTED
  SELECT s.id INTO v_sid FROM public.students s JOIN public.profiles p ON p.id=s.profile_id WHERE p.email='dev.maya.it@placeguard.test';
  IF NOT EXISTS(SELECT 1 FROM public.applications WHERE drive_id=v_drive_fe AND student_id=v_sid) THEN
    INSERT INTO public.applications(drive_id,student_id,status) VALUES(v_drive_fe,v_sid,'SELECTED') RETURNING id INTO v_app_id;
    INSERT INTO public.eligibility_results(application_id,eligible,engine_version) VALUES(v_app_id,true,'2.0.0');
    FOR v_round_id IN SELECT dr.id FROM public.drive_rounds dr WHERE dr.drive_id=v_drive_fe ORDER BY dr.round_number LOOP
      INSERT INTO public.application_rounds(application_id,round_id,status,score,evaluated_at)
        SELECT v_app_id, v_round_id, 'PASSED'::public.candidate_round_status,
               CASE dr.round_number WHEN 1 THEN 85 WHEN 2 THEN 4 WHEN 3 THEN 5 ELSE NULL END, now()-interval '3 days'
        FROM public.drive_rounds dr WHERE dr.id=v_round_id ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Carol (CGPA 9.1, CSE, JS+React+Linux) → SELECTED
  SELECT s.id INTO v_sid FROM public.students s JOIN public.profiles p ON p.id=s.profile_id WHERE p.email='dev.carol.cse@placeguard.test';
  IF NOT EXISTS(SELECT 1 FROM public.applications WHERE drive_id=v_drive_fe AND student_id=v_sid) THEN
    INSERT INTO public.applications(drive_id,student_id,status) VALUES(v_drive_fe,v_sid,'SELECTED') RETURNING id INTO v_app_id;
    INSERT INTO public.eligibility_results(application_id,eligible,engine_version) VALUES(v_app_id,true,'2.0.0');
    FOR v_round_id IN SELECT dr.id FROM public.drive_rounds dr WHERE dr.drive_id=v_drive_fe ORDER BY dr.round_number LOOP
      INSERT INTO public.application_rounds(application_id,round_id,status,score,evaluated_at)
        SELECT v_app_id, v_round_id, 'PASSED'::public.candidate_round_status,
               CASE dr.round_number WHEN 1 THEN 93 WHEN 2 THEN 5 WHEN 3 THEN 5 ELSE NULL END, now()-interval '2 days'
        FROM public.drive_rounds dr WHERE dr.id=v_round_id ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Henry (CGPA 8.5, CSE, JS+React+Python) → R4 pending (Technical Interview)
  SELECT s.id INTO v_sid FROM public.students s JOIN public.profiles p ON p.id=s.profile_id WHERE p.email='dev.henry.cse@placeguard.test';
  IF NOT EXISTS(SELECT 1 FROM public.applications WHERE drive_id=v_drive_fe AND student_id=v_sid) THEN
    INSERT INTO public.applications(drive_id,student_id,status) VALUES(v_drive_fe,v_sid,'ELIGIBLE') RETURNING id INTO v_app_id;
    INSERT INTO public.eligibility_results(application_id,eligible,engine_version) VALUES(v_app_id,true,'2.0.0');
    FOR v_round_id IN SELECT dr.id FROM public.drive_rounds dr WHERE dr.drive_id=v_drive_fe ORDER BY dr.round_number LOOP
      INSERT INTO public.application_rounds(application_id,round_id,status,score,evaluated_at)
        SELECT v_app_id, v_round_id,
               CASE dr.round_number WHEN 1 THEN 'PASSED' WHEN 2 THEN 'PASSED' WHEN 3 THEN 'PASSED' WHEN 4 THEN 'PENDING' ELSE 'LOCKED' END::public.candidate_round_status,
               CASE dr.round_number WHEN 1 THEN 79 WHEN 2 THEN 4 WHEN 3 THEN 4 ELSE NULL END,
               CASE WHEN dr.round_number <= 3 THEN now()-interval '1 day' ELSE NULL END
        FROM public.drive_rounds dr WHERE dr.id=v_round_id ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Neil (CGPA 7.0, CSE, Python+JS but no React) → INELIGIBLE FE (missing React skill)
  SELECT s.id INTO v_sid FROM public.students s JOIN public.profiles p ON p.id=s.profile_id WHERE p.email='dev.neil.cse@placeguard.test';
  IF NOT EXISTS(SELECT 1 FROM public.applications WHERE drive_id=v_drive_fe AND student_id=v_sid) THEN
    INSERT INTO public.applications(drive_id,student_id,status) VALUES(v_drive_fe,v_sid,'INELIGIBLE') RETURNING id INTO v_app_id;
    INSERT INTO public.eligibility_results(application_id,eligible,failed_rules,engine_version) VALUES(v_app_id,false,ARRAY['Required skills are missing.'],'2.0.0');
    FOR v_round_id IN SELECT dr.id FROM public.drive_rounds dr WHERE dr.drive_id=v_drive_fe ORDER BY dr.round_number LOOP
      INSERT INTO public.application_rounds(application_id,round_id,status) VALUES(v_app_id,v_round_id,'LOCKED') ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Alice (CGPA 8.9, CSE, Python+JS+React) → REJECTED at R3 (React Coding)
  SELECT s.id INTO v_sid FROM public.students s JOIN public.profiles p ON p.id=s.profile_id WHERE p.email='dev.alice.cse@placeguard.test';
  IF NOT EXISTS(SELECT 1 FROM public.applications WHERE drive_id=v_drive_fe AND student_id=v_sid) THEN
    INSERT INTO public.applications(drive_id,student_id,status) VALUES(v_drive_fe,v_sid,'REJECTED') RETURNING id INTO v_app_id;
    INSERT INTO public.eligibility_results(application_id,eligible,engine_version) VALUES(v_app_id,true,'2.0.0');
    FOR v_round_id IN SELECT dr.id FROM public.drive_rounds dr WHERE dr.drive_id=v_drive_fe ORDER BY dr.round_number LOOP
      INSERT INTO public.application_rounds(application_id,round_id,status,score,feedback,evaluated_at)
        SELECT v_app_id, v_round_id,
               CASE dr.round_number WHEN 1 THEN 'PASSED' WHEN 2 THEN 'PASSED' WHEN 3 THEN 'FAILED' ELSE 'LOCKED' END::public.candidate_round_status,
               CASE dr.round_number WHEN 1 THEN 77 WHEN 2 THEN 3 WHEN 3 THEN 2 ELSE NULL END,
               CASE dr.round_number WHEN 3 THEN 'React component structure was poor; state management errors' ELSE NULL END,
               CASE WHEN dr.round_number <= 3 THEN now()-interval '1 day' ELSE NULL END
        FROM public.drive_rounds dr WHERE dr.id=v_round_id ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RAISE NOTICE 'Stage D FE applications done.';
  RAISE NOTICE 'Stage C+D complete. Check application counts with SELECT count(*) FROM public.applications;';
END $$;