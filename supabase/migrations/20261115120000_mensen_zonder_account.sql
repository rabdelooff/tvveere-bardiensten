-- =====================================================================
-- Mensen zonder account, en mensen verwijderen.
--   * De beheerder kan iemand toevoegen die geen e-mailadres heeft of
--     zich niet heeft aangemeld. Zo iemand kan niet inloggen en krijgt
--     geen meldingen: de beheerder informeert die persoon zelf.
--   * De beheerder kan mensen verwijderen (met of zonder account).
-- =====================================================================

-- Een profiel hoorde tot nu toe altijd bij een account. Voor handmatig
-- toegevoegde mensen geldt dat niet. De koppeling met het account (en het
-- meeverwijderen als het account verdwijnt) blijft via account_id bestaan.
alter table public.profiles add column handmatig boolean not null default false;
alter table public.profiles drop constraint profiles_id_fkey;
alter table public.profiles
  add column account_id uuid generated always as (case when handmatig then null else id end) stored
  references auth.users (id) on delete cascade;
comment on column public.profiles.handmatig is 'Door de beheerder toegevoegd; heeft geen account en krijgt geen meldingen.';

-- --- toevoegen, hernoemen, verwijderen ---------------------------------

create or replace function public.admin_voeg_persoon(p_naam text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_naam text := left(btrim(regexp_replace(coalesce(p_naam, ''), '\s+', ' ', 'g')), 80);
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'Alleen voor beheerders'; end if;
  if length(v_naam) < 2 then raise exception 'Vul een naam in'; end if;
  if exists (select 1 from public.profiles where lower(naam) = lower(v_naam)) then
    raise exception 'Er staat al iemand met deze naam in de lijst';
  end if;
  insert into public.profiles (id, naam, handmatig) values (gen_random_uuid(), v_naam, true)
  returning id into v_id;
  perform public.noteer('voegde ' || v_naam || ' toe (zonder account)');
  return v_id;
end $$;

create or replace function public.admin_hernoem(p_profile uuid, p_naam text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_naam text := left(btrim(regexp_replace(coalesce(p_naam, ''), '\s+', ' ', 'g')), 80);
  v_oud text;
begin
  if not public.is_admin() then raise exception 'Alleen voor beheerders'; end if;
  if length(v_naam) < 2 then raise exception 'Vul een naam in'; end if;
  select naam into v_oud from public.profiles where id = p_profile and handmatig;
  if v_oud is null then raise exception 'Alleen de naam van iemand zonder account kun je hier wijzigen'; end if;
  if exists (select 1 from public.profiles where lower(naam) = lower(v_naam) and id <> p_profile) then
    raise exception 'Er staat al iemand met deze naam in de lijst';
  end if;
  update public.profiles set naam = v_naam where id = p_profile;
  if v_oud <> v_naam then perform public.noteer('hernoemde ' || v_oud || ' naar ' || v_naam); end if;
end $$;

-- Verwijdert de persoon met alle aanmeldingen, indelingen, opmerkingen en
-- meldingen. Bij iemand met een account verdwijnt ook het account zelf.
create or replace function public.admin_verwijder(p_profile uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.profiles;
begin
  if not public.is_admin() then raise exception 'Alleen voor beheerders'; end if;
  if p_profile = (select auth.uid()) then raise exception 'Je kunt jezelf niet verwijderen'; end if;
  select * into v from public.profiles where id = p_profile;
  if v.id is null then raise exception 'Deze persoon bestaat niet meer'; end if;

  delete from public.profiles where id = p_profile;
  if not v.handmatig then
    delete from auth.users where id = p_profile;
  end if;
  perform public.noteer('verwijderde ' || coalesce(nullif(v.naam, ''), 'iemand zonder naam')
    || case when v.handmatig then ' (zonder account)' else ' en het bijbehorende account' end);
end $$;

-- Ledenlijst voor beheerders: nu ook mensen zonder account (e-mail is dan leeg).
drop function public.admin_leden();
create function public.admin_leden()
returns table (id uuid, naam text, email text, is_admin boolean, actief boolean,
               created_at timestamptz, handmatig boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Alleen voor beheerders'; end if;
  return query
    select p.id, p.naam, u.email::text, p.is_admin, p.actief, p.created_at, p.handmatig
      from public.profiles p left join auth.users u on u.id = p.id
     order by lower(p.naam);
end $$;

-- Een oproep gaat alleen naar mensen die hem ook kunnen ontvangen.
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
   where p.actief and not p.handmatig and p.id <> (select auth.uid())
     and not exists (select 1 from public.toewijzingen t where t.shift_id = p_shift and t.profile_id = p.id)
     and not exists (select 1 from public.indeling_concept c where c.shift_id = p_shift and c.profile_id = p.id)
     and not exists (select 1 from public.aanmeldingen a where a.shift_id = p_shift and a.profile_id = p.id);
  get diagnostics v_n = row_count;
  perform public.noteer('stuurde een oproep voor ' || public.dienst_label(p_shift) || ' naar ' || v_n || ' mensen');
  return v_n;
end $$;

-- --- rechten -----------------------------------------------------------

revoke execute on function
  public.admin_voeg_persoon(text), public.admin_hernoem(uuid, text),
  public.admin_verwijder(uuid), public.admin_leden()
  from public, anon;
grant execute on function
  public.admin_voeg_persoon(text), public.admin_hernoem(uuid, text),
  public.admin_verwijder(uuid), public.admin_leden()
  to authenticated, service_role;
