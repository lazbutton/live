/**
 * Notification des suivis (U8), poussée par le cron `follows-digest` : chaque jour, à chacun, les
 * événements que ses lieux, organisateurs et artistes suivis ont publiés depuis son dernier message, et
 * ceux entrés au programme des festivals qu'il a en favori (un cœur sur un festival vaut suivi).
 * Fonctions pures, sans base (`follows-digest.test.mjs`) ; les lignes viennent de `follows_digest()`
 * (SQL, migrations 20261021142000 et 20261023160000), qui porte la règle : quels événements, depuis
 * quand, pour qui.
 *
 * - Un seul suivi a publié : « 2 nouveaux événements chez L’Astrolabe » (« avec » pour un artiste) ;
 *   un seul festival : « Fulgurances Électroniques #2 : 2 événements ajoutés au programme » ;
 * - plusieurs : « 3 nouveaux événements chez tes suivis ».
 * Corps : les deux premiers titres, puis « et 1 autre », comme les résumés (`digestBody`). Rien de
 * nouveau, pas de message. Toucher : la page du suivi s'il n'y en a qu'un, sinon l'onglet Favoris de
 * l'app (données : `followsDigestData`, contrat `docs/API_APP.md`, « Suivis »).
 */

import { digestBody, MAX_EVENT_IDS, shortTitle } from "./digest";

/** `festival` : un festival en favori (`event_likes`), sa fiche pour id. */
export type FollowTargetType = "location" | "organizer" | "artist" | "festival";

/** Une ligne de `follows_digest()` : un nouvel événement d'une cible que l'utilisateur suit. */
export interface FollowsDigestRow {
  user_id: string;
  event_id: string;
  event_title: string;
  event_date: string;
  target_type: FollowTargetType;
  target_id: string;
  target_name: string | null;
}

export interface FollowsDigestEvent {
  id: string;
  title: string;
  date: string;
}

export interface FollowsDigestTarget {
  type: FollowTargetType;
  id: string;
  name: string;
}

/** Le message d'un utilisateur : ses nouveaux événements, chacun une fois, et les cibles qui les publient. */
export interface FollowsDigestPlan {
  events: FollowsDigestEvent[];
  targets: FollowsDigestTarget[];
}

/** Type de flux et clé de remise des logs : un message des suivis par personne et par jour. */
export const FOLLOWS_DIGEST_FLOW_TYPE = "follows_digest";

export function followsDigestDeliveryKey(date: string, userId: string): string {
  return `${FOLLOWS_DIGEST_FLOW_TYPE}:${date}:${userId}`;
}

/**
 * Les messages, par utilisateur, dans l'ordre des lignes (par date d'événement : `follows_digest()`
 * trie). Un événement publié par deux cibles suivies (son lieu et un artiste) compte une fois.
 */
export function planFollowsDigests(rows: FollowsDigestRow[]): Map<string, FollowsDigestPlan> {
  const plans = new Map<string, FollowsDigestPlan>();
  for (const row of rows) {
    let plan = plans.get(row.user_id);
    if (!plan) {
      plan = { events: [], targets: [] };
      plans.set(row.user_id, plan);
    }
    if (!plan.events.some((event) => event.id === row.event_id)) {
      plan.events.push({ id: row.event_id, title: row.event_title, date: row.event_date });
    }
    if (!plan.targets.some((target) => target.type === row.target_type && target.id === row.target_id)) {
      plan.targets.push({ type: row.target_type, id: row.target_id, name: row.target_name?.trim() ?? "" });
    }
  }
  return plans;
}

/**
 * « 2 nouveaux événements chez L’Astrolabe », « 1 nouvel événement avec Youn Sun Nah », « Fulgurances
 * Électroniques #2 : 2 événements ajoutés au programme », « … chez tes suivis ».
 */
export function followsDigestTitle(plan: FollowsDigestPlan): string {
  const count = plan.events.length;
  const [target] = plan.targets;
  if (plan.targets.length === 1 && target.name && target.type === "festival") {
    const added = count === 1 ? "1 événement ajouté" : `${count} événements ajoutés`;
    return `${shortTitle(target.name)} : ${added} au programme`;
  }
  const events = count === 1 ? "1 nouvel événement" : `${count} nouveaux événements`;
  if (plan.targets.length === 1 && target.name) {
    return `${events} ${target.type === "artist" ? "avec" : "chez"} ${shortTitle(target.name)}`;
  }
  return `${events} chez tes suivis`;
}

/** Les deux premiers titres, puis le reste : « Kid Francescoli, Folie’s et 1 autre ». */
export function followsDigestBody(plan: FollowsDigestPlan): string {
  return digestBody(plan.events.map((event) => ({ title: event.title, dates: 1 })));
}

/**
 * Données de la notification, lues par l'app au toucher : la page du suivi (`target_type`,
 * `target_id`) quand une seule cible a publié, sinon l'onglet Favoris ; pour un festival
 * (`target_type` `festival`), sa fiche, et l'onglet Favoris dans les versions qui ne le connaissent pas.
 * FCM les envoie en texte (une liste y devient « a,b »), APNs les garde en JSON. Contrat :
 * `docs/API_APP.md`, « Suivis ».
 */
export function followsDigestData(input: { date: string; plan: FollowsDigestPlan }): Record<string, unknown> {
  const { plan } = input;
  const single = plan.targets.length === 1 ? plan.targets[0] : null;
  return {
    type: FOLLOWS_DIGEST_FLOW_TYPE,
    date: input.date,
    event_ids: plan.events.slice(0, MAX_EVENT_IDS).map((event) => event.id),
    events_count: plan.events.length,
    follows_count: plan.targets.length,
    ...(single ? { target_type: single.type, target_id: single.id } : {}),
  };
}
