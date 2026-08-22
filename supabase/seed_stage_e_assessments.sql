-- =============================================================================
-- PlaceGuard Dev Seed: Assessment Questions + Active Assessments
-- Stage E: Assessment data for all 5 dev pipelines
-- Idempotent: safe to run multiple times
-- =============================================================================

do $$ 
declare
  v_company_id   uuid;
  v_created_by   uuid;
  -- drive_round ids for Round 1 of each dev pipeline
  v_swe_r1   uuid;
  v_da_r1    uuid;
  v_cloud_r1 uuid;
  v_be_r1    uuid;
  v_fe_r1    uuid;
  -- assessment ids
  v_swe_asmt   uuid;
  v_da_asmt    uuid;
  v_cloud_asmt uuid;
  v_be_asmt    uuid;
  v_fe_asmt    uuid;
  -- temp question id
  v_q uuid;
begin

  -- ── Get dev company ────────────────────────────────────────────────────────
  select id into v_company_id
  from public.companies
  where company_name ilike '[DEV]%'
  limit 1;

  if v_company_id is null then
    raise notice '[SEED-E] No [DEV] company found — skipping.';
    return;
  end if;

  -- ── Get a company profile for created_by ──────────────────────────────────
  select profile_id into v_created_by
  from public.companies
  where id = v_company_id;

  raise notice '[SEED-E] Using company: %, created_by: %', v_company_id, v_created_by;

  -- ── Get Round 1 drive_round IDs ───────────────────────────────────────────
  select dr.id into v_swe_r1
  from public.drive_rounds dr
  join public.drives d on d.id = dr.drive_id
  where d.company_id = v_company_id
    and d.title ilike '%Software Engineer%'
    and dr.round_number = 1
  limit 1;

  select dr.id into v_da_r1
  from public.drive_rounds dr
  join public.drives d on d.id = dr.drive_id
  where d.company_id = v_company_id
    and d.title ilike '%Data Analyst%'
    and dr.round_number = 1
  limit 1;

  select dr.id into v_cloud_r1
  from public.drive_rounds dr
  join public.drives d on d.id = dr.drive_id
  where d.company_id = v_company_id
    and (d.title ilike '%Cloud%' or d.title ilike '%DevOps%')
    and dr.round_number = 1
  limit 1;

  select dr.id into v_be_r1
  from public.drive_rounds dr
  join public.drives d on d.id = dr.drive_id
  where d.company_id = v_company_id
    and d.title ilike '%Backend%'
    and dr.round_number = 1
  limit 1;

  select dr.id into v_fe_r1
  from public.drive_rounds dr
  join public.drives d on d.id = dr.drive_id
  where d.company_id = v_company_id
    and d.title ilike '%Frontend%'
    and dr.round_number = 1
  limit 1;

  raise notice '[SEED-E] Round 1 IDs: SWE=%, DA=%, Cloud=%, BE=%, FE=%',
    v_swe_r1, v_da_r1, v_cloud_r1, v_be_r1, v_fe_r1;

  -- ══════════════════════════════════════════════════════════════════════════
  -- SWE Aptitude Assessment
  -- ══════════════════════════════════════════════════════════════════════════
  if v_swe_r1 is not null then
    insert into public.assessments (drive_round_id, title, instructions, duration_minutes, passing_score, negative_marking, negative_fraction, shuffle_questions, shuffle_options, allow_review, is_active, created_by)
    values (v_swe_r1, '[DEV] Software Engineer — Aptitude Test', 
      'This test assesses your quantitative, logical and basic CS aptitude. You have 45 minutes. Negative marking applies (0.25 marks deducted for wrong answers). Read each question carefully before answering.',
      45, 14, true, 0.25, true, true, true, true, v_created_by)
    on conflict (drive_round_id) do update set is_active = true, title = excluded.title
    returning id into v_swe_asmt;

    if v_swe_asmt is null then
      select id into v_swe_asmt from public.assessments where drive_round_id = v_swe_r1;
    end if;

    raise notice '[SEED-E] SWE assessment: %', v_swe_asmt;

    -- Question 1: Arithmetic
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'A train travelling at 60 km/h covers a distance in 5 hours. How long will it take to cover the same distance at 75 km/h?',
        'MCQ_SINGLE', 'Quantitative', 'EASY', 2,
        'Distance = 60 × 5 = 300 km. At 75 km/h: time = 300 ÷ 75 = 4 hours.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('3 hours', false, 0), ('4 hours', true, 1), ('4.5 hours', false, 2), ('5 hours', false, 3)) t(opt, correct, ord)
      returning question_id
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_swe_asmt, q.id, 0 from q
    on conflict (assessment_id, question_id) do nothing;

    -- Question 2: Logical
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'What comes next in the series: 2, 6, 12, 20, 30, ?',
        'MCQ_SINGLE', 'Logical Reasoning', 'EASY', 2,
        'Pattern: n(n+1). 1×2=2, 2×3=6, 3×4=12, 4×5=20, 5×6=30, 6×7=42.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('36', false, 0), ('40', false, 1), ('42', true, 2), ('44', false, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_swe_asmt, q.id, 1 from q
    on conflict (assessment_id, question_id) do nothing;

    -- Question 3: Time & Work
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'A can complete a work in 15 days, B in 20 days. Working together, how many days will they take?',
        'MCQ_SINGLE', 'Quantitative', 'MEDIUM', 2,
        'A''s rate = 1/15, B''s rate = 1/20. Combined = 1/15 + 1/20 = 4/60 + 3/60 = 7/60. Days = 60/7 ≈ 8.57 ≈ 8⁴⁄₇.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('7 days', false, 0), ('8 days', false, 1), ('8 4/7 days', true, 2), ('9 days', false, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_swe_asmt, q.id, 2 from q
    on conflict (assessment_id, question_id) do nothing;

    -- Question 4: CS Basics
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'What is the time complexity of binary search on a sorted array of n elements?',
        'MCQ_SINGLE', 'Computer Science', 'EASY', 2,
        'Binary search halves the search space each iteration, giving O(log n) complexity.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('O(1)', false, 0), ('O(log n)', true, 1), ('O(n)', false, 2), ('O(n²)', false, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_swe_asmt, q.id, 3 from q
    on conflict (assessment_id, question_id) do nothing;

    -- Question 5: Percentages
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'A product''s price is increased by 25% and then decreased by 20%. What is the net change?',
        'MCQ_SINGLE', 'Quantitative', 'MEDIUM', 2,
        'If original = 100: after +25% = 125, after -20% of 125 = 125 × 0.8 = 100. Net change = 0%.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('+5%', false, 0), ('0% (no change)', true, 1), ('-5%', false, 2), ('+10%', false, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_swe_asmt, q.id, 4 from q
    on conflict (assessment_id, question_id) do nothing;

    -- Question 6: Data Structures
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'Which data structure follows LIFO (Last In First Out) order?',
        'MCQ_SINGLE', 'Computer Science', 'EASY', 2,
        'Stack follows LIFO — the last element pushed is the first to be popped.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('Queue', false, 0), ('Stack', true, 1), ('Array', false, 2), ('Linked List', false, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_swe_asmt, q.id, 5 from q
    on conflict (assessment_id, question_id) do nothing;

    -- Question 7: Profit/Loss
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'An item is sold for ₹1200 at a profit of 20%. What was the cost price?',
        'MCQ_SINGLE', 'Quantitative', 'EASY', 2,
        'SP = CP × (1 + profit%). 1200 = CP × 1.2. CP = 1200/1.2 = 1000.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('₹900', false, 0), ('₹950', false, 1), ('₹1000', true, 2), ('₹1100', false, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_swe_asmt, q.id, 6 from q
    on conflict (assessment_id, question_id) do nothing;

    -- Question 8: OOP
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'Which OOP principle allows a class to have multiple forms or implementations?',
        'MCQ_SINGLE', 'Computer Science', 'EASY', 2,
        'Polymorphism allows objects of different classes to be treated as objects of a common super class, enabling multiple forms.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('Encapsulation', false, 0), ('Abstraction', false, 1), ('Inheritance', false, 2), ('Polymorphism', true, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_swe_asmt, q.id, 7 from q
    on conflict (assessment_id, question_id) do nothing;

    -- Question 9: Verbal
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'Choose the word most similar in meaning to "Meticulous": ',
        'MCQ_SINGLE', 'Verbal Ability', 'MEDIUM', 2,
        'Meticulous means showing great attention to detail. Precise has a similar meaning — careful and exact.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('Careless', false, 0), ('Precise', true, 1), ('Hasty', false, 2), ('Vague', false, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_swe_asmt, q.id, 8 from q
    on conflict (assessment_id, question_id) do nothing;

    -- Question 10: Probability
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'A bag contains 4 red and 6 blue balls. Two balls are drawn at random. What is the probability that both are red?',
        'MCQ_SINGLE', 'Quantitative', 'HARD', 3,
        'P(both red) = C(4,2)/C(10,2) = 6/45 = 2/15.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('1/5', false, 0), ('2/15', true, 1), ('4/15', false, 2), ('1/3', false, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_swe_asmt, q.id, 9 from q
    on conflict (assessment_id, question_id) do nothing;

  end if; -- v_swe_r1

  -- ══════════════════════════════════════════════════════════════════════════
  -- Frontend Developer — Aptitude Assessment (10 questions, HTML/CSS/JS focus)
  -- ══════════════════════════════════════════════════════════════════════════
  if v_fe_r1 is not null then
    insert into public.assessments (drive_round_id, title, instructions, duration_minutes, passing_score, negative_marking, negative_fraction, shuffle_questions, shuffle_options, allow_review, is_active, created_by)
    values (v_fe_r1, '[DEV] Frontend Developer — Aptitude & Web Basics',
      'This test covers quantitative aptitude, HTML/CSS fundamentals and JavaScript basics. Duration: 40 minutes. No negative marking.',
      40, 12, false, 0.25, true, true, true, true, v_created_by)
    on conflict (drive_round_id) do update set is_active = true
    returning id into v_fe_asmt;

    if v_fe_asmt is null then
      select id into v_fe_asmt from public.assessments where drive_round_id = v_fe_r1;
    end if;

    -- Q1: HTML
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'Which HTML tag is used to create a hyperlink?',
        'MCQ_SINGLE', 'HTML', 'EASY', 2, 'The <a> (anchor) tag is used to create hyperlinks in HTML.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('<link>', false, 0), ('<a>', true, 1), ('<href>', false, 2), ('<url>', false, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_fe_asmt, q.id, 0 from q
    on conflict (assessment_id, question_id) do nothing;

    -- Q2: CSS Box Model
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'In the CSS box model, which property creates space OUTSIDE the border?',
        'MCQ_SINGLE', 'CSS', 'EASY', 2, 'Margin creates space outside the border. Padding creates space inside the border.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('Padding', false, 0), ('Border', false, 1), ('Margin', true, 2), ('Outline', false, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_fe_asmt, q.id, 1 from q
    on conflict (assessment_id, question_id) do nothing;

    -- Q3: JS typeof
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'What does typeof null return in JavaScript?',
        'MCQ_SINGLE', 'JavaScript', 'MEDIUM', 2, 'typeof null returns "object" — a long-standing bug in JavaScript that was kept for backwards compatibility.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('"null"', false, 0), ('"undefined"', false, 1), ('"object"', true, 2), ('"boolean"', false, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_fe_asmt, q.id, 2 from q
    on conflict (assessment_id, question_id) do nothing;

    -- Q4: Flexbox
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'Which CSS property aligns flex items along the main axis?',
        'MCQ_SINGLE', 'CSS', 'EASY', 2, 'justify-content aligns flex items along the main axis. align-items aligns them along the cross axis.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('align-items', false, 0), ('justify-content', true, 1), ('align-content', false, 2), ('flex-direction', false, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_fe_asmt, q.id, 3 from q
    on conflict (assessment_id, question_id) do nothing;

    -- Q5: JS Promises
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'What is the output of: console.log(typeof Promise.resolve())?',
        'MCQ_SINGLE', 'JavaScript', 'MEDIUM', 2, 'Promise.resolve() returns a Promise object, so typeof gives "object".', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('"promise"', false, 0), ('"function"', false, 1), ('"object"', true, 2), ('"undefined"', false, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_fe_asmt, q.id, 4 from q
    on conflict (assessment_id, question_id) do nothing;

    -- Q6: Arithmetic
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'If a webpage loads in 2 seconds and you optimize it to 1.5 seconds, what is the percentage improvement?',
        'MCQ_SINGLE', 'Quantitative', 'EASY', 2, 'Improvement = (2 - 1.5) / 2 × 100 = 0.5/2 × 100 = 25%.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('20%', false, 0), ('25%', true, 1), ('30%', false, 2), ('33%', false, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_fe_asmt, q.id, 5 from q
    on conflict (assessment_id, question_id) do nothing;

    -- Q7: DOM
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'Which method is used to select an element by its ID in JavaScript?',
        'MCQ_SINGLE', 'JavaScript', 'EASY', 2, 'document.getElementById() returns the element with the specified ID.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('document.querySelector()', false, 0), ('document.getElementById()', true, 1), ('document.getElement()', false, 2), ('document.findById()', false, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_fe_asmt, q.id, 6 from q
    on conflict (assessment_id, question_id) do nothing;

    -- Q8: Semantic HTML
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'Which HTML5 tag represents the main content of a document, unique to the page?',
        'MCQ_SINGLE', 'HTML', 'EASY', 2, '<main> represents the dominant content of the <body>. It should be unique per page.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('<section>', false, 0), ('<article>', false, 1), ('<main>', true, 2), ('<content>', false, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_fe_asmt, q.id, 7 from q
    on conflict (assessment_id, question_id) do nothing;

    -- Q9: Event Loop
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'JavaScript is described as: ',
        'MCQ_SINGLE', 'JavaScript', 'EASY', 2, 'JavaScript is single-threaded and uses an event loop for non-blocking async operations.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('Multi-threaded', false, 0), ('Single-threaded with event loop', true, 1), ('Multi-threaded with shared memory', false, 2), ('Synchronous only', false, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_fe_asmt, q.id, 8 from q
    on conflict (assessment_id, question_id) do nothing;

    -- Q10: Logical
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'A grid has 5 rows and 4 columns of elements. How many total elements are there?',
        'MCQ_SINGLE', 'Logical Reasoning', 'EASY', 2, '5 rows × 4 columns = 20 total elements.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('16', false, 0), ('18', false, 1), ('20', true, 2), ('24', false, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_fe_asmt, q.id, 9 from q
    on conflict (assessment_id, question_id) do nothing;

  end if; -- v_fe_r1

  -- ══════════════════════════════════════════════════════════════════════════
  -- Data Analyst — Aptitude Assessment
  -- ══════════════════════════════════════════════════════════════════════════
  if v_da_r1 is not null then
    insert into public.assessments (drive_round_id, title, instructions, duration_minutes, passing_score, negative_marking, negative_fraction, shuffle_questions, shuffle_options, allow_review, is_active, created_by)
    values (v_da_r1, '[DEV] Data Analyst — Aptitude & Statistics',
      'This test covers quantitative aptitude, basic statistics and data interpretation. 45 minutes. No negative marking.',
      45, 14, false, 0.25, true, true, true, true, v_created_by)
    on conflict (drive_round_id) do update set is_active = true
    returning id into v_da_asmt;

    if v_da_asmt is null then
      select id into v_da_asmt from public.assessments where drive_round_id = v_da_r1;
    end if;

    -- Q1
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'The mean of 5 numbers is 10. If one number is removed and the new mean becomes 8, what was the removed number?',
        'MCQ_SINGLE', 'Statistics', 'MEDIUM', 2,
        'Total of 5 numbers = 5×10 = 50. Total of 4 numbers = 4×8 = 32. Removed number = 50 - 32 = 18.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('16', false, 0), ('18', true, 1), ('20', false, 2), ('22', false, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_da_asmt, q.id, 0 from q
    on conflict (assessment_id, question_id) do nothing;

    -- Q2
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'In a dataset of [3, 7, 7, 2, 9, 7, 4], what is the mode?',
        'MCQ_SINGLE', 'Statistics', 'EASY', 2,
        'The mode is the most frequently occurring value. 7 appears 3 times.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('3', false, 0), ('4', false, 1), ('7', true, 2), ('9', false, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_da_asmt, q.id, 1 from q
    on conflict (assessment_id, question_id) do nothing;

    -- Q3
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'Which SQL clause is used to filter results AFTER aggregation?',
        'MCQ_SINGLE', 'SQL', 'EASY', 2,
        'HAVING filters after GROUP BY aggregation. WHERE filters rows before aggregation.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('WHERE', false, 0), ('FILTER', false, 1), ('HAVING', true, 2), ('GROUP BY', false, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_da_asmt, q.id, 2 from q
    on conflict (assessment_id, question_id) do nothing;

    -- Q4: Interpretation
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'A company''s revenue grew from ₹80 lakh to ₹100 lakh. What is the percentage growth?',
        'MCQ_SINGLE', 'Data Interpretation', 'EASY', 2,
        'Growth % = (100-80)/80 × 100 = 20/80 × 100 = 25%.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('20%', false, 0), ('25%', true, 1), ('30%', false, 2), ('15%', false, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_da_asmt, q.id, 3 from q
    on conflict (assessment_id, question_id) do nothing;

    -- Q5: Normal Distribution
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'In a normal distribution, approximately what percentage of data falls within 2 standard deviations of the mean?',
        'MCQ_SINGLE', 'Statistics', 'MEDIUM', 2,
        'The empirical rule: 68% within 1σ, 95% within 2σ, 99.7% within 3σ.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('68%', false, 0), ('95%', true, 1), ('99%', false, 2), ('75%', false, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_da_asmt, q.id, 4 from q
    on conflict (assessment_id, question_id) do nothing;

  end if; -- v_da_r1

  -- ══════════════════════════════════════════════════════════════════════════
  -- Backend Developer — Coding Round 1 Assessment (aptitude)
  -- ══════════════════════════════════════════════════════════════════════════
  if v_be_r1 is not null then
    insert into public.assessments (drive_round_id, title, instructions, duration_minutes, passing_score, negative_marking, negative_fraction, shuffle_questions, shuffle_options, allow_review, is_active, created_by)
    values (v_be_r1, '[DEV] Backend Developer — Programming Concepts',
      'This test covers programming fundamentals, algorithms and backend concepts. 50 minutes. No negative marking.',
      50, 12, false, 0.25, true, true, true, true, v_created_by)
    on conflict (drive_round_id) do update set is_active = true
    returning id into v_be_asmt;

    if v_be_asmt is null then
      select id into v_be_asmt from public.assessments where drive_round_id = v_be_r1;
    end if;

    -- Q1: REST
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'Which HTTP method is idempotent and used to update a resource completely?',
        'MCQ_SINGLE', 'Web APIs', 'EASY', 2,
        'PUT is idempotent — multiple identical requests produce the same result. It replaces the entire resource.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('POST', false, 0), ('GET', false, 1), ('PUT', true, 2), ('PATCH', false, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_be_asmt, q.id, 0 from q
    on conflict (assessment_id, question_id) do nothing;

    -- Q2: Big-O
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'What is the average time complexity of inserting into a hash table?',
        'MCQ_SINGLE', 'Algorithms', 'EASY', 2,
        'Hash table insertion is O(1) on average because it computes the hash directly. Worst case is O(n) due to collisions.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('O(log n)', false, 0), ('O(1)', true, 1), ('O(n)', false, 2), ('O(n log n)', false, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_be_asmt, q.id, 1 from q
    on conflict (assessment_id, question_id) do nothing;

    -- Q3: Database
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'What does ACID stand for in database transactions?',
        'MCQ_SINGLE', 'Databases', 'MEDIUM', 2,
        'ACID = Atomicity, Consistency, Isolation, Durability — the four properties that guarantee reliable database transactions.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('Atomic, Concurrent, Isolated, Durable', false, 0), ('Atomicity, Consistency, Isolation, Durability', true, 1), ('Atomic, Consistent, Independent, Data-safe', false, 2), ('Availability, Consistency, Integrity, Durability', false, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_be_asmt, q.id, 2 from q
    on conflict (assessment_id, question_id) do nothing;

  end if; -- v_be_r1

  -- ══════════════════════════════════════════════════════════════════════════
  -- Cloud/DevOps — Aptitude Assessment
  -- ══════════════════════════════════════════════════════════════════════════
  if v_cloud_r1 is not null then
    insert into public.assessments (drive_round_id, title, instructions, duration_minutes, passing_score, negative_marking, negative_fraction, shuffle_questions, shuffle_options, allow_review, is_active, created_by)
    values (v_cloud_r1, '[DEV] Cloud/DevOps — Technical Aptitude',
      'This test covers quantitative aptitude, networking basics and cloud concepts. 45 minutes. No negative marking.',
      45, 12, false, 0.25, true, true, true, true, v_created_by)
    on conflict (drive_round_id) do update set is_active = true
    returning id into v_cloud_asmt;

    if v_cloud_asmt is null then
      select id into v_cloud_asmt from public.assessments where drive_round_id = v_cloud_r1;
    end if;

    -- Q1: Networking
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'What does DNS stand for?',
        'MCQ_SINGLE', 'Networking', 'EASY', 2,
        'DNS = Domain Name System — it translates human-readable domain names to IP addresses.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('Dynamic Network Service', false, 0), ('Domain Name System', true, 1), ('Distributed Node Server', false, 2), ('Data Network Standard', false, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_cloud_asmt, q.id, 0 from q
    on conflict (assessment_id, question_id) do nothing;

    -- Q2: Cloud
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'Which cloud service model provides virtualized computing resources over the internet?',
        'MCQ_SINGLE', 'Cloud Computing', 'EASY', 2,
        'IaaS (Infrastructure as a Service) provides virtualized hardware resources like VMs, storage and networking.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('SaaS', false, 0), ('PaaS', false, 1), ('IaaS', true, 2), ('FaaS', false, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_cloud_asmt, q.id, 1 from q
    on conflict (assessment_id, question_id) do nothing;

    -- Q3: Linux
    with q as (
      insert into public.questions (company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
      values (v_company_id, 'Which Linux command displays the current working directory?',
        'MCQ_SINGLE', 'Linux', 'EASY', 2,
        'pwd (print working directory) shows the full path of the current directory.', v_created_by)
      returning id
    ),
    o as (
      insert into public.question_options (question_id, option_text, is_correct, display_order)
      select q.id, t.opt, t.correct, t.ord from q,
        (values ('ls', false, 0), ('cd', false, 1), ('pwd', true, 2), ('dir', false, 3)) t(opt, correct, ord)
    )
    insert into public.assessment_questions (assessment_id, question_id, display_order)
    select v_cloud_asmt, q.id, 2 from q
    on conflict (assessment_id, question_id) do nothing;

  end if; -- v_cloud_r1

  raise notice '[SEED-E] Assessment seeding complete.';

end $$;
