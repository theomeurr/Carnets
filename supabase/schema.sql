-- Schéma Folio pour Supabase.
--
-- À coller dans le SQL Editor du projet, une fois. Il crée les cinq tables,
-- les index de synchronisation et la sécurité par ligne.
--
-- Deux partis pris à connaître :
--
--  * Les identifiants sont des `text`, pas des `uuid` : ils sont fabriqués par
--    le client, qui doit pouvoir créer une note hors ligne sans demander la
--    permission à personne.
--
--  * Les dates sont des `bigint` en millisecondes, comme dans le client, et
--    non des `timestamptz`. La synchronisation compare des nombres des deux
--    côtés ; convertir à chaque passage inviterait les écarts d'arrondi.
--    C'est l'horloge de l'appareil qui fait foi — voir la remarque finale.

-- ---------------------------------------------------------------- tables

create table if not exists public.notebooks (
  id          text    not null,
  user_id     uuid    not null references auth.users (id) on delete cascade,
  name        text    not null,
  color       text    not null,
  created_at  bigint  not null,
  updated_at  bigint  not null,
  primary key (user_id, id)
);

create table if not exists public.sections (
  id          text    not null,
  user_id     uuid    not null references auth.users (id) on delete cascade,
  notebook_id text    not null,
  name        text    not null,
  created_at  bigint  not null,
  updated_at  bigint  not null,
  primary key (user_id, id)
);

create table if not exists public.pages (
  id          text    not null,
  user_id     uuid    not null references auth.users (id) on delete cascade,
  section_id  text    not null,
  title       text    not null default '',
  html        text    not null default '',
  text        text    not null default '',
  -- Renseigné quand la page est protégée : le serveur ne voit alors que du
  -- chiffré, et `title`, `html` et `text` restent vides.
  cipher      text,
  created_at  bigint  not null,
  updated_at  bigint  not null,
  primary key (user_id, id)
);

create table if not exists public.locks (
  id          text    not null,   -- l'identifiant de la cible protégée
  user_id     uuid    not null references auth.users (id) on delete cascade,
  scope       text    not null check (scope in ('notebook', 'section', 'page')),
  salt        text    not null,
  iterations  integer not null,
  verifier    text    not null,
  created_at  bigint  not null,
  updated_at  bigint  not null,
  primary key (user_id, id)
);

-- Les suppressions, gardées le temps que tous les appareils les voient.
-- Sans elles, un élément effacé ici reviendrait depuis un appareil qui l'a
-- encore : l'absence ne se distingue pas du « pas encore reçu ».
create table if not exists public.tombstones (
  id          text    not null,
  user_id     uuid    not null references auth.users (id) on delete cascade,
  kind        text    not null check (kind in ('notebook', 'section', 'page', 'lock')),
  deleted_at  bigint  not null,
  -- Une page et le verrou qui la protège partagent le même identifiant : le
  -- genre fait donc partie de la clé.
  primary key (user_id, kind, id)
);

-- ---------------------------------------------------------------- index

-- La synchronisation ne demande que « ce qui a changé depuis telle date ».
create index if not exists notebooks_sync_idx  on public.notebooks  (user_id, updated_at);
create index if not exists sections_sync_idx   on public.sections   (user_id, updated_at);
create index if not exists pages_sync_idx      on public.pages      (user_id, updated_at);
create index if not exists locks_sync_idx      on public.locks      (user_id, updated_at);
create index if not exists tombstones_sync_idx on public.tombstones (user_id, deleted_at);

-- ------------------------------------------------- sécurité par ligne

-- Sans ceci, la clé publique du client donnerait accès aux notes de tout le
-- monde. C'est la pièce à ne pas oublier.
alter table public.notebooks  enable row level security;
alter table public.sections   enable row level security;
alter table public.pages      enable row level security;
alter table public.locks      enable row level security;
alter table public.tombstones enable row level security;

do $$
declare t text;
begin
  foreach t in array array['notebooks', 'sections', 'pages', 'locks', 'tombstones'] loop
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    -- Chacun ne voit et n'écrit que ses propres lignes. `with check` couvre
    -- l'insertion et la mise à jour : impossible d'écrire au nom d'un autre.
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_owner', t
    );
  end loop;
end $$;

-- ------------------------------------------------- temps réel

-- Sans ceci, un appareil ne découvre les modifications qu'à sa vérification
-- suivante — jusqu'à une dizaine de secondes d'attente. Avec, il est prévenu
-- dès l'écriture et va chercher les données aussitôt.
--
-- Ce qui est diffusé n'est qu'un signal : l'application déclenche un tour de
-- synchronisation ordinaire, elle ne lit pas la charge utile. La sécurité par
-- ligne s'applique aussi ici — personne n'est prévenu des écritures d'autrui.
do $$
declare t text;
begin
  foreach t in array array['notebooks', 'sections', 'pages', 'locks', 'tombstones'] loop
    -- Idempotent : rejouer le script entier ne doit pas échouer.
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ------------------------------------------------- purge des traces

-- Les traces de suppression ne servent plus une fois que tous les appareils
-- les ont vues. Le client oublie les siennes au bout de 90 jours ; côté
-- serveur, à lancer de temps en temps (ou via pg_cron).
--
--   delete from public.tombstones
--   where deleted_at < (extract(epoch from now()) * 1000)::bigint
--                      - 90 * 24 * 60 * 60 * 1000;

-- ------------------------------------------------- une réserve honnête
--
-- Les dates viennent de l'horloge des appareils. Un appareil dont l'heure
-- avance de plusieurs heures verrait ses modifications l'emporter à tort sur
-- des versions pourtant plus récentes. Pour un usage personnel c'est sans
-- conséquence ; à plusieurs, il faudrait horodater côté serveur, ce qui
-- suppose de renoncer à écrire hors ligne sans passer par lui.
