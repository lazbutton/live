#!/bin/bash

# Script pour créer un utilisateur admin dans Supabase
# 
# Usage:
#   ./scripts/create-admin-user.sh admin@example.com "MotDePasse123!"
#
# Ou configurez les variables d'environnement :
#   export NEXT_PUBLIC_SUPABASE_URL="votre_url"
#   export SUPABASE_SERVICE_ROLE_KEY="votre_clé"

set -e

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Charger les variables d'environnement depuis .env.local si disponible
if [ -f .env.local ]; then
  export $(cat .env.local | grep -v '^#' | xargs)
fi

# Vérifier les variables requises
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo -e "${RED}❌ Erreur: Variables d'environnement manquantes${NC}"
  echo "   Veuillez définir NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY"
  echo "   Soit dans .env.local, soit via export"
  exit 1
fi

# Récupérer les arguments
ADMIN_EMAIL="${1:-admin@example.com}"
ADMIN_PASSWORD="${2:-ChangezCeMotDePasse123!}"

echo -e "${YELLOW}📧 Création de l'utilisateur admin: ${ADMIN_EMAIL}${NC}"

# Vérifier si Node.js est disponible
if ! command -v node &> /dev/null; then
  echo -e "${RED}❌ Node.js n'est pas installé${NC}"
  exit 1
fi

# Exécuter le script Node.js
node scripts/create-admin-user.js "$ADMIN_EMAIL" "$ADMIN_PASSWORD"





