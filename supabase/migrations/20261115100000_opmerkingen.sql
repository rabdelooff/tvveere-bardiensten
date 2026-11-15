-- =====================================================================
-- Algemene opmerking van een vrijwilliger aan de beheerder, per editie.
-- Bijvoorbeeld: "Ik meld me aan voor vier diensten, maar wil er maximaal
-- één draaien." Alleen de vrijwilliger zelf en de beheerders zien dit.
-- =====================================================================

create table public.opmerkingen (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  tekst text not null check (length(tekst) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edition_id, profile_id)
);
create index opmerkingen_profile_idx on public.opmerkingen (profile_id);
comment on table public.opmerkingen is 'Eén opmerking per vrijwilliger per editie, bedoeld voor de beheerder.';

-- Bewaart, wijzigt of (bij lege tekst) verwijdert de eigen opmerking.
-- Beheerders krijgen een melding als de tekst nieuw of veranderd is.
create or replace function public.zet_opmerking(p_edition uuid, p_tekst text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_tekst text := left(btrim(coalesce(p_tekst, '')), 500);
  v_oud text;
  v_ed text;
begin
  if not public.is_actief() then raise exception 'Geen toegang'; end if;

  if v_tekst = '' then
    delete from public.opmerkingen where edition_id = p_edition and profile_id = v_uid;
    return;
  end if;

  select naam into v_ed from public.editions where id = p_edition and status = 'open';
  if v_ed is null then raise exception 'Deze editie staat niet (meer) open'; end if;

  select tekst into v_oud from public.opmerkingen where edition_id = p_edition and profile_id = v_uid;
  if v_oud is not distinct from v_tekst then return; end if;

  insert into public.opmerkingen (edition_id, profile_id, tekst)
  values (p_edition, v_uid, v_tekst)
  on conflict (edition_id, profile_id) do update
    set tekst = excluded.tekst, updated_at = now();

  perform public.meld_admins('opmerking', 'Opmerking van ' || public.mijn_naam(),
    case when length(v_tekst) > 140 then left(v_tekst, 139) || '…' else v_tekst end,
    '/#/beheer');
end $$;

-- --- rechten -----------------------------------------------------------

alter table public.opmerkingen enable row level security;

-- Lezen: alleen je eigen opmerking, of alles als beheerder. Schrijven gaat via de functie.
create policy opmerkingen_lezen on public.opmerkingen for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_admin()));

revoke all on public.opmerkingen from anon;
grant select on public.opmerkingen to authenticated;
revoke execute on function public.zet_opmerking(uuid, text) from public, anon;
grant execute on function public.zet_opmerking(uuid, text) to authenticated, service_role;

-- --- realtime ----------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table public.opmerkingen;
exception when duplicate_object then null;
end $$;
