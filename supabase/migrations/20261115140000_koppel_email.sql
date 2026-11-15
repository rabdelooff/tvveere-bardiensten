-- =====================================================================
-- E-mailadres koppelen aan iemand die de beheerder zelf heeft toegevoegd.
--   * Bij het toevoegen, of later, vult de beheerder een e-mailadres in.
--   * Logt iemand de eerste keer in met dat adres, dan wordt het nieuwe
--     account automatisch aan die persoon gekoppeld: alle aanmeldingen,
--     indelingen en opmerkingen blijven staan.
--   * Hoort het adres al bij een bestaand account, dan voegt de beheerder
--     de twee meteen samen.
--   * Het adres staat in een eigen tabel die niemand rechtstreeks kan
--     lezen (de lijst met namen is voor alle vrijwilligers zichtbaar).
-- =====================================================================

create table public.koppel_emails (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and length(email) between 5 and 254),
  created_at timestamptz not null default now()
);
create unique index koppel_emails_email_key on public.koppel_emails (email);
alter table public.koppel_emails enable row level security;
revoke all on public.koppel_emails from anon, authenticated;
comment on table public.koppel_emails is 'E-mailadres van een handmatig toegevoegde persoon; alleen via functies te lezen.';

-- --- samenvoegen -------------------------------------------------------

-- Zet alles van een handmatig toegevoegde persoon over naar een account en
-- verwijdert de handmatige persoon. Wat het account al heeft, blijft staan.
create or replace function public.merge_profiel(p_van uuid, p_naar uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_van public.profiles; v_naar public.profiles;
begin
  select * into v_van from public.profiles where id = p_van and handmatig;
  select * into v_naar from public.profiles where id = p_naar and not handmatig;
  if v_van.id is null or v_naar.id is null then raise exception 'Samenvoegen kan niet'; end if;

  delete from public.aanmeldingen a where a.profile_id = p_van
    and exists (select 1 from public.aanmeldingen b where b.shift_id = a.shift_id and b.profile_id = p_naar);
  update public.aanmeldingen set profile_id = p_naar where profile_id = p_van;

  delete from public.indeling_concept a where a.profile_id = p_van
    and exists (select 1 from public.indeling_concept b where b.shift_id = a.shift_id and b.profile_id = p_naar);
  update public.indeling_concept set profile_id = p_naar where profile_id = p_van;

  delete from public.toewijzingen a where a.profile_id = p_van
    and exists (select 1 from public.toewijzingen b where b.shift_id = a.shift_id and b.profile_id = p_naar);
  update public.toewijzingen set profile_id = p_naar where profile_id = p_van;

  delete from public.vervang_aanbod a where a.profile_id = p_van
    and exists (select 1 from public.vervang_aanbod b where b.toewijzing_id = a.toewijzing_id and b.profile_id = p_naar);
  update public.vervang_aanbod set profile_id = p_naar where profile_id = p_van;

  delete from public.opmerkingen a where a.profile_id = p_van
    and exists (select 1 from public.opmerkingen b where b.edition_id = a.edition_id and b.profile_id = p_naar);
  update public.opmerkingen set profile_id = p_naar where profile_id = p_van;

  update public.meldingen set profile_id = p_naar where profile_id = p_van;

  -- een account zonder naam krijgt de naam van de handmatige persoon
  if v_naar.naam = '' then update public.profiles set naam = v_van.naam where id = p_naar; end if;

  delete from public.profiles where id = p_van;   -- ruimt ook het gekoppelde adres op
  perform public.noteer('voegde ' || v_van.naam || ' samen met een account');
end $$;

-- --- e-mailadres koppelen of ontkoppelen -------------------------------

create or replace function public.admin_zet_email(p_profile uuid, p_email text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v public.profiles;
  v_user uuid;
  v_ander text;
begin
  if not public.is_admin() then raise exception 'Alleen voor beheerders'; end if;
  select * into v from public.profiles where id = p_profile and handmatig;
  if v.id is null then raise exception 'Alleen bij iemand zonder account kun je een e-mailadres koppelen'; end if;

  if v_email = '' then
    delete from public.koppel_emails where profile_id = p_profile;
    return 'ontkoppeld';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    raise exception 'Dit e-mailadres lijkt niet te kloppen';
  end if;

  select p.naam into v_ander from public.koppel_emails k join public.profiles p on p.id = k.profile_id
   where k.email = v_email and k.profile_id <> p_profile;
  if v_ander is not null then raise exception 'Dit e-mailadres is al gekoppeld aan %', v_ander; end if;

  -- hoort het adres al bij een account met een profiel? Dan meteen samenvoegen.
  select u.id into v_user from auth.users u join public.profiles p on p.id = u.id and not p.handmatig
   where lower(u.email) = v_email;
  if v_user is not null then
    perform public.merge_profiel(p_profile, v_user);
    return 'samengevoegd';
  end if;

  insert into public.koppel_emails (profile_id, email) values (p_profile, v_email)
  on conflict (profile_id) do update set email = excluded.email, created_at = now();
  perform public.noteer('koppelde een e-mailadres aan ' || v.naam);
  return 'gekoppeld';
end $$;

-- --- inloggen: een nieuw account pakt zijn gekoppelde persoon op ---------

create or replace function public.start_profiel(p_naam text default null)
returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_rij public.profiles;
  v_naam text := btrim(regexp_replace(coalesce(p_naam, ''), '\s+', ' ', 'g'));
  v_mail text; v_bevestigd boolean; v_handmatig uuid;
begin
  if v_uid is null then raise exception 'Niet ingelogd'; end if;
  perform pg_advisory_xact_lock(7426001);
  insert into public.profiles (id, naam, is_admin)
  values (v_uid, left(v_naam, 80), not exists (select 1 from public.profiles where is_admin))
  on conflict (id) do nothing;

  -- alleen als het adres bevestigd is (magic link of code), anders kan iemand
  -- zich voordoen als een ander
  select lower(u.email), u.email_confirmed_at is not null into v_mail, v_bevestigd from auth.users u where u.id = v_uid;
  if v_bevestigd and v_mail is not null then
    select k.profile_id into v_handmatig from public.koppel_emails k where k.email = v_mail;
    if v_handmatig is not null and exists (select 1 from public.profiles where id = v_uid and not handmatig) then
      perform public.merge_profiel(v_handmatig, v_uid);
    end if;
  end if;

  if v_naam <> '' then
    update public.profiles set naam = left(v_naam, 80) where id = v_uid and naam = '';
  end if;
  select * into v_rij from public.profiles where id = v_uid;
  return v_rij;
end $$;

-- --- ledenlijst: ook het gekoppelde adres ------------------------------

drop function public.admin_leden();
create function public.admin_leden()
returns table (id uuid, naam text, email text, is_admin boolean, actief boolean,
               created_at timestamptz, handmatig boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Alleen voor beheerders'; end if;
  return query
    select p.id, p.naam, coalesce(u.email::text, k.email), p.is_admin, p.actief, p.created_at, p.handmatig
      from public.profiles p
      left join auth.users u on u.id = p.id
      left join public.koppel_emails k on k.profile_id = p.id
     order by lower(p.naam);
end $$;

-- --- rechten -----------------------------------------------------------

revoke execute on function public.merge_profiel(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.admin_zet_email(uuid, text), public.admin_leden() from public, anon;
grant execute on function public.admin_zet_email(uuid, text), public.admin_leden() to authenticated, service_role;
revoke execute on function public.start_profiel(text) from public, anon;
grant execute on function public.start_profiel(text) to authenticated, service_role;
