/**
 * Compresse une image dans le navigateur pour rester sous le budget Storage Free.
 * @param file Le fichier image à compresser
 * @param maxSizeMo Taille maximale demandée en Mo, plafonnée à 0,9 Mo
 * @param maxWidth Largeur maximale en pixels (défaut: 1600)
 * @param maxHeight Hauteur maximale en pixels (défaut: 1600)
 * @returns Promise<File> Le fichier compressé
 */
export async function compressImage(
  file: File,
  maxSizeMo: number = 0.9,
  maxWidth: number = 1600,
  maxHeight: number = 1600
): Promise<File> {
  const effectiveMaxSizeMo = Math.min(Math.max(maxSizeMo, 0.1), 0.9);
  const sizeInMo = file.size / (1024 * 1024);
  
  // Si déjà en dessous de la taille max, on vérifie quand même si un redimensionnement est nécessaire
  // pour éviter les images trop grandes en résolution
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        // Calculer les nouvelles dimensions en gardant le ratio
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = width * ratio;
          height = height * ratio;
        }

        // Créer un canvas pour redimensionner et compresser
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("Impossible de créer le contexte canvas"));
          return;
        }

        // Dessiner l'image redimensionnée
        ctx.drawImage(img, 0, 0, width, height);

        // Fonction pour essayer différentes qualités de compression
        const tryCompress = (quality: number): void => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Erreur lors de la compression"));
                return;
              }

              const sizeInMo = blob.size / (1024 * 1024);

              // Si la taille est acceptable ou que la qualité est déjà très basse
              if (sizeInMo <= effectiveMaxSizeMo || quality <= 0.1) {
                const baseName = file.name.replace(/\.[^.]+$/, "");
                const compressedFile = new File(
                  [blob],
                  `${baseName || "image"}.webp`,
                  {
                    type: "image/webp",
                    lastModified: Date.now(),
                  }
                );
                resolve(compressedFile);
              } else {
                // Réduire la qualité de 10% et réessayer
                tryCompress(Math.max(0.1, quality - 0.1));
              }
            },
            "image/webp",
            quality
          );
        };

        // WebP conserve la transparence des logos tout en réduisant leur poids.
        // Commencer avec une qualité de 0.9 (90%) pour les fichiers > la cible
        // ou 0.85 pour optimiser même les fichiers plus petits
        const initialQuality = sizeInMo > effectiveMaxSizeMo ? 0.9 : 0.85;
        tryCompress(initialQuality);
      };

      img.onerror = () => {
        reject(new Error("Erreur lors du chargement de l'image"));
      };

      if (e.target?.result) {
        img.src = e.target.result as string;
      } else {
        reject(new Error("Impossible de lire le fichier"));
      }
    };

    reader.onerror = () => {
      reject(new Error("Erreur lors de la lecture du fichier"));
    };

    reader.readAsDataURL(file);
  });
}

