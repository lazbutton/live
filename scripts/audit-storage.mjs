#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Variables requises: NEXT_PUBLIC_SUPABASE_URL (ou SUPABASE_URL) et SUPABASE_SERVICE_ROLE_KEY.",
  );
  process.exit(1);
}

const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const args = new Set(process.argv.slice(2));
const deleteMode = args.has("--delete");
const confirmationArg = process.argv.find((arg) => arg.startsWith("--confirm="));
const confirmation = confirmationArg?.slice("--confirm=".length) ?? "";
const bucketArg = process.argv.find((arg) => arg.startsWith("--bucket="));
const selectedBucket = bucketArg?.slice("--bucket=".length) ?? null;
const graceArg = process.argv.find((arg) => arg.startsWith("--grace-days="));
const graceDays = Number(graceArg?.slice("--grace-days=".length) ?? "30");

if (!Number.isFinite(graceDays) || graceDays < 0) {
  console.error("--grace-days doit être un nombre positif.");
  process.exit(1);
}

if (deleteMode && confirmation !== projectRef) {
  console.error(
    `Suppression refusée. Relancez avec --delete --confirm=${projectRef} après validation du dry-run.`,
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const bucketReferences = {
  "event-images": [
    ["events", "image_url"],
    ["major_events", "image_url"],
    ["notification_settings", "in_app_popup_image_url"],
  ],
  "locations-images": [["locations", "image_url"]],
  "organizers-images": [
    ["organizers", "logo_url"],
    ["artists", "image_url"],
  ],
};

function extractObjectPath(value, bucket) {
  if (typeof value !== "string" || value.length === 0) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const markerIndex = value.indexOf(marker);
  if (markerIndex < 0) return null;
  return decodeURIComponent(
    value.slice(markerIndex + marker.length).split("?")[0].replace(/^\/+/, ""),
  );
}

async function fetchReferencedPaths(bucket) {
  const referenced = new Set();

  for (const [table, column] of bucketReferences[bucket] ?? []) {
    let offset = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select(column)
        .not(column, "is", null)
        .range(offset, offset + pageSize - 1);

      if (error) {
        if (error.code === "42P01" || error.code === "42703") break;
        throw new Error(`${table}.${column}: ${error.message}`);
      }

      for (const row of data ?? []) {
        const objectPath = extractObjectPath(row[column], bucket);
        if (objectPath) referenced.add(objectPath);
      }

      if (!data || data.length < pageSize) break;
      offset += pageSize;
    }
  }

  return referenced;
}

async function listObjects(bucket, prefix = "") {
  const objects = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);

    for (const item of data ?? []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (!item.id && !item.metadata) {
        objects.push(...(await listObjects(bucket, path)));
      } else {
        objects.push({ ...item, path });
      }
    }

    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }

  return objects;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** unitIndex).toFixed(1)} ${units[unitIndex]}`;
}

const cutoff = Date.now() - graceDays * 24 * 60 * 60 * 1000;
const buckets = Object.keys(bucketReferences).filter(
  (bucket) => !selectedBucket || bucket === selectedBucket,
);

if (selectedBucket && buckets.length === 0) {
  console.error(`Bucket non géré: ${selectedBucket}`);
  process.exit(1);
}

let totalOrphans = 0;
let totalOrphanBytes = 0;

for (const bucket of buckets) {
  const [objects, referenced] = await Promise.all([
    listObjects(bucket),
    fetchReferencedPaths(bucket),
  ]);

  const orphans = objects.filter((object) => {
    const createdAt = new Date(object.created_at ?? object.updated_at ?? 0).getTime();
    return (
      !referenced.has(object.path) &&
      Number.isFinite(createdAt) &&
      createdAt > 0 &&
      createdAt < cutoff
    );
  });
  const orphanBytes = orphans.reduce(
    (sum, object) => sum + Number(object.metadata?.size ?? 0),
    0,
  );

  totalOrphans += orphans.length;
  totalOrphanBytes += orphanBytes;

  console.log(
    `${bucket}: ${objects.length} objets, ${referenced.size} références, ${orphans.length} orphelins (${formatBytes(orphanBytes)}).`,
  );
  for (const object of orphans) {
    console.log(`  - ${object.path}`);
  }

  if (deleteMode && orphans.length > 0) {
    for (let index = 0; index < orphans.length; index += 100) {
      const batch = orphans.slice(index, index + 100).map((object) => object.path);
      const { error } = await supabase.storage.from(bucket).remove(batch);
      if (error) throw new Error(`${bucket}: ${error.message}`);
    }
  }
}

console.log(
  `${deleteMode ? "Suppression" : "Dry-run"} terminé: ${totalOrphans} objets, ${formatBytes(totalOrphanBytes)} récupérables.`,
);
