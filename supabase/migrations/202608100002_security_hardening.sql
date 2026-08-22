-- Harden function privileges and require the publish transition to use trusted database logic.
drop policy drives_company_update on public.drives;
create policy drives_company_update_draft_only on public.drives for update using (public.is_company_owner(id) and status='draft') with check (public.is_company_owner(id) and status='draft');

create or replace function public.publish_drive(p_drive uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_company_owner(p_drive) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from public.drives d join public.eligibility_rules r on r.drive_id=d.id where d.id=p_drive and d.status='draft' and d.deadline>now() and r.locked=false) then raise exception 'A draft drive with unlocked valid eligibility rules is required'; end if;
  update public.eligibility_rules set locked=true where drive_id=p_drive;
  update public.drives set status='open' where id=p_drive;
  perform public.record_audit('DRIVE_PUBLISHED','drive',p_drive,null,'{}');
  perform public.record_audit('RULES_LOCKED','drive',p_drive,null,'{}');
end $$;

create or replace function public.create_shortlist_proposal(p_drive uuid,p_student uuid,p_action public.proposal_action,p_reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; d public.drives%rowtype; v_eligible boolean; c uuid;
begin
  if public.current_role()<>'coordinator' then perform public.record_audit('UNAUTHORIZED_ACTION','drive',p_drive,'Only coordinators may propose shortlist changes','{}','BLOCKED'); raise exception 'Not authorized'; end if;
  select * into d from public.drives where id=p_drive;
  if d.deadline<=now() or d.status in ('locked','completed','closed') then c:=public.record_audit('DEADLINE_VIOLATION','drive',p_drive,'Drive deadline has passed','{}','BLOCKED'); insert into public.anomaly_alerts(type,severity,description,drive_id,audit_commit_id,risk_score) values('LATE_ACTION','CRITICAL','Shortlist modification was attempted after deadline.',p_drive,c,70); raise exception 'Drive deadline has passed'; end if;
  select result.eligible into v_eligible from public.applications a join public.eligibility_results result on result.application_id=a.id where a.drive_id=p_drive and a.student_id=p_student;
  if p_action='ADD' and coalesce(v_eligible,false)=false then c:=public.record_audit('UNAUTHORIZED_ACTION','drive',p_drive,'Ineligible candidate addition proposed',jsonb_build_object('student_id',p_student),'BLOCKED'); insert into public.anomaly_alerts(type,severity,description,drive_id,audit_commit_id,risk_score) values('ELIGIBILITY_VIOLATION','HIGH','An ineligible candidate was proposed for addition.',p_drive,c,30); end if;
  insert into public.shortlist_proposals(drive_id,student_id,proposed_by,action,reason,status) values(p_drive,p_student,auth.uid(),p_action,p_reason,case when p_action='ADD' and coalesce(v_eligible,false)=false then 'BLOCKED' else 'PENDING' end) returning id into v_id;
  perform public.record_audit(case when p_action='ADD' then 'SHORTLIST_ADD_PROPOSED' else 'SHORTLIST_REMOVE_PROPOSED' end,'shortlist_proposal',v_id,p_reason,'{}',case when coalesce(v_eligible,true) then 'SUCCESS' else 'BLOCKED' end); return v_id;
end $$;

revoke all on function public.record_audit(text,text,uuid,text,jsonb,text) from public, anon, authenticated;
revoke all on function public.current_role(), public.is_company_owner(uuid), public.is_staff() from public;
revoke all on function public.apply_to_drive(uuid), public.create_shortlist_proposal(uuid,uuid,public.proposal_action,text), public.review_proposal(uuid,public.approval_decision,text), public.lock_shortlist(uuid), public.publish_drive(uuid), public.verify_audit_chain() from public;
grant execute on function public.apply_to_drive(uuid), public.create_shortlist_proposal(uuid,uuid,public.proposal_action,text), public.review_proposal(uuid,public.approval_decision,text), public.lock_shortlist(uuid), public.publish_drive(uuid), public.verify_audit_chain() to authenticated;
