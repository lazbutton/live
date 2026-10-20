-- Fiches d'artistes qui sont des titres d'événements recopiés (relevé du 2026-10-20).
--
-- Créées le 17/10/2026, avant que l'import découpe les plateaux (`splitArtistNames`,
-- lib/events/artist-names.ts) : une fiche au nom du plateau (« Alcest + 1ere Partie »,
-- « Assassin + Triptik »), du titre (« Pluto #1 : The Gnomes », « Panique!! ») ou d'une mention qui
-- n'est pas un artiste (« Atelier Jazzy », « Lucernaire Diffusion »). Liste avant → après et choix de
-- chaque fiche : MIGRATIONS_LOG.md (2026-10-20). Pour chaque fiche :
--   - premier nom : s'il existe déjà une fiche de ce nom (nom normalisé), ses événements y passent et la
--     fiche-titre est supprimée ; sinon la fiche-titre est renommée (même id : les liens de l'app, qui
--     ouvre une fiche par son id, restent bons ; le slug, donc l'URL /artists/<slug>, est recalculé par
--     le trigger) ;
--   - noms suivants (« A + B ») : fiche existante ou créée, reliée aux mêmes événements, après les
--     artistes déjà présents ;
--   - aucun nom (titre ou mention sans artiste) : fiche supprimée avec ses liens ; les autres artistes
--     de l'événement restent.
-- Une ligne `artist.title_cleanup` par fiche dans admin_audit_log (avant, après, événements).
-- Tags homonymes (« Razorlight », « Syd Matters »…) : non touchés.
--
-- Rejouable : seule une fiche encore présente avec l'id et le nom du relevé est traitée ; une fiche
-- renommée depuis à la main est laissée (NOTICE). Aucun effet sur une base sans ces fiches.

DO $$
DECLARE
    decision record;
    junk public.artists%ROWTYPE;
    target_id uuid;
    extra_name text;
    event_ids uuid[];
    ids_after uuid[];
    outcome text;
    renamed integer := 0;
    merged integer := 0;
    deleted integer := 0;
    created integer := 0;
BEGIN
    FOR decision IN
        SELECT d.id::uuid AS id, d.name, d.new_names::text[] AS new_names
        FROM (VALUES
            -- « X + 1ère partie » : la tête d'affiche (première partie non nommée).
            ('4030f77d-7e5d-417e-b253-8e6f54daa300', 'Alcest + 1ere Partie', '{Alcest}'),
            ('881daba5-1e64-46ad-9bde-3eee78a593e7', 'Jeanne Added + 1ère Partie', '{Jeanne Added}'),
            ('210a69b3-e61e-4120-93aa-13dba5982628', 'Les Louanges + 1ère Partie', '{Les Louanges}'),
            ('ea4f8b3f-06d8-40f7-b342-06460093a7d4', 'Luiza + 1ere Partie', '{Luiza}'),
            ('662bb851-71b5-4a1f-84c6-3be41353cc10', 'Razorlight + 1ère Partie', '{Razorlight}'),
            ('9e5c888f-3cc6-4fec-a590-5eb55a8a65f6', 'Robert Finley + 1ère Partie', '{Robert Finley}'),
            ('f62a75df-617a-41e9-a2c4-4e7226091788', 'Syd Matters + 1ere Partie', '{Syd Matters}'),
            -- Orthographe de la salle (« Zélie - Pop »).
            ('a8690b9e-32ec-4d45-98ae-1f9fc0b29451', 'Zelie + 1ere Partie', '{Zélie}'),
            ('04e2456f-e293-42b1-8601-7c302e9f1bcf', 'Zed Yun Pavarotti + 1ere Partie', '{Zed Yun Pavarotti}'),
            ('21ac1a07-9f8c-4421-986b-273080380086', 'Folie''s + 1ere Partie', '{Folie''s}'),
            -- Plateaux « A + B » : deux artistes.
            ('8f421d29-62a1-4f56-b590-21c077bfe0f4', 'Assassin + Triptik', '{Assassin,Triptik}'),
            ('493b3032-c24f-41ae-8a09-1087c370f041', 'La Jungle + Sodom & Sagesse', '{La Jungle,Sodom & Sagesse}'),
            -- Titres : l'artiste du titre (« The Gnomes est un quatuor… » ; « Carré » est le spectacle).
            ('2d8e0467-42c4-4e10-8541-b6db4106afbf', 'Pluto #1 : The Gnomes', '{The Gnomes}'),
            ('b3dddf20-fb36-43e8-8271-9ab31f3e83e5', 'Piche "Carré"', '{Piche}'),
            -- Titres sans artiste nommé (ni dans la description ni sur la page de la salle).
            ('459a4660-9ecc-47dc-8899-b155faf564a5', 'Le Cabaret Magnifique : 1926', '{}'),
            ('84bea37b-9ea7-4061-89c2-c90a01f79859', 'Coeur Gruyère - Ciné Concert', '{}'),
            ('8521f84e-5e9a-471f-815e-34ca7ab01ff2', 'Bubble Boum, Ça Chauffe sur le Ring', '{}'),
            ('c6595b28-8b22-4506-b53b-bf27fe3459d4', 'Panique!!', '{}'),
            -- Pas des artistes : ateliers (leurs chefs, Igor Ivanov et Franck Sallé, restent sur
            -- l'événement), animatrice d'atelier, diffuseur (la Cie les Modits reste).
            ('be0f2a46-02de-4366-84a4-31642bf2fb6c', 'Atelier Afro-Cubain', '{}'),
            ('34194e43-839d-41df-b2e7-bc4f280dd4eb', 'Atelier Jazzy', '{}'),
            ('63921016-8b2c-4b03-bf5d-f3e93827482c', 'Bahini Illustration', '{}'),
            ('86d756ba-bfa3-41c5-8c8e-5a2cde94662d', 'Lucernaire Diffusion', '{}')
        ) AS d(id, name, new_names)
    LOOP
        SELECT * INTO junk FROM public.artists AS a WHERE a.id = decision.id;
        IF NOT FOUND THEN
            CONTINUE; -- supprimée ou fusionnée (déjà traitée)
        END IF;
        IF public.normalize_entity_label(junk.name) <> public.normalize_entity_label(decision.name) THEN
            -- Déjà renommée par cette migration, sinon modifiée à la main depuis le relevé.
            IF cardinality(decision.new_names) = 0
               OR public.normalize_entity_label(junk.name) <> public.normalize_entity_label(decision.new_names[1]) THEN
                RAISE NOTICE 'Fiche « % » (relevée sous « % ») modifiée depuis : laissée telle quelle',
                    junk.name, decision.name;
            END IF;
            CONTINUE;
        END IF;

        SELECT coalesce(array_agg(DISTINCT ea.event_id), '{}') INTO event_ids
        FROM public.event_artists AS ea
        WHERE ea.artist_id = junk.id;
        ids_after := '{}';

        IF cardinality(decision.new_names) = 0 THEN
            DELETE FROM public.artists WHERE id = junk.id;
            outcome := 'deleted';
            deleted := deleted + 1;
        ELSE
            SELECT a.id INTO target_id
            FROM public.artists AS a
            WHERE a.id <> junk.id
              AND public.normalize_entity_label(a.name) = public.normalize_entity_label(decision.new_names[1])
            ORDER BY a.created_at, a.id
            LIMIT 1;

            IF target_id IS NULL THEN
                UPDATE public.artists SET name = decision.new_names[1] WHERE id = junk.id;
                target_id := junk.id;
                outcome := 'renamed';
                renamed := renamed + 1;
            ELSE
                -- Ce que la fiche-titre aurait en plus (vide au relevé) passe sur la vraie fiche.
                UPDATE public.artists AS a SET
                    short_description = coalesce(a.short_description, junk.short_description),
                    image_url = coalesce(a.image_url, junk.image_url),
                    website_url = coalesce(a.website_url, junk.website_url),
                    instagram_url = coalesce(a.instagram_url, junk.instagram_url),
                    soundcloud_url = coalesce(a.soundcloud_url, junk.soundcloud_url),
                    deezer_url = coalesce(a.deezer_url, junk.deezer_url),
                    artist_type_label = coalesce(a.artist_type_label, junk.artist_type_label),
                    origin_city = coalesce(a.origin_city, junk.origin_city),
                    tag_ids = ARRAY(SELECT DISTINCT unnest(a.tag_ids || junk.tag_ids))
                WHERE a.id = target_id
                  AND (junk.short_description IS NOT NULL OR junk.image_url IS NOT NULL
                       OR junk.website_url IS NOT NULL OR junk.instagram_url IS NOT NULL
                       OR junk.soundcloud_url IS NOT NULL OR junk.deezer_url IS NOT NULL
                       OR junk.artist_type_label IS NOT NULL OR junk.origin_city IS NOT NULL
                       OR cardinality(junk.tag_ids) > 0);
                INSERT INTO public.event_artists (event_id, artist_id, sort_index, role_label)
                SELECT ea.event_id, target_id, ea.sort_index, ea.role_label
                FROM public.event_artists AS ea
                WHERE ea.artist_id = junk.id
                ON CONFLICT (event_id, artist_id) DO NOTHING;
                DELETE FROM public.artists WHERE id = junk.id;
                outcome := 'merged';
                merged := merged + 1;
            END IF;
            ids_after := ids_after || target_id;

            FOREACH extra_name IN ARRAY decision.new_names[2:] LOOP
                SELECT a.id INTO target_id
                FROM public.artists AS a
                WHERE public.normalize_entity_label(a.name) = public.normalize_entity_label(extra_name)
                ORDER BY a.created_at, a.id
                LIMIT 1;
                IF target_id IS NULL THEN
                    INSERT INTO public.artists (name) VALUES (extra_name) RETURNING id INTO target_id;
                    created := created + 1;
                END IF;
                INSERT INTO public.event_artists (event_id, artist_id, sort_index)
                SELECT e.event_id, target_id,
                       coalesce((SELECT max(ea.sort_index) + 1 FROM public.event_artists AS ea
                                 WHERE ea.event_id = e.event_id), 0)
                FROM unnest(event_ids) AS e(event_id)
                ON CONFLICT (event_id, artist_id) DO NOTHING;
                ids_after := ids_after || target_id;
            END LOOP;
        END IF;

        INSERT INTO public.admin_audit_log (actor_user_id, actor_email, action, entity_type, entity_id, entity_label, metadata)
        VALUES (
            NULL,
            'migration:20261020233000_clean_title_artists',
            'artist.title_cleanup',
            'artist',
            junk.id,
            junk.name,
            jsonb_build_object(
                'outcome', outcome,
                'slug_before', junk.slug,
                'artists_after', coalesce((
                    SELECT jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'slug', a.slug)
                                     ORDER BY array_position(ids_after, a.id))
                    FROM public.artists AS a
                    WHERE a.id = ANY (ids_after)
                ), '[]'::jsonb),
                'event_ids', to_jsonb(event_ids),
                'via', 'migration'
            )
        );

        RAISE NOTICE '% → % (%, % événement(s))',
            junk.name,
            coalesce((SELECT string_agg(a.name || ' [' || a.slug || ']', ' + ' ORDER BY array_position(ids_after, a.id))
                      FROM public.artists AS a WHERE a.id = ANY (ids_after)), '—'),
            outcome,
            cardinality(event_ids);
    END LOOP;

    RAISE NOTICE 'Fiches-titres : % renommées, % fusionnées, % supprimées ; % fiches créées',
        renamed, merged, deleted, created;
END;
$$;
