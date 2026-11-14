-- =====================================================================
-- TV Veere bardiensten — versie 2
--   * inloggen met magic link (Supabase Auth) in plaats van een namenlijst
--   * vrijwilligers melden zich aan, de beheerder deelt in en publiceert
--   * vervanger zoeken met goedkeuring van de beheerder
--   * meldingen (in de app en als pushbericht)
--
-- De oude tabellen people / assignments / changelog worden niet gewist maar
-- verplaatst naar het schema "archief". Edities, dagen en diensten blijven.
-- =====================================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- --- oude opzet naar het archief --------------------------------------

create schema if not exists archief;
revoke all on schema archief from anon, authenticated;

drop trigger if exists trg_capaciteit on public.assignments;
drop trigger if exists trg_naam_norm on public.people;
drop trigger if exists trg_plekken on public.shifts;
drop function if exists public.voeg_samen(uuid, uuid);
drop function if exists public.check_capaciteit();
drop function if exists public.zet_naam_norm();
drop function if exists public.check_plekken_verlagen();

do $$
declare t text;
begin
  foreach t in array array['assignments', 'people', 'changelog'] loop
    if to_regclass('public.' || t) is not null then
      begin
        execute format('alter publication supabase_realtime drop table public.%I', t);
      exception when others then null;
      end;
      execute format('alter table public.%I set schema archief', t);
    end if;
  end loop;
end $$;

-- het archief mag het beheer van edities en diensten niet blokkeren
alter table if exists archief.assignments drop constraint if exists assignments_shift_id_fkey;
alter table if exists archief.changelog drop constraint if exists changelog_edition_id_fkey;

-- --- tabellen ----------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  naam text not null default '',
  is_admin boolean not null default false,
  actief boolean not null default true,
  meld_aanmeldingen boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.profiles is 'Eén rij per ingelogde vrijwilliger. Aangemaakt bij de eerste keer inloggen.';

alter table public.shifts
  add column if not exists gepromoot_at timestamptz,
  add column if not exists promo_tekst text;

-- Aanmelding: "ik kan deze dienst draaien". Nog geen toewijzing.
create table public.aanmeldingen (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (shift_id, profile_id)
);

-- Werkversie van de beheerder. Alleen beheerders zien dit.
create table public.indeling_concept (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (shift_id, profile_id)
);

-- Gepubliceerd rooster. Dit zien de vrijwilligers.
create table public.toewijzingen (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'ingedeeld' check (status in ('ingedeeld', 'zoekt_vervanger')),
  herinnerd_at timestamptz,
  created_at timestamptz not null default now(),
  unique (shift_id, profile_id)
);

-- "Ik wil deze dienst overnemen" — de beheerder kiest en keurt goed.
create table public.vervang_aanbod (
  id uuid primary key default gen_random_uuid(),
  toewijzing_id uuid not null references public.toewijzingen (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (toewijzing_id, profile_id)
);

-- Berichten in de app; dezelfde rij gaat ook als pushbericht de deur uit.
create table public.meldingen (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  soort text not null,
  titel text not null,
  tekst text not null default '',
  url text not null default '/',
  created_at timestamptz not null default now(),
  gelezen_at timestamptz,
  push_status text not null default 'wacht' check (push_status in ('wacht', 'bezig', 'klaar'))
);
create index meldingen_profile_idx on public.meldingen (profile_id, created_at desc);
create index meldingen_push_idx on public.meldingen (push_status) where push_status <> 'klaar';

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

-- Sleutels en instellingen voor push. Geen policies: alleen de server kan erbij.
create table public.push_config (
  key text primary key,
  value text not null
);

create table public.logboek (
  id bigint generated always as identity primary key,
  wie text not null,
  tekst text not null,
  created_at timestamptz not null default now()
);

create index aanmeldingen_profile_idx on public.aanmeldingen (profile_id);
create index concept_profile_idx on public.indeling_concept (profile_id);
create index toewijzingen_profile_idx on public.toewijzingen (profile_id);
create index vervang_aanbod_profile_idx on public.vervang_aanbod (profile_id);
create index if not exists days_edition_idx on public.days (edition_id);
create index if not exists shifts_day_idx on public.shifts (day_id);

-- --- hulpfuncties ------------------------------------------------------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
                  where id = (select auth.uid()) and is_admin and actief);
$$;

create or replace function public.is_actief() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
                  where id = (select auth.uid()) and actief);
$$;

create or replace function public.mijn_naam() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif((select naam from public.profiles where id = (select auth.uid())), ''), 'Iemand');
$$;

-- "za 12 jun · 19.00–sluit" (+ post als het geen bardienst is)
create or replace function public.dienst_label(p_shift uuid) returns text
language sql stable security definer set search_path = '' as $$
  select (array['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'])[extract(dow from d.datum)::int + 1]
         || ' ' || extract(day from d.datum)::int || ' '
         || (array['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'])[extract(month from d.datum)::int]
         || ' · ' || s.start_tijd || '–' || s.eind_tijd
         || case when s.post <> 'Bar' then ' · ' || s.post else '' end
    from public.shifts s join public.days d on d.id = s.day_id
   where s.id = p_shift;
$$;

create or replace function public.shift_open(p_shift uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shifts s
      join public.days d on d.id = s.day_id
      join public.editions e on e.id = d.edition_id
     where s.id = p_shift and e.status = 'open');
$$;

create or replace function public.noteer(p_tekst text) returns void
language sql security definer set search_path = '' as $$
  insert into public.logboek (wie, tekst) values (public.mijn_naam(), p_tekst);
$$;

-- --- profiel -----------------------------------------------------------

-- Wordt door de app aangeroepen direct na het inloggen. De allereerste
-- gebruiker (zolang er geen beheerder bestaat) wordt beheerder.
create or replace function public.start_profiel(p_naam text default null)
returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_rij public.profiles;
  v_naam text := btrim(regexp_replace(coalesce(p_naam, ''), '\s+', ' ', 'g'));
begin
  if v_uid is null then raise exception 'Niet ingelogd'; end if;
  perform pg_advisory_xact_lock(7426001);
  insert into public.profiles (id, naam, is_admin)
  values (v_uid, left(v_naam, 80), not exists (select 1 from public.profiles where is_admin))
  on conflict (id) do nothing;
  if v_naam <> '' then
    update public.profiles set naam = left(v_naam, 80) where id = v_uid and naam = '';
  end if;
  select * into v_rij from public.profiles where id = v_uid;
  return v_rij;
end $$;

create or replace function public.zet_naam(p_naam text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_naam text := btrim(regexp_replace(coalesce(p_naam, ''), '\s+', ' ', 'g'));
begin
  if length(v_naam) < 2 then raise exception 'Vul je voor- en achternaam in'; end if;
  update public.profiles set naam = left(v_naam, 80) where id = (select auth.uid());
end $$;

create or replace function public.zet_meld_aanmeldingen(p_aan boolean) returns void
language sql security definer set search_path = '' as $$
  update public.profiles set meld_aanmeldingen = p_aan where id = (select auth.uid());
$$;

create or replace function public.admin_leden()
returns table (id uuid, naam text, email text, is_admin boolean, actief boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Alleen voor beheerders'; end if;
  return query
    select p.id, p.naam, u.email::text, p.is_admin, p.actief, p.created_at
      from public.profiles p join auth.users u on u.id = p.id
     order by lower(p.naam);
end $$;

create or replace function public.admin_zet_rol(p_profile uuid, p_admin boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_naam text;
begin
  if not public.is_admin() then raise exception 'Alleen voor beheerders'; end if;
  if not p_admin and not exists (
       select 1 from public.profiles where is_admin and actief and id <> p_profile) then
    raise exception 'Er moet minstens één beheerder overblijven';
  end if;
  update public.profiles set is_admin = p_admin where id = p_profile returning naam into v_naam;
  perform public.noteer(case when p_admin then 'maakte ' || v_naam || ' beheerder'
                             else 'trok de beheerrol van ' || v_naam || ' in' end);
end $$;

create or replace function public.admin_zet_actief(p_profile uuid, p_actief boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_naam text;
begin
  if not public.is_admin() then raise exception 'Alleen voor beheerders'; end if;
  if not p_actief and not exists (
       select 1 from public.profiles where is_admin and actief and id <> p_profile) then
    raise exception 'Er moet minstens één beheerder overblijven';
  end if;
  update public.profiles set actief = p_actief where id = p_profile returning naam into v_naam;
  perform public.noteer(case when p_actief then 'gaf ' || v_naam || ' weer toegang'
                             else 'blokkeerde ' || v_naam end);
end $$;

-- --- capaciteit --------------------------------------------------------

create or replace function public.check_concept_capaciteit() returns trigger
language plpgsql set search_path = '' as $$
declare cap smallint; bezet integer;
begin
  select plekken into cap from public.shifts where id = new.shift_id for update;
  if cap is null then raise exception 'Deze dienst bestaat niet meer'; end if;
  select count(*) into bezet from public.indeling_concept where shift_id = new.shift_id;
  if bezet >= cap then
    raise exception 'Deze dienst is al vol' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger trg_concept_capaciteit before insert on public.indeling_concept
  for each row execute function public.check_concept_capaciteit();

create or replace function public.check_plekken_verlagen() returns trigger
language plpgsql set search_path = '' as $$
declare bezet integer;
begin
  select count(*) into bezet from public.indeling_concept where shift_id = new.id;
  if new.plekken < bezet then
    raise exception 'Er staan al % mensen op deze dienst', bezet;
  end if;
  return new;
end $$;

create trigger trg_plekken before update of plekken on public.shifts
  for each row execute function public.check_plekken_verlagen();

-- --- meldingen ---------------------------------------------------------

create or replace function public.markeer_gelezen() returns void
language sql security definer set search_path = '' as $$
  update public.meldingen set gelezen_at = now()
   where profile_id = (select auth.uid()) and gelezen_at is null;
$$;

-- Melding aan alle beheerders behalve degene die de actie zelf uitvoert.
create or replace function public.meld_admins(p_soort text, p_titel text, p_tekst text, p_url text,
                                              p_alleen_aanmeldvoorkeur boolean default false)
returns void language sql security definer set search_path = '' as $$
  insert into public.meldingen (profile_id, soort, titel, tekst, url)
  select p.id, p_soort, p_titel, p_tekst, p_url
    from public.profiles p
   where p.is_admin and p.actief
     and p.id is distinct from (select auth.uid())
     and (not p_alleen_aanmeldvoorkeur or p.meld_aanmeldingen);
$$;

create or replace function public.trg_aanmelding_melden() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_naam text;
begin
  if tg_op = 'INSERT' then
    select naam into v_naam from public.profiles where id = new.profile_id;
    perform public.meld_admins('aanmelding', 'Nieuwe aanmelding',
      v_naam || ' kan op ' || public.dienst_label(new.shift_id), '/#/beheer', true);
    return new;
  else
    -- alleen melden als iemand zichzelf afmeldt terwijl de dienst nog bestaat
    if old.profile_id = (select auth.uid())
       and exists (select 1 from public.shifts where id = old.shift_id) then
      select naam into v_naam from public.profiles where id = old.profile_id;
      perform public.meld_admins('afmelding', 'Aanmelding ingetrokken',
        v_naam || ' kan toch niet op ' || public.dienst_label(old.shift_id), '/#/beheer', true);
    end if;
    return old;
  end if;
end $$;

create trigger trg_aanmelding_insert after insert on public.aanmeldingen
  for each row execute function public.trg_aanmelding_melden();
create trigger trg_aanmelding_delete after delete on public.aanmeldingen
  for each row execute function public.trg_aanmelding_melden();

-- Nieuwe meldingen: de push-functie een seintje geven.
create or replace function public.trg_push_seintje() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  select value into v_url from public.push_config where key = 'functie_url';
  select value into v_secret from public.push_config where key = 'secret';
  if v_url is not null and v_secret is not null then
    perform net.http_post(
      url := v_url,
      body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret));
  end if;
  return null;
exception when others then
  return null;  -- een mislukt seintje mag de actie zelf nooit blokkeren
end $$;

create trigger trg_meldingen_push after insert on public.meldingen
  for each statement execute function public.trg_push_seintje();

-- Door de push-functie: pak de wachtende meldingen (en vastgelopen pogingen).
create or replace function public.claim_push(p_max integer default 200)
returns setof public.meldingen
language sql security definer set search_path = '' as $$
  update public.meldingen m set push_status = 'bezig'
   where m.id in (
     select id from public.meldingen
      where push_status = 'wacht'
         or (push_status = 'bezig' and created_at < now() - interval '10 minutes'
             and created_at > now() - interval '1 day')
      order by id limit p_max for update skip locked)
  returning m.*;
$$;

create or replace function public.vapid_public_key() returns text
language sql stable security definer set search_path = '' as $$
  select value from public.push_config where key = 'vapid_public';
$$;

create or replace function public.bewaar_push(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Niet ingelogd'; end if;
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
  values ((select auth.uid()), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set profile_id = excluded.profile_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

create or replace function public.verwijder_push(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions
   where endpoint = p_endpoint and profile_id = (select auth.uid());
$$;

-- --- indelen en publiceren --------------------------------------------

create or replace function public.publiceer(p_edition uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_nieuw integer := 0; v_weg integer := 0; v_gemeld integer := 0; v_ed text;
begin
  if not public.is_admin() then raise exception 'Alleen voor beheerders'; end if;
  select naam into v_ed from public.editions where id = p_edition;

  with sh as (
    select s.id from public.shifts s join public.days d on d.id = s.day_id
     where d.edition_id = p_edition
  ), weg as (
    delete from public.toewijzingen t
     where t.shift_id in (select id from sh)
       and not exists (select 1 from public.indeling_concept c
                        where c.shift_id = t.shift_id and c.profile_id = t.profile_id)
    returning t.profile_id, t.shift_id
  ), nieuw as (
    insert into public.toewijzingen (shift_id, profile_id)
    select c.shift_id, c.profile_id from public.indeling_concept c
     where c.shift_id in (select id from sh)
       and not exists (select 1 from public.toewijzingen t
                        where t.shift_id = c.shift_id and t.profile_id = c.profile_id)
    returning profile_id, shift_id
  ), per as (
    select x.profile_id,
           count(*) filter (where x.nieuw) as n_nieuw,
           count(*) filter (where not x.nieuw) as n_weg,
           min(x.shift_id::text) filter (where x.nieuw) as s_nieuw,
           min(x.shift_id::text) filter (where not x.nieuw) as s_weg
      from (select profile_id, shift_id, true as nieuw from nieuw
            union all select profile_id, shift_id, false from weg) x
     group by x.profile_id
  ), gemeld as (
    insert into public.meldingen (profile_id, soort, titel, tekst, url)
    select r.profile_id, 'rooster',
      case when r.n_weg = 0 then 'Je bent ingedeeld'
           when r.n_nieuw = 0 then 'Dienst vervallen'
           else 'Je rooster is gewijzigd' end,
      case when r.n_weg = 0 and r.n_nieuw = 1 then public.dienst_label(r.s_nieuw::uuid)
           when r.n_weg = 0 then r.n_nieuw || ' diensten bij ' || v_ed || '. Bekijk ze in de app.'
           when r.n_nieuw = 0 and r.n_weg = 1 then 'Je hoeft niet meer te komen op ' || public.dienst_label(r.s_weg::uuid)
           when r.n_nieuw = 0 then r.n_weg || ' van je diensten zijn vervallen. Bekijk je rooster in de app.'
           else r.n_nieuw || ' nieuw, ' || r.n_weg || ' vervallen. Bekijk je rooster in de app.' end,
      '/#/mijn'
      from per r
    returning 1
  )
  select (select count(*) from nieuw), (select count(*) from weg), (select count(*) from gemeld)
    into v_nieuw, v_weg, v_gemeld;

  if v_nieuw + v_weg > 0 then
    perform public.noteer('publiceerde het rooster van ' || v_ed || ' (' || v_nieuw || ' nieuw, ' || v_weg || ' vervallen)');
  end if;
  return jsonb_build_object('nieuw', v_nieuw, 'vervallen', v_weg);
end $$;

create or replace function public.promoot(p_shift uuid, p_tekst text default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_n integer; v_tekst text := nullif(btrim(coalesce(p_tekst, '')), '');
begin
  if not public.is_admin() then raise exception 'Alleen voor beheerders'; end if;
  if not public.shift_open(p_shift) then
    raise exception 'Zet de editie eerst op Open; anders kan niemand zich aanmelden';
  end if;
  update public.shifts set gepromoot_at = now(), promo_tekst = v_tekst where id = p_shift;
  insert into public.meldingen (profile_id, soort, titel, tekst, url)
  select p.id, 'promotie', 'Hulp gezocht bij de bar',
         public.dienst_label(p_shift) || coalesce(' — ' || v_tekst, '. Kun jij helpen?'), '/#/diensten'
    from public.profiles p
   where p.actief and p.id <> (select auth.uid())
     and not exists (select 1 from public.toewijzingen t where t.shift_id = p_shift and t.profile_id = p.id)
     and not exists (select 1 from public.indeling_concept c where c.shift_id = p_shift and c.profile_id = p.id)
     and not exists (select 1 from public.aanmeldingen a where a.shift_id = p_shift and a.profile_id = p.id);
  get diagnostics v_n = row_count;
  perform public.noteer('stuurde een oproep voor ' || public.dienst_label(p_shift) || ' naar ' || v_n || ' mensen');
  return v_n;
end $$;

create or replace function public.stop_promotie(p_shift uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Alleen voor beheerders'; end if;
  update public.shifts set gepromoot_at = null, promo_tekst = null where id = p_shift;
end $$;

-- --- vervanger zoeken --------------------------------------------------

create or replace function public.zoek_vervanger(p_toewijzing uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.toewijzingen;
begin
  select * into v from public.toewijzingen where id = p_toewijzing;
  if v.id is null or v.profile_id <> (select auth.uid()) then raise exception 'Dit is niet jouw dienst'; end if;
  if v.status = 'zoekt_vervanger' then return; end if;
  update public.toewijzingen set status = 'zoekt_vervanger' where id = p_toewijzing;
  insert into public.meldingen (profile_id, soort, titel, tekst, url)
  select p.id, 'vervanger', 'Vervanger gezocht',
         public.mijn_naam() || ' zoekt iemand voor ' || public.dienst_label(v.shift_id),
         case when p.is_admin then '/#/beheer' else '/#/diensten' end
    from public.profiles p
   where p.actief and p.id <> v.profile_id
     and not exists (select 1 from public.toewijzingen t where t.shift_id = v.shift_id and t.profile_id = p.id);
  perform public.noteer('zoekt een vervanger voor ' || public.dienst_label(v.shift_id));
end $$;

create or replace function public.houd_dienst(p_toewijzing uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.toewijzingen;
begin
  select * into v from public.toewijzingen where id = p_toewijzing;
  if v.id is null or (v.profile_id <> (select auth.uid()) and not public.is_admin()) then
    raise exception 'Dit is niet jouw dienst';
  end if;
  update public.toewijzingen set status = 'ingedeeld' where id = p_toewijzing;
  delete from public.vervang_aanbod where toewijzing_id = p_toewijzing;
  perform public.noteer('draait ' || public.dienst_label(v.shift_id) || ' toch zelf');
end $$;

create or replace function public.bied_aan(p_toewijzing uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.toewijzingen; v_uid uuid := (select auth.uid());
begin
  if not public.is_actief() then raise exception 'Geen toegang'; end if;
  select * into v from public.toewijzingen where id = p_toewijzing;
  if v.id is null or v.status <> 'zoekt_vervanger' then raise exception 'Er wordt geen vervanger meer gezocht'; end if;
  if v.profile_id = v_uid then raise exception 'Dit is je eigen dienst'; end if;
  if exists (select 1 from public.toewijzingen where shift_id = v.shift_id and profile_id = v_uid) then
    raise exception 'Je staat zelf al op deze dienst';
  end if;
  insert into public.vervang_aanbod (toewijzing_id, profile_id) values (p_toewijzing, v_uid)
  on conflict do nothing;
  perform public.meld_admins('aanbod', 'Vervanger gevonden?',
    public.mijn_naam() || ' wil ' || public.dienst_label(v.shift_id) || ' overnemen. Keur het goed in Beheer.',
    '/#/beheer');
end $$;

create or replace function public.trek_aanbod_in(p_toewijzing uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.vervang_aanbod
   where toewijzing_id = p_toewijzing and profile_id = (select auth.uid());
$$;

create or replace function public.keur_vervanging(p_toewijzing uuid, p_profile uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.toewijzingen; v_oud text; v_nieuw text;
begin
  if not public.is_admin() then raise exception 'Alleen voor beheerders'; end if;
  select * into v from public.toewijzingen where id = p_toewijzing for update;
  if v.id is null then raise exception 'Deze toewijzing bestaat niet meer'; end if;
  if exists (select 1 from public.toewijzingen where shift_id = v.shift_id and profile_id = p_profile) then
    raise exception 'Deze persoon staat al op deze dienst';
  end if;
  select naam into v_oud from public.profiles where id = v.profile_id;
  select naam into v_nieuw from public.profiles where id = p_profile;

  delete from public.vervang_aanbod where toewijzing_id = p_toewijzing;
  delete from public.indeling_concept where shift_id = v.shift_id and profile_id in (v.profile_id, p_profile);
  update public.toewijzingen
     set profile_id = p_profile, status = 'ingedeeld', herinnerd_at = null
   where id = p_toewijzing;
  insert into public.indeling_concept (shift_id, profile_id) values (v.shift_id, p_profile);

  insert into public.meldingen (profile_id, soort, titel, tekst, url) values
    (p_profile, 'rooster', 'Je neemt een dienst over',
     public.dienst_label(v.shift_id) || ' — overgenomen van ' || v_oud, '/#/mijn'),
    (v.profile_id, 'rooster', 'Je dienst is overgenomen',
     v_nieuw || ' draait ' || public.dienst_label(v.shift_id) || ' voor je', '/#/mijn');
  perform public.noteer('keurde goed: ' || v_nieuw || ' neemt ' || public.dienst_label(v.shift_id) || ' over van ' || v_oud);
end $$;

-- --- herinnering de dag vooraf (elk uur gecontroleerd, verstuurd om 18.00) ---

create or replace function public.stuur_herinneringen() returns void
language plpgsql security definer set search_path = '' as $$
declare v_nu timestamp := now() at time zone 'Europe/Amsterdam';
begin
  if extract(hour from v_nu) <> 18 then return; end if;
  with doel as (
    select t.id, t.profile_id, t.shift_id
      from public.toewijzingen t
      join public.shifts s on s.id = t.shift_id
      join public.days d on d.id = s.day_id
      join public.editions e on e.id = d.edition_id
     where e.status = 'open' and d.datum = v_nu::date + 1 and t.herinnerd_at is null
  ), gemarkeerd as (
    update public.toewijzingen t set herinnerd_at = now()
      from doel where doel.id = t.id returning doel.profile_id, doel.shift_id
  )
  insert into public.meldingen (profile_id, soort, titel, tekst, url)
  select profile_id, 'herinnering', 'Morgen heb je bardienst',
         public.dienst_label(shift_id) || '. Fijn dat je er bent!', '/#/mijn'
    from gemarkeerd;
end $$;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'bardienst-herinneringen';
  perform cron.schedule('bardienst-herinneringen', '0 * * * *', 'select public.stuur_herinneringen()');
end $$;

-- --- rechten -----------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.aanmeldingen enable row level security;
alter table public.indeling_concept enable row level security;
alter table public.toewijzingen enable row level security;
alter table public.vervang_aanbod enable row level security;
alter table public.meldingen enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_config enable row level security;
alter table public.logboek enable row level security;

drop policy if exists editions_all on public.editions;
drop policy if exists days_all on public.days;
drop policy if exists shifts_all on public.shifts;

create policy editions_lezen on public.editions for select to authenticated
  using ((status = 'open' and (select public.is_actief())) or (select public.is_admin()));
create policy editions_beheer_i on public.editions for insert to authenticated with check ((select public.is_admin()));
create policy editions_beheer_u on public.editions for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy editions_beheer_d on public.editions for delete to authenticated using ((select public.is_admin()));

create policy days_lezen on public.days for select to authenticated using ((select public.is_actief()));
create policy days_beheer_i on public.days for insert to authenticated with check ((select public.is_admin()));
create policy days_beheer_u on public.days for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy days_beheer_d on public.days for delete to authenticated using ((select public.is_admin()));

create policy shifts_lezen on public.shifts for select to authenticated using ((select public.is_actief()));
create policy shifts_beheer_i on public.shifts for insert to authenticated with check ((select public.is_admin()));
create policy shifts_beheer_u on public.shifts for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy shifts_beheer_d on public.shifts for delete to authenticated using ((select public.is_admin()));

-- Namen zijn zichtbaar voor ingelogde, actieve vrijwilligers. Wijzigen gaat via functies.
create policy profiles_lezen on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_actief()));

create policy aanmeldingen_lezen on public.aanmeldingen for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_admin()));
create policy aanmeldingen_zelf on public.aanmeldingen for insert to authenticated
  with check (profile_id = (select auth.uid()) and (select public.is_actief()) and public.shift_open(shift_id));
create policy aanmeldingen_weg on public.aanmeldingen for delete to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_admin()));

create policy concept_lezen on public.indeling_concept for select to authenticated using ((select public.is_admin()));
create policy concept_i on public.indeling_concept for insert to authenticated with check ((select public.is_admin()));
create policy concept_d on public.indeling_concept for delete to authenticated using ((select public.is_admin()));

create policy toewijzingen_lezen on public.toewijzingen for select to authenticated using ((select public.is_actief()));

create policy aanbod_lezen on public.vervang_aanbod for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_admin()));

create policy meldingen_lezen on public.meldingen for select to authenticated
  using (profile_id = (select auth.uid()));

create policy push_lezen on public.push_subscriptions for select to authenticated
  using (profile_id = (select auth.uid()));

create policy logboek_lezen on public.logboek for select to authenticated using ((select public.is_admin()));

revoke all on public.push_config from anon, authenticated;
revoke all on all tables in schema public from anon;

-- Functies: niets voor anonieme bezoekers; interne functies ook niet voor ingelogden.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function
  public.claim_push(integer), public.stuur_herinneringen(), public.noteer(text),
  public.meld_admins(text, text, text, text, boolean),
  public.trg_push_seintje(), public.trg_aanmelding_melden(),
  public.check_concept_capaciteit(), public.check_plekken_verlagen()
  from authenticated;

-- --- realtime ----------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['editions', 'days', 'shifts', 'profiles', 'aanmeldingen',
                           'indeling_concept', 'toewijzingen', 'vervang_aanbod', 'meldingen'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- --- push-instellingen -------------------------------------------------
-- Het geheim wordt hier willekeurig aangemaakt. De VAPID-sleutels maakt de
-- edge function "push" zelf aan bij de eerste aanroep. Zet daarna nog één rij:
--   insert into public.push_config values
--     ('functie_url', 'https://<project-ref>.supabase.co/functions/v1/push');

insert into public.push_config (key, value)
values ('secret', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;
