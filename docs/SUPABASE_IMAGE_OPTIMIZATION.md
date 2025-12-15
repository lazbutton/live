# Optimisation des images Supabase Storage

## Vue d'ensemble

Supabase Storage **ne supporte pas nativement** les transformations d'images (redimensionnement, compression, format WebP, etc.). Cependant, il existe plusieurs solutions pour optimiser le chargement des images.

## 🎯 Solutions disponibles

### Solution 1 : Next.js Image Component (Recommandé pour Next.js)

Next.js offre une optimisation d'images intégrée qui fonctionne avec les images externes (comme celles de Supabase Storage).

#### Configuration

1. **Configurer les domaines autorisés dans `next.config.js`** :

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      // Ou si vous utilisez un domaine personnalisé pour Supabase Storage
      {
        protocol: 'https',
        hostname: 'votre-domaine.com',
        pathname: '/storage/**',
      },
    ],
  },
};

module.exports = nextConfig;
```

2. **Utiliser le composant Image de Next.js** :

```tsx
import Image from 'next/image';

// Dans votre composant
<Image
  src={event.image_url || '/placeholder.jpg'}
  alt={event.title}
  width={800}
  height={600}
  quality={90}
  // Next.js optimisera automatiquement l'image
  // - Convertit en WebP si supporté par le navigateur
  // - Redimensionne selon width/height
  // - Compresse selon quality
  // - Lazy loading automatique
/>
```

**Avantages** :
- ✅ Optimisation automatique
- ✅ Conversion WebP automatique
- ✅ Lazy loading intégré
- ✅ Pas de service externe nécessaire
- ✅ Gratuit

**Inconvénients** :
- ⚠️ Nécessite Next.js (ne fonctionne pas dans l'app mobile Flutter)

### Solution 2 : Service de transformation d'images externe

Utiliser un service comme **ImageKit**, **Cloudinary**, ou **Imgix** comme proxy devant Supabase Storage.

#### Exemple avec ImageKit

1. **Configuration ImageKit** :
   - Créer un compte ImageKit
   - Configurer Supabase Storage comme source d'images
   - Obtenir l'URL de base ImageKit

2. **Fonction utilitaire** :

```typescript
// lib/supabase/image-utils.ts

export function getImageKitUrl(
  storageUrl: string,
  options: {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'webp' | 'jpg' | 'png';
  }
): string {
  // Extraire le chemin de l'image depuis l'URL Supabase
  // Exemple: https://xxx.supabase.co/storage/v1/object/public/event-images/path/to/image.jpg
  // -> path/to/image.jpg
  
  const url = new URL(storageUrl);
  const path = url.pathname.replace('/storage/v1/object/public/', '');
  
  // Construire l'URL ImageKit
  const imageKitBaseUrl = process.env.NEXT_PUBLIC_IMAGEKIT_URL || 'https://ik.imagekit.io/your-id';
  
  const params = new URLSearchParams();
  if (options.width) params.append('w', options.width.toString());
  if (options.height) params.append('h', options.height.toString());
  if (options.quality) params.append('q', options.quality.toString());
  if (options.format) params.append('f', options.format);
  
  return `${imageKitBaseUrl}/${path}?${params.toString()}`;
}

// Utilisation
const optimizedUrl = getImageKitUrl(event.image_url, {
  width: 800,
  height: 600,
  quality: 90,
  format: 'webp'
});
```

**Avantages** :
- ✅ Fonctionne partout (web, mobile)
- ✅ Transformations avancées (crop, filters, etc.)
- ✅ CDN intégré
- ✅ Cache intelligent

**Inconvénients** :
- ⚠️ Service payant (généralement avec un plan gratuit généreux)
- ⚠️ Configuration supplémentaire nécessaire

### Solution 3 : API Route Next.js pour transformation

Créer une route API Next.js qui redimensionne les images à la volée.

#### Implémentation

```typescript
// app/api/images/[path]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const width = parseInt(searchParams.get('w') || '800');
    const height = parseInt(searchParams.get('h') || '600');
    const quality = parseInt(searchParams.get('q') || '90');

    // Récupérer l'image depuis Supabase Storage
    const imagePath = params.path.join('/');
    const storageUrl = `https://${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/event-images/${imagePath}`;
    
    const response = await fetch(storageUrl);
    if (!response.ok) {
      return new NextResponse('Image not found', { status: 404 });
    }

    const imageBuffer = await response.arrayBuffer();
    
    // Transformer l'image avec sharp
    const transformedImage = await sharp(Buffer.from(imageBuffer))
      .resize(width, height, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality })
      .toBuffer();

    return new NextResponse(transformedImage, {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Error transforming image:', error);
    return new NextResponse('Error transforming image', { status: 500 });
  }
}
```

**Utilisation** :
```
/api/images/event-images/path/to/image.jpg?w=800&h=600&q=90
```

**Avantages** :
- ✅ Contrôle total sur les transformations
- ✅ Gratuit (sur votre infrastructure)
- ✅ Fonctionne partout (web, mobile)

**Inconvénients** :
- ⚠️ Consomme des ressources serveur
- ⚠️ Plus lent que les solutions CDN
- ⚠️ Nécessite la bibliothèque `sharp`

### Solution 4 : Générer plusieurs tailles à l'upload

Générer plusieurs versions de l'image lors de l'upload et les stocker toutes dans Supabase Storage.

#### Implémentation

```typescript
// Lors de l'upload d'une image
async function uploadImageWithSizes(file: File) {
  const sizes = [
    { name: 'thumbnail', width: 150, height: 150 },
    { name: 'small', width: 400, height: 400 },
    { name: 'medium', width: 800, height: 800 },
    { name: 'large', width: 1200, height: 1200 },
  ];

  const uploads = await Promise.all(
    sizes.map(async ({ name, width, height }) => {
      // Utiliser sharp ou une autre bibliothèque pour redimensionner
      const resized = await resizeImage(file, width, height);
      
      const filePath = `${uuid()}-${name}.webp`;
      const { data, error } = await supabase.storage
        .from('event-images')
        .upload(filePath, resized, {
          contentType: 'image/webp',
        });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('event-images')
        .getPublicUrl(data.path);

      return { size: name, url: publicUrl };
    })
  );

  return uploads;
}
```

**Avantages** :
- ✅ Images pré-générées (plus rapide au chargement)
- ✅ Pas de transformation à la volée

**Inconvénients** :
- ⚠️ Utilise plus d'espace de stockage
- ⚠️ Plus complexe à gérer

## 📱 Pour l'application mobile (Flutter)

Pour l'app mobile, les options sont :

1. **Utiliser l'API Route Next.js** (Solution 3)
   ```dart
   final imageUrl = 'https://votre-domaine.com/api/images/$imagePath?w=800&h=600&q=90';
   ```

2. **Utiliser ImageKit ou Cloudinary**
   ```dart
   final imageUrl = 'https://ik.imagekit.io/your-id/$imagePath?w=800&h=600&q=90';
   ```

3. **Redimensionner côté client** (avec un package Flutter comme `image` ou `flutter_image_compress`)

## 🎯 Recommandation

Pour votre projet, je recommande :

1. **Pour Next.js (admin/organizer)** : Utiliser **Next.js Image Component** (Solution 1)
   - Simple, gratuit, optimisé automatiquement

2. **Pour l'app mobile Flutter** : Créer une **API Route Next.js** (Solution 3)
   - Contrôle total, fonctionne bien avec le cache
   - Alternative : Utiliser ImageKit si vous voulez un service managé

3. **Pour les très gros volumes** : Considérer **ImageKit** ou **Cloudinary**
   - CDN global, cache intelligent, très performant

## 🚀 Implémentation rapide

### Utiliser Next.js Image Component

```tsx
// components/OptimizedImage.tsx
import Image from 'next/image';

interface OptimizedImageProps {
  src: string | null | undefined;
  alt: string;
  width: number;
  height: number;
  className?: string;
  sizes?: string;
}

export function OptimizedImage({ 
  src, 
  alt, 
  width, 
  height, 
  className,
  sizes 
}: OptimizedImageProps) {
  if (!src) {
    return (
      <div 
        className={className}
        style={{ width, height, backgroundColor: '#f3f4f6' }}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      sizes={sizes}
      quality={90}
      // Next.js optimisera automatiquement
    />
  );
}
```

### Utilisation

```tsx
<OptimizedImage
  src={event.image_url}
  alt={event.title}
  width={800}
  height={600}
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
/>
```

## 📚 Ressources

- [Next.js Image Optimization](https://nextjs.org/docs/pages/api-reference/components/image)
- [ImageKit Documentation](https://docs.imagekit.io/)
- [Cloudinary Documentation](https://cloudinary.com/documentation)
- [Supabase Storage](https://supabase.com/docs/guides/storage)


