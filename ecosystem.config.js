module.exports = {
  apps: [
    {
      name: 'tierlist-maker',
      script: 'server.js',
      cwd: '/home/sydnec/tierlistmaker',
      instances: 1, // Vous pouvez augmenter selon vos besoins
      exec_mode: 'fork', // 'cluster' si vous voulez plusieurs instances
      env: {
        NODE_ENV: 'development',
        PORT: 3003
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3003
      },
      // Options de monitoring et logs
      log_file: './logs/app.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Restart automatique en cas d'erreur
      autorestart: true,
      watch: false, // Désactivé en production pour les performances
      max_memory_restart: '1G',

      // Variables d'environnement spécifiques
      node_args: '--max-old-space-size=1024',

      // Délai avant restart
      restart_delay: 4000,

      // Ignore certains signaux pour un arrêt propre
      kill_timeout: 5000,
      listen_timeout: 3000,

      // Health check
      health_check_grace_period: 3000
    }
  ]
};
