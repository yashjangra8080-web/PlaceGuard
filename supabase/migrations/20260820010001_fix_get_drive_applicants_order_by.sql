-- PlaceGuard: Fix get_drive_applicants — ORDER BY inside aggregate
-- =============================================================================
-- Bug: get_drive_applicants had `ORDER BY a.applied_at` on the outer SELECT
-- of an aggregate query (jsonb_agg) with no GROUP BY.
-- PostgreSQL rejects this at runtime with:
--   "column a.applied_at must appear in the GROUP BY clause or
--    be used in an aggregate function"
--
-- The function compiled fine (PL/pgSQL defers SQL validation to runtime),
-- but failed on every invocation — silently swallowed by the frontend catch{}.
--
-- Fix: move `ORDER BY a.applied_at` inside `jsonb_agg(... ORDER BY a.applied_at)`.
-- This correctly orders the applicants within the aggregated JSON array.
-- No schema, RLS, or authorization changes — the auth check is untouched.
-- =============================================================================

create or replace function public.get_drive_applicants(p_drive uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not (public.is_company_owner(p_drive) or public.is_staff()) then
    raise exception 'Not authorized';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'application_id',     a.id,
      'application_status', a.status,
      'student_id',         s.id,
      'student_name',       p.name,
      'roll_number',        s.roll_number,
      'branch',             s.branch,
      'cgpa',               s.cgpa,
      'applied_at',         a.applied_at,
      'rounds', (
        select jsonb_agg(
          jsonb_build_object(
            'application_round_id', ar.id,
            'round_number',         dr.round_number,
            'name',                 dr.name,
            'round_type',           dr.round_type,
            'status',               ar.status,
            'score',                ar.score,
            'max_score',            dr.max_score,
            'feedback',             ar.feedback,
            'evaluated_by_name',    ev.name,
            'evaluated_at',         ar.evaluated_at
          ) order by dr.round_number
        )
        from public.application_rounds ar
        join public.drive_rounds dr on dr.id = ar.round_id
        left join public.profiles ev on ev.id = ar.evaluated_by
        where ar.application_id = a.id
      )
    ) order by a.applied_at   -- ← ORDER BY now inside jsonb_agg where it belongs
  ) into v_result
  from public.applications a
  join public.students s on s.id = a.student_id
  join public.profiles p on p.id = s.profile_id
  where a.drive_id = p_drive;  -- ← outer SELECT no longer has ORDER BY

  return coalesce(v_result, '[]'::jsonb);
end $$;

-- No grant changes needed — authenticated already has execute from 20260812000001
