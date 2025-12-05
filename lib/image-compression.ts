/**
 * Compresse une image dans le navigateur pour qu'elle fasse moins de 10 Mo
 * @param file Le fichier image à compresser
 * @param maxSizeMo Taille maximale en Mo (défaut: 10)
 * @param maxWidth Largeur maximale en pixels (défaut: 1920)
 * @param maxHeight Hauteur maximale en pixels (défaut: 1920)
 * @returns Promise<File> Le fichier compressé
 */
export async function compressImage(
  file: File,
  maxSizeMo: number = 10,
  maxWidth: number = 1920,
  maxHeight: number = 1920
): Promise<File> {
  // Si le fichier fait déjà moins de maxSizeMo et n'a pas besoin de redimensionnement, on peut le retourner tel quel
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
              if (sizeInMo <= maxSizeMo || quality <= 0.1) {
                const compressedFile = new File(
                  [blob],
                  file.name,
                  {
                    type: file.type || "image/jpeg",
                    lastModified: Date.now(),
                  }
                );
                resolve(compressedFile);
              } else {
                // Réduire la qualité de 10% et réessayer
                tryCompress(Math.max(0.1, quality - 0.1));
              }
            },
            file.type || "image/jpeg",
            quality
          );
        };

        // Commencer avec une qualité de 0.9 (90%) pour les fichiers > maxSizeMo
        // ou 0.85 pour optimiser même les fichiers plus petits
        const initialQuality = sizeInMo > maxSizeMo ? 0.9 : 0.85;
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

