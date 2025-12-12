# Exemples de Schedules Cron pour Vercel

Format : `minute heure jour_mois mois jour_semaine`

## Ajouter des minutes spécifiques

Pour exécuter un cron à une minute précise, modifiez le premier champ :

### Exemples avec minutes

```json
{
  "crons": [
    {
      "path": "/api/cron/example",
      "schedule": "15 8 * * *"    // 8h15 tous les jours
    },
    {
      "path": "/api/cron/example",
      "schedule": "30 9 * * *"    // 9h30 tous les jours
    },
    {
      "path": "/api/cron/example",
      "schedule": "45 18 * * *"   // 18h45 tous les jours
    }
  ]
}
```

## Modifier vos crons actuels

Dans votre `vercel.json`, vous pouvez changer :

### Notifications quotidiennes (actuellement 8h00)
```json
{
  "path": "/api/cron/notifications/daily-events",
  "schedule": "15 8 * * *"  // Change de 8h00 à 8h15
}
```

### Rappels (actuellement 18h00)
```json
{
  "path": "/api/cron/notifications/upcoming-reminders",
  "schedule": "30 18 * * *"  // Change de 18h00 à 18h30
}
```

### Résumé hebdomadaire (actuellement dimanche 10h00)
```json
{
  "path": "/api/cron/notifications/weekly-summary",
  "schedule": "45 10 * * 0"  // Change de 10h00 à 10h45
}
```

## Exemples courants

### Toutes les heures à une minute précise
- `15 * * * *` : Toutes les heures à la minute 15 (1h15, 2h15, 3h15...)

### Plusieurs heures par jour avec minutes
- `30 9,12,15 * * *` : Tous les jours à 9h30, 12h30 et 15h30

### Heures de bureau avec minutes
- `15 9-17 * * 1-5` : Du lundi au vendredi, toutes les heures de 9h15 à 17h15

### Minutes précises multiples fois par jour
- `0,15,30,45 9 * * *` : Tous les jours à 9h00, 9h15, 9h30 et 9h45

## Valeurs possibles

- **Minute** : `0-59` ou `*` (toutes) ou `*/15` (toutes les 15 minutes)
- **Heure** : `0-23` ou `*` (toutes) ou `9-17` (de 9h à 17h)
- **Jour du mois** : `1-31` ou `*` (tous) ou `1,15` (1er et 15)
- **Mois** : `1-12` ou `*` (tous) ou `1,6,12` (janvier, juin, décembre)
- **Jour de la semaine** : `0-7` (0 et 7 = dimanche) ou `*` (tous) ou `1-5` (lundi-vendredi)

## Astuces

- Pour éviter la charge simultanée, utilisez des minutes différentes (ex: 8h15, 9h23, 10h37)
- Testez d'abord avec `*/5 * * * *` (toutes les 5 minutes) pour vérifier que ça fonctionne
- Vercel exécute les crons en UTC, ajustez selon votre fuseau horaire





