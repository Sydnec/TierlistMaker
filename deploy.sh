#!/bin/bash

# Script de déploiement pour TierListMaker
# Usage: ./deploy.sh [start|restart|stop|status]

set -e

PROJECT_DIR="/home/sydnec/tierlistmaker"
APP_NAME="tierlist-maker"

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

cd $PROJECT_DIR

case "${1:-start}" in
    "start")
        log_info "🚀 Démarrage du déploiement en production..."
        
        # Vérifier que les dépendances sont installées
        if [ ! -d "node_modules" ]; then
            log_info "📦 Installation des dépendances..."
            npm ci --production
        fi
        
        # Construire l'application
        log_info "🔨 Construction de l'application..."
        npm run build
        
        # Vérifier si l'app PM2 existe déjà
        if pm2 describe $APP_NAME > /dev/null 2>&1; then
            log_warn "⚠️  L'application existe déjà, redémarrage..."
            npm run pm2:reload
        else
            log_info "🌟 Démarrage de l'application avec PM2..."
            npm run pm2:start
        fi
        
        log_info "✅ Déploiement terminé !"
        npm run pm2:status
        ;;
        
    "restart")
        log_info "🔄 Redémarrage de l'application..."
        npm run pm2:restart
        npm run pm2:status
        ;;
        
    "reload")
        log_info "♻️  Rechargement de l'application (zero-downtime)..."
        npm run build
        npm run pm2:reload
        npm run pm2:status
        ;;
        
    "stop")
        log_info "🛑 Arrêt de l'application..."
        npm run pm2:stop
        ;;
        
    "status")
        log_info "📊 Statut de l'application..."
        npm run pm2:status
        ;;
        
    "logs")
        log_info "📝 Affichage des logs..."
        npm run pm2:logs
        ;;
        
    "monit")
        log_info "📈 Monitoring de l'application..."
        npm run pm2:monit
        ;;
        
    *)
        echo "Usage: $0 [start|restart|reload|stop|status|logs|monit]"
        echo ""
        echo "Commandes disponibles:"
        echo "  start   - Démarre l'application (build + start PM2)"
        echo "  restart - Redémarre l'application"
        echo "  reload  - Rechargement sans interruption (build + reload PM2)"
        echo "  stop    - Arrête l'application"
        echo "  status  - Affiche le statut PM2"
        echo "  logs    - Affiche les logs en temps réel"
        echo "  monit   - Ouvre le monitoring PM2"
        exit 1
        ;;
esac
