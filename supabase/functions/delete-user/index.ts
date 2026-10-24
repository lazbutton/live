// Edge Function pour supprimer un compte utilisateur
// Cette fonction utilise la clé secrète du projet pour avoir les permissions admin

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

