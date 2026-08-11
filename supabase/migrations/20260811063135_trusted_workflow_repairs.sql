-- Route privileged workflow mutations through trusted, auditable RPCs.

create or replace function public.create_drive_with_rules(
  p_title text,
  p_description text,
  p_role_name text,
  p_deadline timestamptz,
  p_min_cgpa numeric,
  p_allowed_branches text[],
  p_max_backlogs smallint,
  p_required_skills text[] default '{}'
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_company_id uuid;
  v_drive_id uuid;
  v_audit_id uuid;
begin
  if auth.uid() is null or public.current_role() <> 'company' then
    raise exception 'Not authorized';
  end if;

  select id into v_company_id from public.companies where profile_id = auth.uid();
  if v_company_id is null then
    v_audit_id := public.record_audit('COMPANY_PROFILE_MISSING', 'company', null, 'Drive creation blocked because the company record is missing.', '{}'::jsonb, 'BLOCKED');
    insert into public.anomaly_alerts(type, severity, description, audit_commit_id, risk_score)
      values ('COMPANY_PROFILE_MISSING', 'HIGH', 'A company account attempted to create a drive without a company record.', v_audit_id, 60);
    raise exception 'Your company profile has not been configured.';
  end if;

  if length(trim(coalesce(p_title, ''))) = 0 or length(trim(coalesce(p_role_name, ''))) = 0 then
    raise exception 'Drive title and role name are required';
  end if;
  if p_deadline is null or p_deadline <= now() then
    raise exception 'The application deadline must be in the future';
  end if;
  if p_min_cgpa is null or p_min_cgpa < 0 or p_min_cgpa > 10 or p_max_backlogs is null or p_max_backlogs < 0
    or coalesce(cardinality(p_allowed_branches), 0) = 0 then
    raise exception 'Eligibility rules are invalid';
  end if;

  insert into public.drives(company_id, title, description, role_name, deadline, created_by)
    values (v_company_id, trim(p_title), coalesce(p_description, ''), trim(p_role_name), p_deadline, auth.uid())
    returning id into v_drive_id;
  insert into public.eligibility_rules(drive_id, min_cgpa, allowed_branches, max_backlogs, required_skills)
    values (v_drive_id, p_min_cgpa, p_allowed_branches, p_max_backlogs, coalesce(p_required_skills, '{}'));
  perform public.record_audit('DRIVE_CREATED', 'drive', v_drive_id, null, jsonb_build_object('status', 'draft'));
  perform public.record_audit('ELIGIBILITY_RULES_CREATED', 'drive', v_drive_id, null, '{}'::jsonb);
  return v_drive_id;
end $$;

create or replace function public.set_profile_active(p_profile_id uuid, p_is_active boolean)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_audit_id uuid;
begin
  if auth.uid() is null or public.current_role() <> 'admin' then
    raise exception 'Not authorized';
  end if;
  if p_profile_id = auth.uid() then
    v_audit_id := public.record_audit('PROFILE_STATUS_CHANGE_BLOCKED', 'profile', p_profile_id, 'Administrators cannot change their own active status.', '{}'::jsonb, 'BLOCKED');
    insert into public.anomaly_alerts(type, severity, description, audit_commit_id, risk_score)
      values ('SELF_ADMINISTRATION_ATTEMPT', 'HIGH', 'An administrator attempted to change their own active status.', v_audit_id, 65);
    raise exception 'You cannot change your own active status';
  end if;
  update public.profiles set is_active = p_is_active where id = p_profile_id;
  if not found then raise exception 'Profile was not found'; end if;
  perform public.record_audit('PROFILE_STATUS_CHANGED', 'profile', p_profile_id, null, jsonb_build_object('is_active', p_is_active));
end $$;

create or replace function public.create_admin_access_request(
  p_resource_type text,
  p_resource_id uuid,
  p_reason text
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_request_id uuid;
begin
  if auth.uid() is null or public.current_role() <> 'admin' then
    raise exception 'Not authorized';
  end if;
  if length(trim(coalesce(p_resource_type, ''))) = 0 or length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'A resource type and a reason of at least 10 characters are required';
  end if;
  insert into public.admin_access_requests(admin_id, resource_type, resource_id, reason)
    values (auth.uid(), trim(p_resource_type), p_resource_id, trim(p_reason)) returning id into v_request_id;
  perform public.record_audit('ADMIN_ACCESS_REQUEST_CREATED', 'admin_access_request', v_request_id, p_reason, jsonb_build_object('resource_type', trim(p_resource_type), 'resource_id', p_resource_id));
  return v_request_id;
end $$;

drop policy if exists profiles_admin_update on public.profiles;

revoke all on function public.create_drive_with_rules(text, text, text, timestamptz, numeric, text[], smallint, text[]) from public, anon;
revoke all on function public.set_profile_active(uuid, boolean) from public, anon;
revoke all on function public.create_admin_access_request(text, uuid, text) from public, anon;
grant execute on function public.create_drive_with_rules(text, text, text, timestamptz, numeric, text[], smallint, text[]) to authenticated;
grant execute on function public.set_profile_active(uuid, boolean) to authenticated;
grant execute on function public.create_admin_access_request(text, uuid, text) to authenticated;

-- An RPC that records blocked attempts must return a result rather than raise
-- after the audit write; a PostgreSQL exception would roll the audit event back.
create function public.apply_to_drive_result(p_drive uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_student public.students%rowtype;
  v_rules public.eligibility_rules%rowtype;
  v_drive public.drives%rowtype;
  v_application_id uuid;
  v_audit_id uuid;
  v_failed_rules text[] := '{}';
begin
  if auth.uid() is null or public.current_role() <> 'student' then
    raise exception 'Not authorized';
  end if;
  select * into v_student from public.students where profile_id = auth.uid();
  if not found then
    v_audit_id := public.record_audit('STUDENT_PROFILE_MISSING', 'drive', p_drive, 'Application blocked because the student record is missing.', '{}'::jsonb, 'BLOCKED');
    insert into public.anomaly_alerts(type, severity, description, audit_commit_id, risk_score)
      values ('STUDENT_PROFILE_MISSING', 'HIGH', 'A student account attempted to apply without a student record.', v_audit_id, 60);
    return jsonb_build_object('ok', false, 'message', 'Your student profile has not been configured. Contact the placement office.');
  end if;
  select * into v_drive from public.drives where id = p_drive;
  if not found then
    v_audit_id := public.record_audit('INVALID_DRIVE_REFERENCE', 'drive', p_drive, 'Application referenced a drive that does not exist.', '{}'::jsonb, 'BLOCKED');
    insert into public.anomaly_alerts(type, severity, description, audit_commit_id, risk_score)
      values ('INVALID_DRIVE_REFERENCE', 'HIGH', 'An application referenced a nonexistent drive.', v_audit_id, 55);
    return jsonb_build_object('ok', false, 'message', 'Drive was not found.');
  end if;
  if v_drive.status <> 'open' or v_drive.deadline <= now() then
    v_audit_id := public.record_audit('DEADLINE_VIOLATION', 'drive', p_drive, 'Application blocked because the drive is not accepting applications.', '{}'::jsonb, 'BLOCKED');
    insert into public.anomaly_alerts(type, severity, description, drive_id, audit_commit_id, risk_score)
      values ('LATE_APPLICATION_ATTEMPT', 'MEDIUM', 'An application was attempted for a closed or expired drive.', p_drive, v_audit_id, 35);
    return jsonb_build_object('ok', false, 'message', 'Drive is not accepting applications.');
  end if;
  select * into v_rules from public.eligibility_rules where drive_id = p_drive;
  if not found then
    v_audit_id := public.record_audit('ELIGIBILITY_CONFIGURATION_MISSING', 'drive', p_drive, 'Application blocked because eligibility rules are missing.', '{}'::jsonb, 'BLOCKED');
    insert into public.anomaly_alerts(type, severity, description, drive_id, audit_commit_id, risk_score)
      values ('ELIGIBILITY_CONFIGURATION_MISSING', 'HIGH', 'An open drive is missing eligibility rules.', p_drive, v_audit_id, 70);
    return jsonb_build_object('ok', false, 'message', 'Drive eligibility rules are unavailable.');
  end if;
  if exists(select 1 from public.applications where drive_id = p_drive and student_id = v_student.id) then
    v_audit_id := public.record_audit('DUPLICATE_APPLICATION_BLOCKED', 'drive', p_drive, 'Duplicate application prevented.', '{}'::jsonb, 'BLOCKED');
    insert into public.anomaly_alerts(type, severity, description, drive_id, audit_commit_id, risk_score)
      values ('REPEATED_APPLICATION_ATTEMPT', 'LOW', 'A duplicate application attempt was blocked.', p_drive, v_audit_id, 20);
    return jsonb_build_object('ok', false, 'message', 'You have already applied to this drive.');
  end if;
  if v_student.cgpa < v_rules.min_cgpa then v_failed_rules := array_append(v_failed_rules, format('CGPA %s is below required minimum %s.', v_student.cgpa, v_rules.min_cgpa)); end if;
  if v_student.backlogs > v_rules.max_backlogs then v_failed_rules := array_append(v_failed_rules, 'Backlog limit exceeded.'); end if;
  if not (lower(v_student.branch) = any(select lower(branch_name) from unnest(v_rules.allowed_branches) branch_name)) then v_failed_rules := array_append(v_failed_rules, 'Branch is not allowed.'); end if;
  if exists(select 1 from unnest(v_rules.required_skills) skill where not lower(skill) = any(select lower(student_skill) from unnest(v_student.skills) student_skill)) then v_failed_rules := array_append(v_failed_rules, 'Required skills are missing.'); end if;
  if cardinality(v_failed_rules) > 0 then
    perform public.record_audit('ELIGIBILITY_CHECKED', 'drive', p_drive, array_to_string(v_failed_rules, ' '), jsonb_build_object('eligible', false), 'BLOCKED');
    return jsonb_build_object('ok', false, 'message', 'You do not meet the eligibility requirements.', 'failedRules', v_failed_rules);
  end if;
  insert into public.applications(drive_id, student_id, status) values (p_drive, v_student.id, 'ELIGIBLE') returning id into v_application_id;
  insert into public.eligibility_results(application_id, eligible, engine_version) values (v_application_id, true, '1.0.0');
  perform public.record_audit('APPLICATION_SUBMITTED', 'application', v_application_id, null, jsonb_build_object('drive_id', p_drive));
  perform public.record_audit('ELIGIBILITY_CHECKED', 'application', v_application_id, null, jsonb_build_object('eligible', true));
  return jsonb_build_object('ok', true, 'applicationId', v_application_id);
end $$;

drop policy if exists drives_company_insert on public.drives;
drop policy if exists drives_company_update_draft_only on public.drives;
drop policy if exists rules_company_write on public.eligibility_rules;
revoke all on function public.apply_to_drive(uuid) from authenticated;
revoke all on function public.apply_to_drive_result(uuid) from public, anon;
grant execute on function public.apply_to_drive_result(uuid) to authenticated;

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path=public as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace function public.prevent_audit_mutation() returns trigger
language plpgsql set search_path=public as $$
begin
  raise exception 'Audit commits are append-only';
end $$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.record_audit(text, text, uuid, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.apply_to_drive(uuid) from public, anon, authenticated;
revoke all on function public.apply_to_drive_result(uuid) from public, anon;
revoke all on function public.create_shortlist_proposal(uuid, uuid, public.proposal_action, text) from public, anon;
revoke all on function public.review_proposal(uuid, public.approval_decision, text) from public, anon;
revoke all on function public.publish_drive(uuid) from public, anon;
revoke all on function public.lock_shortlist(uuid) from public, anon;
revoke all on function public.verify_audit_chain() from public, anon;
revoke all on function public.current_role() from public, anon;
revoke all on function public.is_company_owner(uuid) from public, anon;
revoke all on function public.is_staff() from public, anon;
grant execute on function public.current_role(), public.is_company_owner(uuid), public.is_staff() to authenticated;
grant execute on function public.apply_to_drive_result(uuid), public.create_shortlist_proposal(uuid, uuid, public.proposal_action, text), public.review_proposal(uuid, public.approval_decision, text), public.publish_drive(uuid), public.lock_shortlist(uuid), public.verify_audit_chain() to authenticated;
