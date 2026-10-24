// Edge Function pour supprimer un compte utilisateur
// Cette fonction utilise la clé secrète du projet pour avoir les permissions admin

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Clés du projet, injectées par Supabase : les nouvelles (publishable, secrète,
// nommée `default`) dès qu'elles existent, sinon les clés legacy (anon,
// service_role), qui cessent de marcher une fois désactivées.
function projectKey(kind: 'publishable' | 'secret'): string {
  const keys = Deno.env.get(
    kind === 'publishable' ? 'SUPABASE_PUBLISHABLE_KEYS' : 'SUPABASE_SECRET_KEYS',
  )
  if (keys) {
    try {
      const key = JSON.parse(keys)?.default
      if (typeof key === 'string' && key) return key
    } catch {
      // Variable illisible : la clé legacy en repli.
    }
  }
  return Deno.env.get(
    kind === 'publishable' ? 'SUPABASE_ANON_KEY' : 'SUPABASE_SERVICE_ROLE_KEY',
  ) ?? ''
}

// Le bucket des affiches, et ses deux dossiers où la fonction efface : events/, où l'app
// dépose l'affiche d'une proposition, et cards/, les vignettes (docs/EVENT_IMAGE_CARDS.md).
// Jamais un fichier du back-office (à la racine du bucket, admin-popups/…), même si une ligne
// du compte pointe dessus.
const POSTERS_BUCKET = 'event-images'
const MEMBER_POSTERS = 'events/'
const CARDS = 'cards/'
const PUBLIC_PATH = `/storage/v1/object/public/${POSTERS_BUCKET}/`

// Un fichier du bucket : son chemin tel que l'écrit son URL publique (pour le chercher dans
// d'autres lignes) et son nom dans le bucket.
type PosterFile = { urlPath: string; name: string }

// Les fichiers distincts du dossier [folder] que désignent des URL publiques du bucket ; une
// autre URL (autre bucket, autre site, chemin douteux) est ignorée.
function posterFiles(urls: unknown[], folder: string): PosterFile[] {
  const files = new Map<string, PosterFile>()
  for (const url of urls) {
    if (typeof url !== 'string') continue
    const start = url.indexOf(PUBLIC_PATH)
    if (start < 0) continue
    const urlPath = url.slice(start + PUBLIC_PATH.length).split(/[?#]/)[0]
    let name: string
    try {
      name = decodeURIComponent(urlPath)
    } catch {
      continue
    }
    const parts = name.split('/')
    if (!name.startsWith(folder) || parts.some((part) => ['', '.', '..'].includes(part))) continue
    files.set(name, { urlPath, name })
  }
  return [...files.values()]
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  const message = (error as { message?: unknown } | null)?.message
  return typeof message === 'string' ? message : String(error)
}

// Vrai si plus rien ne pointe sur [file] une fois le compte [userId] supprimé : aucun
// événement par [column], et pour une affiche, aucune proposition d'un autre compte. Une URL
// est reconnue à la fin de son chemin, quel que soit l'hôte ; le motif LIKE n'est pas échappé
// (un « _ » ou un « % » du chemin ne peut qu'élargir la recherche, donc garder le fichier).
// Dans le doute (une lecture en erreur), le fichier est gardé.
async function isUnused(
  admin: SupabaseClient,
  file: PosterFile,
  column: 'image_url' | 'image_card_url',
  userId: string,
): Promise<boolean> {
  const pattern = `%${PUBLIC_PATH}${file.urlPath}`
  const events = await admin.from('events').select('id').like(column, pattern).limit(1)
  if (events.error) {
    console.error('Poster kept, events not read:', events.error.message)
    return false
  }
  if (events.data.length > 0) return false
  if (column === 'image_card_url') return true

  const requests = await admin
    .from('user_requests')
    .select('requested_by')
    .like('event_data->>image_url', pattern)
  if (requests.error) {
    console.error('Poster kept, requests not read:', requests.error.message)
    return false
  }
  return requests.data.every((request) => request.requested_by === userId)
}

// Les fichiers d'affiche et de vignette que plus rien n'utilise, effacés au mieux : un
// fichier qui résiste est noté dans les journaux et n'empêche pas la suppression du compte.
async function removeUnusedFiles(
  admin: SupabaseClient,
  userId: string,
  posters: PosterFile[],
  cards: PosterFile[],
): Promise<number> {
  try {
    const unused: string[] = []
    for (const file of posters) {
      if (await isUnused(admin, file, 'image_url', userId)) unused.push(file.name)
    }
    for (const file of cards) {
      if (await isUnused(admin, file, 'image_card_url', userId)) unused.push(file.name)
    }
    if (unused.length === 0) return 0

    const { data, error } = await admin.storage.from(POSTERS_BUCKET).remove(unused)
    if (error) {
      console.error('Posters not removed:', error.message)
      return 0
    }
    return data?.length ?? 0
  } catch (error) {
    console.error('Posters not removed:', errorMessage(error))
    return 0
  }
}

// Ce que la suppression du compte n'emporte pas d'elle-même : les clés étrangères vers
// auth.users suppriment ses propositions (user_requests) et vident events.created_by, mais
// laissent les fichiers des affiches, ses événements encore en attente et le nom public
// (« Proposé par … ») de ses événements publiés. Avec la clé secrète, un compte suspendu, que
// la RLS empêche de supprimer ses événements en attente, est traité comme les autres. Lève sur
// une erreur de la base : le compte n'est pas encore supprimé, la demande peut être refaite.
async function deleteAccountContent(admin: SupabaseClient, userId: string) {
  const requests = await admin
    .from('user_requests')
    .select('event_data')
    .eq('requested_by', userId)
  if (requests.error) throw requests.error

  // Les lignes supprimées, pas celles lues : leurs affiches et vignettes.
  const pendingEvents = await admin
    .from('events')
    .delete()
    .eq('created_by', userId)
    .eq('status', 'pending')
    .select('image_url, image_card_url')
  if (pendingEvents.error) throw pendingEvents.error

  // Seulement les lignes qui ont un nom ou un accord (updated_at des autres intact).
  const attribution = await admin
    .from('events')
    .update({ community_contributor_label: null, community_attribution_opt_in: false })
    .eq('created_by', userId)
    .or('community_contributor_label.not.is.null,community_attribution_opt_in.is.true')
  if (attribution.error) throw attribution.error

  const posters = posterFiles(
    [
      ...requests.data.map((request) => request.event_data?.image_url),
      ...pendingEvents.data.map((event) => event.image_url),
    ],
    MEMBER_POSTERS,
  )
  const cards = posterFiles(
    pendingEvents.data.map((event) => event.image_card_url),
    CARDS,
  )
  const removedFiles = await removeUnusedFiles(admin, userId, posters, cards)
  console.log(
    `Account content deleted: ${pendingEvents.data.length} pending events, ${removedFiles} files`,
  )
}

serve(async (req) => {
  // Gérer les requêtes OPTIONS pour CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Récupérer l'utilisateur authentifié depuis le header Authorization
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Créer un client Supabase avec la clé publique pour vérifier l'utilisateur
    // (la fonction vérifie le jeton elle-même : elle se déploie sans
    // « Verify JWT », voir README.md)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = projectKey('publishable')

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    })

    // Vérifier que l'utilisateur est authentifié
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: userError?.message }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Récupérer le userId depuis le body ou utiliser l'utilisateur authentifié
    const body = await req.json().catch(() => ({}))
    const userIdToDelete = body.userId || user.id

    // Vérifier que l'utilisateur demande la suppression de son propre compte
    // (sauf si c'est un admin)
    const isAdmin = user.app_metadata?.role === 'admin'
    if (!isAdmin && userIdToDelete !== user.id) {
      return new Response(
        JSON.stringify({ error: 'You can only delete your own account' }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Créer un client admin avec la clé secrète
    const supabaseServiceRoleKey = projectKey('secret')

    if (!supabaseServiceRoleKey) {
      console.error('Secret key is not set')
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // D'abord ce que la suppression de l'utilisateur laisserait derrière elle
    try {
      await deleteAccountContent(supabaseAdmin, userIdToDelete)
    } catch (contentError) {
      console.error('Error deleting account content:', errorMessage(contentError))
      return new Response(
        JSON.stringify({
          error: 'Failed to delete account content',
          details: errorMessage(contentError),
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Supprimer l'utilisateur avec les permissions admin
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userIdToDelete)

    if (deleteError) {
      console.error('Error deleting user:', deleteError)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to delete user', 
          details: deleteError.message 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'User account deleted successfully',
        userId: userIdToDelete
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : String(error)
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

