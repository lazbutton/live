# Plan : Système d'Analytics pour les Événements

## Objectif

Créer un système d'analytics efficace pour les événements qui minimise les requêtes à la base de données tout en stockant un maximum d'informations pertinentes.

## Stratégie d'Optimisation

### 1. Agrégation des Données
- Stocker des données pré-agrégées plutôt que de calculer à chaque fois
- Mettre à jour les agrégations en temps réel ou par batch
- Utiliser des vues matérialisées PostgreSQL pour les calculs complexes

### 2. Mise en Cache
- Cache en mémoire pour les données fréquemment consultées
- Cache Redis pour les statistiques en temps réel
- Invalidation intelligente du cache lors des mises à jour

### 3. Événements Asynchrones
- Utiliser des queues (Supabase Edge Functions + pg_cron) pour traiter les analytics
- Découpler l'écriture des événements de leur traitement analytics

---

## Table : `event_analytics`

Table principale pour stocker les analytics agrégées par événement.

```sql
CREATE TABLE event_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  
  -- Période d'agrégation
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  period_type TEXT NOT NULL CHECK (period_type IN ('hour', 'day', 'week', 'month', 'all_time')),
  
  -- Métriques de vues
  views_count INTEGER DEFAULT 0,
  unique_views_count INTEGER DEFAULT 0, -- Utilisateurs uniques
  
  -- Métriques d'engagement
  clicks_count INTEGER DEFAULT 0, -- Clics sur le bouton "En savoir plus"
  shares_count INTEGER DEFAULT 0,
  favorites_count INTEGER DEFAULT 0,
  
  -- Métriques de conversion (si applicable)
  ticket_clicks INTEGER DEFAULT 0, -- Clics sur les liens de billetterie
  external_url_clicks INTEGER DEFAULT 0,
  
  -- Métriques temporelles
  avg_time_on_page_seconds DECIMAL(10, 2),
  bounce_rate DECIMAL(5, 4), -- Taux de rebond (0.0000 à 1.0000)
  
  -- Détails par source de trafic
  traffic_sources JSONB DEFAULT '{}'::jsonb, -- { 'direct': 10, 'facebook': 5, 'instagram': 3 }
  
  -- Détails par appareil
  device_types JSONB DEFAULT '{}'::jsonb, -- { 'mobile': 15, 'desktop': 3, 'tablet': 1 }
  
  -- Données démographiques (si disponibles)
  age_groups JSONB DEFAULT '{}'::jsonb, -- { '18-24': 5, '25-34': 10, ... }
  genders JSONB DEFAULT '{}'::jsonb, -- { 'male': 10, 'female': 9 }
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Index pour performance
  UNIQUE(event_id, period_start, period_type)
);

CREATE INDEX idx_event_analytics_event_id ON event_analytics(event_id);
CREATE INDEX idx_event_analytics_period ON event_analytics(period_start, period_end);
```

---

## Table : `event_analytics_events`

Table pour stocker les événements analytics individuels (logs bruts optionnels, pour analyse approfondie).

**Note**: Cette table peut devenir volumineuse. Considérer une rétention limitée (ex: 90 jours) ou l'archivage.

```sql
CREATE TABLE event_analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  
  -- Type d'événement analytics
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'click', 'share', 'favorite', 'external_click', 'ticket_click')),
  
  -- Données utilisateur (anonymisées ou via session)
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- NULL si anonyme
  session_id TEXT, -- ID de session pour tracking anonyme
  
  -- Contexte de l'événement
  referrer TEXT, -- URL de provenance
  user_agent TEXT, -- User agent pour détecter device/os
  ip_address INET, -- Optionnel, pour géolocalisation
  
  -- Données techniques
  page_url TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  
  -- Métadonnées additionnelles
  metadata JSONB DEFAULT '{}'::jsonb, -- Données flexibles
  
  -- Index pour performance
  INDEX idx_analytics_events_event_id ON event_analytics_events(event_id, timestamp);
  INDEX idx_analytics_events_type ON event_analytics_events(event_type, timestamp);
);

-- Partition par mois pour optimiser les requêtes (optionnel mais recommandé pour gros volumes)
-- Voir: https://www.postgresql.org/docs/current/ddl-partitioning.html
```

---

## Table : `event_analytics_summary`

Table pour les statistiques globales par événement (vue consolidée, mise à jour en temps quasi-réel).

```sql
CREATE TABLE event_analytics_summary (
  event_id UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  
  -- Totaux depuis le début
  total_views INTEGER DEFAULT 0,
  total_unique_views INTEGER DEFAULT 0,
  total_clicks INTEGER DEFAULT 0,
  total_shares INTEGER DEFAULT 0,
  total_favorites INTEGER DEFAULT 0,
  total_ticket_clicks INTEGER DEFAULT 0,
  total_external_clicks INTEGER DEFAULT 0,
  
  -- Statistiques calculées
  avg_time_on_page_seconds DECIMAL(10, 2),
  bounce_rate DECIMAL(5, 4),
  
  -- Pics de trafic
  peak_hour INTEGER, -- Heure (0-23) avec le plus de trafic
  peak_day TEXT, -- Jour de la semaine avec le plus de trafic
  
  -- Dernières 24h (pour dashboard en temps réel)
  views_24h INTEGER DEFAULT 0,
  unique_views_24h INTEGER DEFAULT 0,
  clicks_24h INTEGER DEFAULT 0,
  
  -- Dernières 7 jours
  views_7d INTEGER DEFAULT 0,
  unique_views_7d INTEGER DEFAULT 0,
  
  -- Dernières 30 jours
  views_30d INTEGER DEFAULT 0,
  unique_views_30d INTEGER DEFAULT 0,
  
  -- Données agrégées par source
  traffic_sources JSONB DEFAULT '{}'::jsonb,
  device_types JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  first_view_at TIMESTAMPTZ,
  last_view_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Fonctions PostgreSQL pour Agrégation

### Fonction : Agréger les événements analytics

```sql
CREATE OR REPLACE FUNCTION aggregate_event_analytics(
  p_event_id UUID,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ,
  p_period_type TEXT
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_views_count INTEGER;
  v_unique_views_count INTEGER;
  v_clicks_count INTEGER;
  v_shares_count INTEGER;
  v_favorites_count INTEGER;
  v_ticket_clicks INTEGER;
  v_external_clicks INTEGER;
  v_traffic_sources JSONB;
  v_device_types JSONB;
BEGIN
  -- Compter les vues
  SELECT COUNT(*), COUNT(DISTINCT COALESCE(user_id::text, session_id))
  INTO v_views_count, v_unique_views_count
  FROM event_analytics_events
  WHERE event_id = p_event_id
    AND event_type = 'view'
    AND timestamp >= p_period_start
    AND timestamp < p_period_end;

  -- Compter les clics
  SELECT COUNT(*)
  INTO v_clicks_count
  FROM event_analytics_events
  WHERE event_id = p_event_id
    AND event_type = 'click'
    AND timestamp >= p_period_start
    AND timestamp < p_period_end;

  -- Compter les partages
  SELECT COUNT(*)
  INTO v_shares_count
  FROM event_analytics_events
  WHERE event_id = p_event_id
    AND event_type = 'share'
    AND timestamp >= p_period_start
    AND timestamp < p_period_end;

  -- Compter les favoris
  SELECT COUNT(*)
  INTO v_favorites_count
  FROM event_analytics_events
  WHERE event_id = p_event_id
    AND event_type = 'favorite'
    AND timestamp >= p_period_start
    AND timestamp < p_period_end;

  -- Compter les clics tickets
  SELECT COUNT(*)
  INTO v_ticket_clicks
  FROM event_analytics_events
  WHERE event_id = p_event_id
    AND event_type = 'ticket_click'
    AND timestamp >= p_period_start
    AND timestamp < p_period_end;

  -- Compter les clics externes
  SELECT COUNT(*)
  INTO v_external_clicks
  FROM event_analytics_events
  WHERE event_id = p_event_id
    AND event_type = 'external_click'
    AND timestamp >= p_period_start
    AND timestamp < p_period_end;

  -- Agréger les sources de trafic
  SELECT jsonb_object_agg(source, count)
  INTO v_traffic_sources
  FROM (
    SELECT 
      COALESCE(referrer, 'direct') as source,
      COUNT(*) as count
    FROM event_analytics_events
    WHERE event_id = p_event_id
      AND timestamp >= p_period_start
      AND timestamp < p_period_end
    GROUP BY source
  ) sub;

  -- Agréger les types d'appareils (simplifié, nécessite parsing user_agent)
  -- À implémenter avec une fonction helper pour parser user_agent

  -- Insérer ou mettre à jour l'agrégation
  INSERT INTO event_analytics (
    event_id,
    period_start,
    period_end,
    period_type,
    views_count,
    unique_views_count,
    clicks_count,
    shares_count,
    favorites_count,
    ticket_clicks,
    external_url_clicks,
    traffic_sources,
    device_types,
    updated_at
  )
  VALUES (
    p_event_id,
    p_period_start,
    p_period_end,
    p_period_type,
    COALESCE(v_views_count, 0),
    COALESCE(v_unique_views_count, 0),
    COALESCE(v_clicks_count, 0),
    COALESCE(v_shares_count, 0),
    COALESCE(v_favorites_count, 0),
    COALESCE(v_ticket_clicks, 0),
    COALESCE(v_external_clicks, 0),
    COALESCE(v_traffic_sources, '{}'::jsonb),
    '{}'::jsonb, -- À implémenter
    NOW()
  )
  ON CONFLICT (event_id, period_start, period_type)
  DO UPDATE SET
    views_count = EXCLUDED.views_count,
    unique_views_count = EXCLUDED.unique_views_count,
    clicks_count = EXCLUDED.clicks_count,
    shares_count = EXCLUDED.shares_count,
    favorites_count = EXCLUDED.favorites_count,
    ticket_clicks = EXCLUDED.ticket_clicks,
    external_url_clicks = EXCLUDED.external_url_clicks,
    traffic_sources = EXCLUDED.traffic_sources,
    device_types = EXCLUDED.device_types,
    updated_at = NOW();
END;
$$;
```

### Fonction : Mettre à jour le résumé global

```sql
CREATE OR REPLACE FUNCTION update_event_analytics_summary(p_event_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_views INTEGER;
  v_total_unique_views INTEGER;
  v_total_clicks INTEGER;
  v_total_shares INTEGER;
  v_total_favorites INTEGER;
  v_total_ticket_clicks INTEGER;
  v_total_external_clicks INTEGER;
  v_views_24h INTEGER;
  v_unique_views_24h INTEGER;
  v_clicks_24h INTEGER;
  v_views_7d INTEGER;
  v_unique_views_7d INTEGER;
  v_views_30d INTEGER;
  v_unique_views_30d INTEGER;
  v_traffic_sources JSONB;
  v_first_view_at TIMESTAMPTZ;
  v_last_view_at TIMESTAMPTZ;
BEGIN
  -- Totaux depuis le début
  SELECT 
    COUNT(*) FILTER (WHERE event_type = 'view'),
    COUNT(DISTINCT COALESCE(user_id::text, session_id)) FILTER (WHERE event_type = 'view'),
    COUNT(*) FILTER (WHERE event_type = 'click'),
    COUNT(*) FILTER (WHERE event_type = 'share'),
    COUNT(*) FILTER (WHERE event_type = 'favorite'),
    COUNT(*) FILTER (WHERE event_type = 'ticket_click'),
    COUNT(*) FILTER (WHERE event_type = 'external_click'),
    MIN(timestamp) FILTER (WHERE event_type = 'view'),
    MAX(timestamp) FILTER (WHERE event_type = 'view')
  INTO 
    v_total_views,
    v_total_unique_views,
    v_total_clicks,
    v_total_shares,
    v_total_favorites,
    v_total_ticket_clicks,
    v_total_external_clicks,
    v_first_view_at,
    v_last_view_at
  FROM event_analytics_events
  WHERE event_id = p_event_id;

  -- Dernières 24h
  SELECT 
    COUNT(*) FILTER (WHERE event_type = 'view'),
    COUNT(DISTINCT COALESCE(user_id::text, session_id)) FILTER (WHERE event_type = 'view'),
    COUNT(*) FILTER (WHERE event_type = 'click')
  INTO v_views_24h, v_unique_views_24h, v_clicks_24h
  FROM event_analytics_events
  WHERE event_id = p_event_id
    AND timestamp >= NOW() - INTERVAL '24 hours';

  -- Dernières 7 jours
  SELECT 
    COUNT(*) FILTER (WHERE event_type = 'view'),
    COUNT(DISTINCT COALESCE(user_id::text, session_id)) FILTER (WHERE event_type = 'view')
  INTO v_views_7d, v_unique_views_7d
  FROM event_analytics_events
  WHERE event_id = p_event_id
    AND timestamp >= NOW() - INTERVAL '7 days';

  -- Dernières 30 jours
  SELECT 
    COUNT(*) FILTER (WHERE event_type = 'view'),
    COUNT(DISTINCT COALESCE(user_id::text, session_id)) FILTER (WHERE event_type = 'view')
  INTO v_views_30d, v_unique_views_30d
  FROM event_analytics_events
  WHERE event_id = p_event_id
    AND timestamp >= NOW() - INTERVAL '30 days';

  -- Sources de trafic agrégées
  SELECT jsonb_object_agg(source, count)
  INTO v_traffic_sources
  FROM (
    SELECT 
      COALESCE(referrer, 'direct') as source,
      COUNT(*) as count
    FROM event_analytics_events
    WHERE event_id = p_event_id
    GROUP BY source
  ) sub;

  -- Insérer ou mettre à jour le résumé
  INSERT INTO event_analytics_summary (
    event_id,
    total_views,
    total_unique_views,
    total_clicks,
    total_shares,
    total_favorites,
    total_ticket_clicks,
    total_external_clicks,
    views_24h,
    unique_views_24h,
    clicks_24h,
    views_7d,
    unique_views_7d,
    views_30d,
    unique_views_30d,
    traffic_sources,
    first_view_at,
    last_view_at,
    updated_at
  )
  VALUES (
    p_event_id,
    COALESCE(v_total_views, 0),
    COALESCE(v_total_unique_views, 0),
    COALESCE(v_total_clicks, 0),
    COALESCE(v_total_shares, 0),
    COALESCE(v_total_favorites, 0),
    COALESCE(v_total_ticket_clicks, 0),
    COALESCE(v_total_external_clicks, 0),
    COALESCE(v_views_24h, 0),
    COALESCE(v_unique_views_24h, 0),
    COALESCE(v_clicks_24h, 0),
    COALESCE(v_views_7d, 0),
    COALESCE(v_unique_views_7d, 0),
    COALESCE(v_views_30d, 0),
    COALESCE(v_unique_views_30d, 0),
    COALESCE(v_traffic_sources, '{}'::jsonb),
    v_first_view_at,
    v_last_view_at,
    NOW()
  )
  ON CONFLICT (event_id)
  DO UPDATE SET
    total_views = EXCLUDED.total_views,
    total_unique_views = EXCLUDED.total_unique_views,
    total_clicks = EXCLUDED.total_clicks,
    total_shares = EXCLUDED.total_shares,
    total_favorites = EXCLUDED.favorites_count,
    total_ticket_clicks = EXCLUDED.total_ticket_clicks,
    total_external_clicks = EXCLUDED.total_external_clicks,
    views_24h = EXCLUDED.views_24h,
    unique_views_24h = EXCLUDED.unique_views_24h,
    clicks_24h = EXCLUDED.clicks_24h,
    views_7d = EXCLUDED.views_7d,
    unique_views_7d = EXCLUDED.unique_views_7d,
    views_30d = EXCLUDED.views_30d,
    unique_views_30d = EXCLUDED.unique_views_30d,
    traffic_sources = EXCLUDED.traffic_sources,
    first_view_at = COALESCE(EXCLUDED.first_view_at, event_analytics_summary.first_view_at),
    last_view_at = EXCLUDED.last_view_at,
    updated_at = NOW();
END;
$$;
```

---

## Triggers pour Mise à Jour Automatique

### Trigger : Mettre à jour le résumé après chaque événement analytics

```sql
CREATE OR REPLACE FUNCTION trigger_update_analytics_summary()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Mettre à jour le résumé de manière asynchrone (via pg_notify ou queue)
  -- Pour l'instant, mise à jour synchrone (peut être optimisé)
  PERFORM update_event_analytics_summary(NEW.event_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_analytics_event_insert
AFTER INSERT ON event_analytics_events
FOR EACH ROW
EXECUTE FUNCTION trigger_update_analytics_summary();
```

---

## Tâches Cron pour Agrégation

### Job 1 : Agréger les données horaires (toutes les heures)

```sql
-- Via pg_cron ou Supabase Edge Functions
SELECT cron.schedule(
  'aggregate-hourly-analytics',
  '0 * * * *', -- Toutes les heures
  $$
  SELECT aggregate_event_analytics(
    event_id,
    date_trunc('hour', timestamp) as period_start,
    date_trunc('hour', timestamp) + INTERVAL '1 hour' as period_end,
    'hour'
  )
  FROM event_analytics_events
  WHERE timestamp >= NOW() - INTERVAL '2 hours'
    AND timestamp < NOW() - INTERVAL '1 hour'
  GROUP BY event_id, date_trunc('hour', timestamp);
  $$
);
```

### Job 2 : Agréger les données quotidiennes (tous les jours à minuit)

```sql
SELECT cron.schedule(
  'aggregate-daily-analytics',
  '0 0 * * *', -- Tous les jours à minuit
  $$
  SELECT aggregate_event_analytics(
    event_id,
    date_trunc('day', timestamp) as period_start,
    date_trunc('day', timestamp) + INTERVAL '1 day' as period_end,
    'day'
  )
  FROM event_analytics_events
  WHERE timestamp >= date_trunc('day', NOW() - INTERVAL '2 days')
    AND timestamp < date_trunc('day', NOW() - INTERVAL '1 day')
  GROUP BY event_id, date_trunc('day', timestamp);
  $$
);
```

### Job 3 : Nettoyer les anciens événements (optionnel, archiver au lieu de supprimer)

```sql
-- Garder seulement 90 jours d'événements bruts
SELECT cron.schedule(
  'cleanup-old-analytics-events',
  '0 2 * * *', -- Tous les jours à 2h du matin
  $$
  DELETE FROM event_analytics_events
  WHERE timestamp < NOW() - INTERVAL '90 days';
  $$
);
```

---

## API Routes pour Tracking

### `/api/events/[id]/analytics/track`

Endpoint pour enregistrer un événement analytics.

```typescript
// app/api/events/[id]/analytics/track/route.ts
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { event_type, session_id, referrer, user_agent, metadata } = await request.json();
  
  // Validation
  const validTypes = ['view', 'click', 'share', 'favorite', 'external_click', 'ticket_click'];
  if (!validTypes.includes(event_type)) {
    return Response.json({ error: 'Invalid event type' }, { status: 400 });
  }
  
  // Récupérer user_id si authentifié
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  // Insérer l'événement (insérer directement, le trigger mettra à jour le résumé)
  const { error } = await supabase
    .from('event_analytics_events')
    .insert({
      event_id: params.id,
      event_type,
      user_id: user?.id || null,
      session_id: session_id || generateSessionId(),
      referrer,
      user_agent,
      metadata: metadata || {},
      timestamp: new Date().toISOString()
    });
  
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  
  return Response.json({ success: true });
}
```

---

## API Routes pour Lecture

### `/api/events/[id]/analytics`

Endpoint pour récupérer les analytics d'un événement.

```typescript
// app/api/events/[id]/analytics/route.ts
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  
  // Récupérer le résumé (une seule requête)
  const { data: summary, error } = await supabase
    .from('event_analytics_summary')
    .select('*')
    .eq('event_id', params.id)
    .single();
  
  if (error && error.code !== 'PGRST116') { // PGRST116 = not found
    return Response.json({ error: error.message }, { status: 500 });
  }
  
  // Si pas de résumé, retourner des valeurs par défaut
  if (!summary) {
    return Response.json({
      total_views: 0,
      total_unique_views: 0,
      total_clicks: 0,
      // ... autres métriques à 0
    });
  }
  
  return Response.json(summary);
}
```

### `/api/events/[id]/analytics/periods`

Endpoint pour récupérer les analytics par période (pour graphiques).

```typescript
// app/api/events/[id]/analytics/periods/route.ts
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(request.url);
  const period_type = searchParams.get('period_type') || 'day'; // hour, day, week, month
  const start_date = searchParams.get('start_date');
  const end_date = searchParams.get('end_date') || new Date().toISOString();
  
  const supabase = createClient();
  
  // Une seule requête pour toutes les périodes
  const { data, error } = await supabase
    .from('event_analytics')
    .select('*')
    .eq('event_id', params.id)
    .eq('period_type', period_type)
    .gte('period_start', start_date)
    .lte('period_end', end_date)
    .order('period_start', { ascending: true });
  
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  
  return Response.json(data || []);
}
```

---

## Mise en Cache Client-Side

### Utiliser React Query / SWR pour le cache

```typescript
// hooks/use-event-analytics.ts
import { useQuery } from '@tanstack/react-query';

export function useEventAnalytics(eventId: string) {
  return useQuery({
    queryKey: ['event-analytics', eventId],
    queryFn: async () => {
      const res = await fetch(`/api/events/${eventId}/analytics`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 5 * 60 * 1000, // Rafraîchir toutes les 5 minutes
  });
}
```

---

## Métriques Recommandées par Type d'Événement

### Métriques Essentielles (toujours collectées)
- Vues (views)
- Vues uniques
- Clics sur le bouton "En savoir plus"
- Clics sur les liens externes (billetterie, site web)

### Métriques Importantes (selon disponibilité)
- Partages sociaux
- Ajouts aux favoris
- Temps passé sur la page
- Taux de rebond
- Sources de trafic
- Types d'appareils (mobile/desktop/tablet)

### Métriques Avancées (si budget/temps disponible)
- Géolocalisation (pays, ville)
- Données démographiques (âge, genre)
- Parcours utilisateur (pages précédentes/suivantes)
- Taux de conversion (si tracking billets vendus)

---

## Optimisations Supplémentaires

### 1. Vues Matérialisées pour Rapports Complexes

```sql
CREATE MATERIALIZED VIEW event_analytics_top_events AS
SELECT 
  e.id as event_id,
  e.title,
  e.date,
  s.total_views,
  s.total_unique_views,
  s.total_clicks,
  s.views_24h,
  s.views_7d
FROM events e
LEFT JOIN event_analytics_summary s ON s.event_id = e.id
WHERE e.status = 'approved'
ORDER BY s.total_views DESC NULLS LAST
LIMIT 100;

-- Rafraîchir toutes les heures
REFRESH MATERIALIZED VIEW CONCURRENTLY event_analytics_top_events;
```

### 2. Compression des Anciennes Données

Utiliser TimescaleDB (extension PostgreSQL) pour compresser automatiquement les anciennes données analytics.

### 3. Sampling pour Événements à Fort Trafic

Si un événement dépasse un certain seuil de vues (ex: 10 000/jour), considérer un échantillonnage (sampling) pour réduire le volume de données.

---

## Phases d'Implémentation

### Phase 1 : Fondations (Priorité Haute)
1. ✅ Créer les tables `event_analytics_summary` et `event_analytics_events`
2. ✅ Implémenter l'endpoint de tracking `/api/events/[id]/analytics/track`
3. ✅ Implémenter l'endpoint de lecture `/api/events/[id]/analytics`
4. ✅ Intégrer le tracking dans les pages d'événements

### Phase 2 : Agrégation (Priorité Moyenne)
1. ✅ Créer les fonctions d'agrégation PostgreSQL
2. ✅ Créer le trigger de mise à jour automatique
3. ✅ Implémenter l'agrégation par périodes

### Phase 3 : Optimisation (Priorité Basse)
1. ✅ Mettre en place les jobs cron pour agrégation
2. ✅ Implémenter la mise en cache Redis (optionnel)
3. ✅ Créer les vues matérialisées pour rapports
4. ✅ Nettoyage automatique des anciennes données

---

## Notes de Performance

- **Table `event_analytics_events`** : Peut devenir volumineuse. Considérer le partitionnement ou l'archivage après 90 jours.
- **Requêtes fréquentes** : Toujours lire depuis `event_analytics_summary` (1 requête) plutôt que d'agréger à la volée.
- **Mise à jour du résumé** : Peut être asynchrone via une queue pour éviter de ralentir l'insertion des événements.
- **Index** : Créer des index sur les colonnes fréquemment filtrées (`event_id`, `timestamp`, `event_type`).

---

## Questions à Résoudre

1. **Rétention des données** : Combien de temps garder les événements bruts ?
2. **Géolocalisation** : Utiliser un service externe (ex: MaxMind GeoIP) ou simplement stocker l'IP ?
3. **Tracking anonyme vs authentifié** : Comment gérer le tracking des utilisateurs non connectés ?
4. **GDPR/Privacy** : Doit-on anonymiser les IP après X jours ? Consentement utilisateur pour tracking ?

---

## Références

- [PostgreSQL Window Functions](https://www.postgresql.org/docs/current/tutorial-window.html)
- [TimescaleDB](https://www.timescale.com/) pour analytics temporelles
- [pg_cron](https://github.com/citusdata/pg_cron) pour jobs schedulés
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions) pour traitement asynchrone

