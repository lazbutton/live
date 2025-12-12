# Configuration Supabase Storage - Limite de 2 Mo

Ce guide explique comment configurer Supabase Storage pour limiter la taille des fichiers uploadés à 2 Mo maximum.

## 📋 Vue d'ensemble

Le code de compression a été mis à jour pour limiter automatiquement les images à 2 Mo avant l'upload. Cependant, il est recommandé d'ajouter une validation côté serveur pour garantir que seuls les fichiers de moins de 2 Mo peuvent être uploadés.

## ✅ Modifications du code

Le code a été mis à jour pour :
- Compresser automatiquement les images à moins de 2 Mo avant l'upload
- Tous les appels à `compressImage()` utilisent maintenant 2 Mo au lieu de 10 Mo

## 🔧 Configuration Supabase Storage

### Option 1 : Validation via Storage Policies (Recommandé)

Supabase Storage ne permet pas directement de limiter la taille des fichiers dans les politiques RLS, mais vous pouvez utiliser une fonction Edge Function ou une validation dans votre code d'upload.

### Option 2 : Créer une Edge Function pour valider la taille

Créez une Edge Function qui intercepte les uploads et valide la taille avant de permettre l'upload.

#### Étapes :

1. **Créer une Edge Function dans Supabase**

   Allez dans votre projet Supabase → Edge Functions → Créer une nouvelle fonction

2. **Code de la fonction `validate-upload-size`**

   ```typescript
   // supabase/functions/validate-upload-size/index.ts
   import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
   import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

   const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2 Mo en bytes

   serve(async (req) => {
     try {
       const { file, bucket, path } = await req.json()
      
       // Vérifier la taille du fichier
       if (file.size > MAX_FILE_SIZE) {
         return new Response(
           JSON.stringify({ 
             error: 'Fichier trop volumineux. Taille maximum : 2 Mo' 
           }),
           { 
             status: 400,
             headers: { 'Content-Type': 'application/json' }
           }
         )
       }

       // Si la taille est OK, continuer avec l'upload normal
       return new Response(
         JSON.stringify({ success: true }),
         { 
           status: 200,
           headers: { 'Content-Type': 'application/json' }
         }
       )
     } catch (error) {
       return new Response(
         JSON.stringify({ error: error.message }),
         { 
           status: 500,
           headers: { 'Content-Type': 'application/json' }
         }
       )
     }
   })
   ```

3. **Déployer la fonction**

   ```bash
   supabase functions deploy validate-upload-size
   ```

**Note** : Cette approche nécessite de modifier votre code d'upload pour appeler cette fonction avant l'upload, ce qui peut être complexe.

### Option 3 : Validation dans le code d'upload (Plus simple - Déjà fait)

La validation est déjà effectuée côté client via la fonction `compressImage()` qui garantit que tous les fichiers font moins de 2 Mo avant l'upload. C'est la solution la plus simple et efficace pour ce cas d'usage.

### Option 4 : Configuration des buckets (Limitation native)

Supabase Storage permet de configurer certaines limitations au niveau des buckets via les politiques, mais **il n'existe pas de politique native pour limiter la taille des fichiers**.

Cependant, vous pouvez :

1. **Configurer les buckets existants**

   Assurez-vous que les buckets suivants existent et sont correctement configurés :
   - `event-images`
   - `organizers-images`
   - `locations-images`

2. **Vérifier les politiques RLS des buckets**

   Dans Supabase Dashboard → Storage → Policies, vérifiez que les politiques d'upload sont correctement configurées pour vos utilisateurs.

## 📝 Configuration recommandée dans Supabase Dashboard

### 1. Vérifier les buckets

Allez dans **Storage** dans votre dashboard Supabase et vérifiez que ces buckets existent :
- `event-images`
- `organizers-images`  
- `locations-images`

### 2. Configurer les politiques de stockage

Pour chaque bucket, configurez des politiques qui :
- Permettent l'upload uniquement aux utilisateurs authentifiés (ou admins)
- Limitez les types de fichiers (images uniquement)

Exemple de politique SQL pour permettre l'upload d'images :

```sql
-- Politique pour permettre l'upload d'images par les utilisateurs authentifiés
CREATE POLICY "Authenticated users can upload images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'event-images' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] IS NOT NULL
);

-- Politique pour permettre la lecture publique
CREATE POLICY "Public can read images"
ON storage.objects FOR SELECT
USING (bucket_id = 'event-images');
```

### 3. Configurer les limites de taille via l'API (si possible)

Si vous utilisez Supabase CLI ou l'API, vous pouvez vérifier les limites configurées pour votre projet. Par défaut, Supabase limite les fichiers à 50 Mo, mais vous devez gérer la limite de 2 Mo au niveau applicatif.

## 🔍 Vérification

### Tester la compression

1. Téléchargez une image de plus de 2 Mo
2. Essayez de l'uploader via l'interface
3. Vérifiez que l'image est automatiquement compressée à moins de 2 Mo avant l'upload

### Vérifier dans Supabase

1. Allez dans **Storage** → Sélectionnez un bucket (ex: `event-images`)
2. Vérifiez la taille des fichiers uploadés
3. Tous les nouveaux fichiers devraient faire moins de 2 Mo

## ⚠️ Notes importantes

1. **Les fichiers existants ne sont pas affectés** : La compression s'applique uniquement aux nouveaux uploads. Les fichiers déjà uploadés conservent leur taille d'origine.

2. **Qualité des images** : Avec une limite de 2 Mo, la qualité des images peut être légèrement réduite pour les très grandes images. La fonction `compressImage()` essaie de trouver un bon équilibre entre taille et qualité.

3. **Performance** : La compression côté client peut prendre quelques secondes pour les grandes images, mais cela garantit que les fichiers sont optimisés avant l'upload.

4. **Types de fichiers** : La compression fonctionne principalement pour les formats JPEG et PNG. Les autres formats peuvent nécessiter une conversion.

## 🚀 Prochaines étapes

1. ✅ Code mis à jour pour compresser à 2 Mo
2. ⬜ Tester l'upload d'images pour vérifier la compression
3. ⬜ Vérifier que les buckets existent dans Supabase
4. ⬜ Vérifier les politiques RLS des buckets (optionnel mais recommandé)
5. ⬜ Surveiller l'espace de stockage utilisé dans Supabase

## 📚 Ressources

- [Documentation Supabase Storage](https://supabase.com/docs/guides/storage)
- [Politiques RLS pour Storage](https://supabase.com/docs/guides/storage/security/access-control)
- [Edge Functions](https://supabase.com/docs/guides/functions)

