-- Bardiensten · TV Veere — database-inrichting
-- Uitvoeren in Supabase → SQL Editor op een LEGE database.
-- Afgeleid van het live schema (project "Tennis bardiensten"), november 2026.
--
-- Let op: de RLS-policies zijn bewust open voor de anon-rol (geen inlogsysteem).
-- Wie de anon key kent, kan lezen en schrijven. Zie README, hoofdstuk 4.

create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------- tabellen

create table public.editions (
  id         uuid primary key default gen_random_uuid(),
  naam       text not null,
  status     text not null default 'concept'
             check (status in ('concept', 'open', 'gesloten')),
  created_at timestamptz not null default now()
);
comment on column public.editions.status is
  'concept = alleen in beheer zichtbaar; open = zichtbaar voor leden; gesloten = archief';

create table public.days (
  id         uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  datum      date not null,
  unique (edition_id, datum)
);
create index idx_days_edition on public.days (edition_id, datum);

create table public.shifts (
  id         uuid primary key default gen_random_uuid(),
  day_id     uuid not null references public.days(id) on delete cascade,
  post       text not null default 'Bar',
  start_tijd text not null,
  eind_tijd  text not null,
  plekken    smallint not null default 2 check (plekken >= 1 and plekken <= 12),
  created_at timestamptz not null default now()
);
create index idx_shifts_day on public.shifts (day_id);

create table public.people (
  id           uuid primary key default gen_random_uuid(),
  naam         text not null,
  naam_norm    text not null unique,
  created_at   timestamptz not null default now(),
  gearchiveerd boolean not null default false
);

create table public.assignments (
  id         uuid primary key default gen_random_uuid(),
  shift_id   uuid not null references public.shifts(id) on delete cascade,
  person_id  uuid not null references public.people(id) on delete cascade,
  status     text not null default 'ingedeeld'
             check (status in ('ingedeeld', 'zoekt_vervanger')),
  created_at timestamptz not null default now(),
  unique (shift_id, person_id)
);
create index idx_assign_shift  on public.assignments (shift_id);
create index idx_assign_person on public.assignments (person_id);

create table public.changelog (
  id         bigint generated always as identity primary key,
  edition_id uuid references public.editions(id) on delete set null,
  wie        text not null,
  tekst      text not null,
  beheer     boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_changelog_tijd on public.changelog (edition_id, created_at desc);

-- ------------------------------------------------------------------ view

create view public.v_diensten as
select s.id as shift_id,
       s.post,
       s.start_tijd,
       s.eind_tijd,
       s.plekken,
       d.id as day_id,
       d.datum,
       e.id as edition_id,
       e.naam as editie,
       e.status as editie_status,
       coalesce(a.bezet, 0::bigint) as bezet,
       s.plekken - coalesce(a.bezet, 0::bigint) as open_plekken,
       coalesce(a.zoekt, 0::bigint) > 0 as vervanger_gezocht
from public.shifts s
join public.days d on d.id = s.day_id
join public.editions e on e.id = d.edition_id
left join (
  select shift_id,
         count(*) as bezet,
         count(*) filter (where status = 'zoekt_vervanger') as zoekt
  from public.assignments
  group by shift_id
) a on a.shift_id = s.id;

-- ------------------------------------------------------- functies/triggers

-- Naam opschonen en normaliseren (hoofdletters/accenten negeren) voor de unieke check.
create function public.zet_naam_norm() returns trigger
language plpgsql as $$
begin
  new.naam := btrim(regexp_replace(new.naam, '\s+', ' ', 'g'));
  new.naam_norm := lower(extensions.unaccent(new.naam));
  return new;
end $$;

create trigger trg_naam_norm
  before insert or update of naam on public.people
  for each row execute function public.zet_naam_norm();

-- Nooit meer mensen op een dienst dan er plekken zijn; de rij-lock op shifts
-- voorkomt dat twee gelijktijdige inschrijvingen de laatste plek delen.
create function public.check_capaciteit() returns trigger
language plpgsql as $$
declare cap smallint; bezet integer;
begin
  select plekken into cap from public.shifts where id = new.shift_id for update;
  if cap is null then
    raise exception 'Deze dienst bestaat niet meer';
  end if;
  select count(*) into bezet from public.assignments where shift_id = new.shift_id;
  if bezet >= cap then
    raise exception 'Deze dienst is inmiddels vol' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger trg_capaciteit
  before insert on public.assignments
  for each row execute function public.check_capaciteit();

-- Aantal plekken mag niet onder het aantal ingedeelden zakken.
create function public.check_plekken_verlagen() returns trigger
language plpgsql as $$
declare bezet integer;
begin
  select count(*) into bezet from public.assignments where shift_id = new.id;
  if new.plekken < bezet then
    raise exception 'Er staan al % mensen op deze dienst', bezet;
  end if;
  return new;
end $$;

create trigger trg_plekken
  before update of plekken on public.shifts
  for each row execute function public.check_plekken_verlagen();

-- Twee personen samenvoegen: inschrijvingen van "van" gaan naar "naar";
-- dubbele inschrijvingen op dezelfde dienst vervallen.
create function public.voeg_samen(van uuid, naar uuid) returns void
language plpgsql as $$
begin
  if van = naar then
    return;
  end if;
  if not exists (select 1 from public.people where id = naar) then
    raise exception 'Doelpersoon bestaat niet';
  end if;

  delete from public.assignments a
   where a.person_id = van
     and exists (select 1 from public.assignments b
                  where b.person_id = naar and b.shift_id = a.shift_id);

  update public.assignments set person_id = naar where person_id = van;
  delete from public.people where id = van;
end $$;

-- ------------------------------------------------------- beveiliging (RLS)

alter table public.editions    enable row level security;
alter table public.days        enable row level security;
alter table public.shifts      enable row level security;
alter table public.people      enable row level security;
alter table public.assignments enable row level security;
alter table public.changelog   enable row level security;

create policy editions_all    on public.editions    for all to anon, authenticated using (true) with check (true);
create policy days_all        on public.days        for all to anon, authenticated using (true) with check (true);
create policy shifts_all      on public.shifts      for all to anon, authenticated using (true) with check (true);
create policy people_all      on public.people      for all to anon, authenticated using (true) with check (true);
create policy assignments_all on public.assignments for all to anon, authenticated using (true) with check (true);

-- Logboek is append-only: alleen lezen en toevoegen, nooit wijzigen of wissen.
create policy changelog_select on public.changelog for select to anon, authenticated using (true);
create policy changelog_insert on public.changelog for insert to anon, authenticated with check (true);

-- ---------------------------------------------------------------- realtime

alter publication supabase_realtime add table public.shifts, public.assignments, public.changelog;
