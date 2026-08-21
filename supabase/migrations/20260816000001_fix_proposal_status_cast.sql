-- PlaceGuard: Fix create_shortlist_proposal — proposal_status type mismatch
-- ============================================================
-- Root cause:
--   In PL/pgSQL, `CASE WHEN ... THEN 'BLOCKED' ELSE 'PENDING' END` resolves the
--   result type as `text` (unknown-literal promotion). PostgreSQL cannot
--   implicitly coerce `text` to `proposal_status` in the VALUES clause of a
--   static INSERT, so it raises:
--     ERROR: column "status" is of type proposal_status
--            but expression is of type text
--
--   This is the same bug class previously fixed for `candidate_round_status`
--   in 20260812010001_fix_apply_round_status_cast.sql.
--
-- Fix: add explicit ::public.proposal_status casts on both CASE branches.
-- No schema changes. No data changes. One function replacement.
-- ============================================================

create or replace function public.create_shortlist_proposal(p_drive uuid,p_student uuid,p_action public.proposal_action,p_reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; d public.drives%rowtype; v_eligible boolean; c uuid;
begin
  if public.current_role()<>'coordinator' then perform public.record_audit('UNAUTHORIZED_ACTION','drive',p_drive,'Only coordinators may propose shortlist changes','{}','BLOCKED'); raise exception 'Not authorized'; end if;
  select * into d from public.drives where id=p_drive;
  if d.deadline<=now() or d.status in ('locked','completed','closed') then c:=public.record_audit('DEADLINE_VIOLATION','drive',p_drive,'Drive deadline has passed','{}','BLOCKED'); insert into public.anomaly_alerts(type,severity,description,drive_id,audit_commit_id,risk_score) values('LATE_ACTION','CRITICAL','Shortlist modification was attempted after deadline.',p_drive,c,70); raise exception 'Drive deadline has passed'; end if;
  select result.eligible into v_eligible from public.applications a join public.eligibility_results result on result.application_id=a.id where a.drive_id=p_drive and a.student_id=p_student;
  if p_action='ADD' and coalesce(v_eligible,false)=false then c:=public.record_audit('UNAUTHORIZED_ACTION','drive',p_drive,'Ineligible candidate addition proposed',jsonb_build_object('student_id',p_student),'BLOCKED'); insert into public.anomaly_alerts(type,severity,description,drive_id,audit_commit_id,risk_score) values('ELIGIBILITY_VIOLATION','HIGH','An ineligible candidate was proposed for addition.',p_drive,c,30); end if;
  -- FIX: explicit ::public.proposal_status casts on both CASE branches prevent
  --      the "expression is of type text" error in PL/pgSQL static analysis.
  insert into public.shortlist_proposals(drive_id,student_id,proposed_by,action,reason,status) values(p_drive,p_student,auth.uid(),p_action,p_reason,case when p_action='ADD' and coalesce(v_eligible,false)=false then 'BLOCKED'::public.proposal_status else 'PENDING'::public.proposal_status end) returning id into v_id;
  perform public.record_audit(case when p_action='ADD' then 'SHORTLIST_ADD_PROPOSED' else 'SHORTLIST_REMOVE_PROPOSED' end,'shortlist_proposal',v_id,p_reason,'{}',case when coalesce(v_eligible,true) then 'SUCCESS' else 'BLOCKED' end); return v_id;
end $$;

-- Same bug class exists in review_proposal: the UPDATE SET status also uses an
-- uncast text CASE into the proposal_status column. Without explicit casts the
-- T&P Head Approve/Reject step fails with the identical "expression is of type
-- text" error. No workflow, authorization, or separation-of-duties change.
create or replace function public.review_proposal(p_proposal uuid,p_decision public.approval_decision,p_reason text) returns void language plpgsql security definer set search_path=public as $$
declare p public.shortlist_proposals%rowtype;
begin
  if public.current_role()<>'tnp_head' then raise exception 'Not authorized'; end if;
  select * into p from public.shortlist_proposals where id=p_proposal for update;
  if p.proposed_by=auth.uid() then raise exception 'Separation of duties violation'; end if;
  if p.status<>'PENDING' then raise exception 'Proposal is not pending'; end if;
  if p_decision='APPROVED' and p.reason ilike '%exception%' and length(trim(p_reason))<10 then raise exception 'Documented exception reason required'; end if;
  insert into public.approvals(proposal_id,reviewed_by,decision,reason) values(p_proposal,auth.uid(),p_decision,p_reason);
  update public.shortlist_proposals set status=case when p_decision='APPROVED' then 'APPROVED'::public.proposal_status else 'REJECTED'::public.proposal_status end where id=p_proposal;
  if p_decision='APPROVED' then insert into public.shortlists(drive_id,student_id,status,approved_by) values(p.drive_id,p.student_id,case when p.action='ADD' then 'SHORTLISTED' else 'REMOVED' end,auth.uid()) on conflict(drive_id,student_id) do update set status=excluded.status,approved_by=excluded.approved_by,added_at=now(); end if;
  perform public.record_audit(case when p_decision='APPROVED' then 'PROPOSAL_APPROVED' else 'PROPOSAL_REJECTED' end,'shortlist_proposal',p_proposal,p_reason,'{}');
end $$;

-- Re-apply grants (idempotent)
revoke all on function public.create_shortlist_proposal(uuid, uuid, public.proposal_action, text) from public, anon;
grant execute on function public.create_shortlist_proposal(uuid, uuid, public.proposal_action, text) to authenticated;
revoke all on function public.review_proposal(uuid, public.approval_decision, text) from public, anon;
grant execute on function public.review_proposal(uuid, public.approval_decision, text) to authenticated;