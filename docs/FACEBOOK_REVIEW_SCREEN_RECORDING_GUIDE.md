# Guide pour créer un Screen Recording pour la Review Facebook

## 🎥 Objectif de la vidéo

Démontrer comment votre application utilise la fonctionnalité "Page Public Metadata Access" pour importer des événements publics depuis des pages Facebook, et montrer que :
- Vous accédez uniquement aux données publiques
- Vous respectez la vie privée
- Il y a une validation humaine avant publication

## 📋 Étapes à montrer dans la vidéo (ordre recommandé)

### 1. Introduction (5-10 secondes)
- Ouvrir votre navigateur sur la page d'administration
- Montrer brièvement l'interface de gestion des organisateurs
- **À dire** : "Je vais démontrer comment notre application Live Orléans importe des événements publics depuis Facebook"

### 2. Sélection d'un organisateur avec page Facebook (10-15 secondes)
- Aller dans "Gestion des organisateurs"
- Sélectionner ou créer un organisateur qui a un `facebook_page_id` configuré
- Montrer que l'ID de page Facebook est enregistré
- **À dire** : "Voici un organisateur local avec son ID de page Facebook publique"

### 3. Ouverture de l'importateur Facebook (5-10 secondes)
- Cliquer sur le bouton "Importer depuis Facebook" ou équivalent
- Montrer l'interface d'importation qui s'ouvre
- **À dire** : "Je vais maintenant importer les événements publics de cette page"

### 4. Récupération des événements publics (10-20 secondes)
- Cliquer sur "Récupérer les événements Facebook"
- Montrer le chargement
- Montrer la liste des événements récupérés (nom, date, lieu, image)
- **À dire** : "Les événements publics sont récupérés via l'API Graph Facebook. Notez que seuls les événements publics sont affichés"

### 5. Détails d'un événement (10-15 secondes)
- Cliquer sur un événement pour voir les détails
- Montrer les informations publiques : nom, description, dates, lieu, image
- **À dire** : "Voici les métadonnées publiques d'un événement : nom, description publique, dates, lieu public, image de couverture"

### 6. Conversion en demandes d'événements (10-15 secondes)
- Sélectionner un ou plusieurs événements
- Cliquer sur "Créer des demandes"
- Montrer que les événements sont transformés en demandes à valider
- **À dire** : "Ces événements sont convertis en demandes qui doivent être validées manuellement"

### 7. Validation manuelle (15-20 secondes)
- Aller dans "Gestion des demandes"
- Montrer la demande créée depuis l'événement Facebook
- Montrer que vous pouvez éditer/compléter les informations
- Montrer le bouton "Créer l'événement" ou "Approuver"
- **À dire** : "Chaque événement importé doit être validé manuellement par un administrateur avant publication. Aucun événement n'est publié automatiquement"

### 8. Résultat final (5-10 secondes)
- Montrer l'événement créé dans la liste des événements
- Montrer que les liens vers Facebook sont préservés
- **À dire** : "Une fois validé, l'événement est publié sur notre plateforme, avec crédit à la page Facebook d'origine"

### 9. Conclusion (5 secondes)
- Revenir à l'interface principale
- **À dire** : "Cette fonctionnalité nous permet de centraliser les événements publics locaux tout en respectant la vie privée"

## ⏱️ Durée totale recommandée

**1 à 2 minutes maximum** - Facebook préfère des vidéos courtes et claires

## 🛠️ Outils pour créer le screen recording

### Sur Mac :
1. **QuickTime Player** (gratuit, intégré)
   - Ouvrir QuickTime Player
   - Fichier → Nouvel enregistrement d'écran
   - Cliquer sur la flèche à côté du bouton d'enregistrement
   - Choisir le micro si vous voulez ajouter une voix off
   - Cliquer sur le bouton d'enregistrement
   - Appuyer sur Cmd+Ctrl+Esc pour arrêter

2. **Commande Terminal** :
   ```bash
   # Lancer l'enregistrement
   screencapture -v screen_recording.mov
   ```

### Sur Windows :
1. **Xbox Game Bar** (Windows 10/11)
   - Appuyer sur `Win + G`
   - Cliquer sur le bouton d'enregistrement
   - Ou utiliser `Win + Alt + R` pour démarrer directement

2. **OBS Studio** (gratuit, open-source)
   - Télécharger depuis https://obsproject.com/
   - Configuration simple pour screen recording

### Alternatives cross-platform :
- **Loom** (gratuit) - https://www.loom.com/ - Simple et rapide
- **OBS Studio** (gratuit) - https://obsproject.com/
- **ScreenFlow** (Mac, payant) - Plus avancé

## 🎬 Conseils pour un bon enregistrement

### Technique :
- ✅ **Résolution** : Minimum 1280x720 (HD), idéalement 1920x1080 (Full HD)
- ✅ **Format** : MP4 ou MOV (format préféré par Facebook)
- ✅ **Taille du fichier** : Moins de 100 MB si possible
- ✅ **Cadence** : 30 fps suffit
- ✅ **Zoom** : Zoomer si nécessaire pour que les détails soient visibles

### Contenu :
- ✅ **Clarté** : Montrer clairement chaque étape
- ✅ **Vitesse** : Ne pas aller trop vite - laissez le temps de voir
- ✅ **Cursor** : Montrer où vous cliquez (surligner si nécessaire)
- ✅ **Audio** : Optionnel mais recommandé - expliquer ce que vous faites
- ✅ **Données de test** : Utilisez une page Facebook publique réelle pour montrer que ça fonctionne

### À éviter :
- ❌ Ne pas montrer de données privées
- ❌ Ne pas montrer de mots de passe ou tokens
- ❌ Ne pas aller trop vite
- ❌ Ne pas faire de coupures brusques
- ❌ Ne pas montrer d'erreurs (testez avant !)

## 📝 Script suggéré (optionnel)

Si vous ajoutez une voix off :

```
[0-5s] "Bonjour, je vais démontrer comment Live Orléans utilise l'API Facebook pour importer des événements publics."

[5-20s] "Voici notre interface d'administration. Je sélectionne un organisateur local qui a une page Facebook publique."

[20-35s] "Je clique sur 'Importer depuis Facebook' et je récupère les événements publics de cette page via l'API Graph."

[35-50s] "Comme vous pouvez le voir, seuls les événements publics sont récupérés - nom, dates, lieu, description publique."

[50-70s] "Je sélectionne un événement et je le transforme en demande. Notez que cette demande doit être validée manuellement."

[70-90s] "Je vais maintenant dans la gestion des demandes pour valider cet événement. Chaque événement est vérifié avant publication."

[90-105s] "Une fois validé, l'événement est publié sur notre plateforme, avec crédit à la page Facebook d'origine."

[105-110s] "Cette fonctionnalité nous permet de centraliser les événements publics locaux tout en respectant strictement la vie privée."
```

## 🎨 Post-production (optionnel mais recommandé)

Si vous voulez améliorer la vidéo :

1. **Ajouter des annotations** :
   - Flèches pour montrer où cliquer
   - Encadrés pour mettre en évidence des éléments
   - Texte pour expliquer (ex: "Données publiques uniquement")

2. **Outils gratuits** :
   - **DaVinci Resolve** (gratuit, professionnel)
   - **CapCut** (gratuit, simple)
   - **OpenShot** (gratuit, open-source)

3. **Annotations simples** :
   - Utiliser la fonction de dessin de QuickTime ou OBS
   - Ajouter des flèches/cercles pendant l'enregistrement

## 📤 Préparer la vidéo pour Facebook

### Avant upload :
1. **Compression** (si trop gros) :
   - Utiliser HandBrake (gratuit) : https://handbrake.fr/
   - Paramètres recommandés :
     - Format : MP4
     - Codec vidéo : H.264
     - Qualité : 20-23 RF
     - Codec audio : AAC

2. **Vérifications finales** :
   - ✅ Durée : 1-2 minutes
   - ✅ Taille : < 100 MB
   - ✅ Format : MP4 ou MOV
   - ✅ Résolution : 1280x720 minimum
   - ✅ Audio : Claire (si voix off)
   - ✅ Pas de données sensibles visibles

## 🚀 Upload sur Facebook

1. Allez dans **App Review** de votre application Facebook
2. Trouvez la demande pour "Page Public Metadata Access"
3. Dans la section "Screen Recording", cliquez sur **Upload**
4. Sélectionnez votre fichier vidéo
5. Ajoutez une description courte : "Démonstration de l'importation d'événements publics depuis des pages Facebook avec validation manuelle obligatoire"

## 📸 Alternative : Captures d'écran

Si vous ne pouvez pas faire de vidéo, Facebook accepte aussi des captures d'écran avec annotations :

1. Prenez des captures à chaque étape
2. Annotez-les (flèches, cercles, texte)
3. Créez une séquence claire
4. Exportez en PDF ou image unique

**Outils pour annotations** :
- **Skitch** (gratuit)
- **Annotate** (Mac, gratuit)
- **Snipping Tool** + Paint (Windows)
- **Lightshot** (gratuit, cross-platform)

## ✅ Checklist avant upload

- [ ] Vidéo dure 1-2 minutes
- [ ] Taille < 100 MB
- [ ] Format MP4 ou MOV
- [ ] Résolution HD (1280x720 minimum)
- [ ] Montre clairement l'utilisation de l'API
- [ ] Montre que seules les données publiques sont accessibles
- [ ] Montre la validation manuelle
- [ ] Pas de données sensibles visibles
- [ ] Audio claire (si voix off)
- [ ] Testé et fonctionne correctement

## 💡 Astuce

**Testez d'abord** en faisant une vidéo de test, puis regardez-la pour vous assurer que tout est clair. Ensuite, faites la vidéo finale une fois que vous êtes satisfait du flow.

---

**Besoin d'aide ?** Consultez :
- [Guide Facebook sur les Screen Recordings](https://developers.facebook.com/docs/app-review/video-guide)
- [Developing for Success video](https://www.facebook.com/developers/videos/10159538232483553/)

