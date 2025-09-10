const { createServer } = require("http");
const { Server } = require("socket.io");
const next = require("next");
const Database = require("./src/database/db");

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = process.env.PORT || 3000;

// Prepare the Next.js app
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

// Initialiser la base de données (singleton)
const db = Database.getInstance();

// État collaboratif en mémoire par tierlist (synchronisé avec la DB)
let tierlistRooms = new Map(); // Map<tierlistId, roomState>

// Fonction pour obtenir ou créer une room
function getTierlistRoom(tierlistId) {
  if (!tierlistRooms.has(tierlistId)) {
    tierlistRooms.set(tierlistId, {
      items: [],
      tierAssignments: {},
      tiers: [],
      tierOrders: {},
      connectedUsers: 0,
      lastModified: Date.now(),
    });
  }
  return tierlistRooms.get(tierlistId);
}

// Fonction pour charger l'état d'une tierlist depuis la base de données
async function loadTierlistStateFromDB(tierlistId) {
  try {
    const timestamp = Date.now();
    console.time(`Chargement état tierlist ${tierlistId}-${timestamp}`);
    const state = await db.getFullState(tierlistId);
    const room = getTierlistRoom(tierlistId);

    // Conserver le nombre d'utilisateurs connectés
    const currentConnectedUsers = room.connectedUsers;

    Object.assign(room, {
      ...state,
      connectedUsers: currentConnectedUsers,
    });

    console.log(
      `État tierlist ${tierlistId} chargé: ${state.items.length} items, ${state.tiers.length} tiers`
    );
    console.timeEnd(`Chargement état tierlist ${tierlistId}-${timestamp}`);
  } catch (error) {
    console.error(
      `Erreur lors du chargement de la tierlist ${tierlistId}:`,
      error
    );
  }
}

// Fonction publique pour recharger l'état d'une tierlist (utilisée par l'API d'upload)
async function reloadTierlistState(tierlistId) {
  console.log(`🔄 Rechargement de l'état de la tierlist ${tierlistId}...`);
  await loadTierlistStateFromDB(tierlistId);
  return getTierlistRoom(tierlistId);
}

app.prepare().then(async () => {
  // Les tierlists seront chargées à la demande
  const httpServer = createServer((req, res) => {
    // Servir les fichiers statiques depuis /public
    if (req.url && req.url.startsWith('/images/')) {
      const path = require('path');
      const fs = require('fs');

      const filePath = path.join(process.cwd(), 'public', req.url);

      fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Image not found');
        } else {
          const ext = path.extname(filePath).toLowerCase();
          const mimeTypes = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml'
          };

          const contentType = mimeTypes[ext] || 'application/octet-stream';

          fs.readFile(filePath, (readErr, data) => {
            if (readErr) {
              res.writeHead(500, { 'Content-Type': 'text/plain' });
              res.end('Internal server error');
            } else {
              res.writeHead(200, { 'Content-Type': contentType });
              res.end(data);
            }
          });
        }
      });
    } else {
      // Laisser Next.js gérer tout le reste
      handler(req, res);
    }
  });

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // Déléguer la logique WebSocket à un module dédié (réécriture du WS)
  try {
    const wsModule = require('./src/server/ws');
    // initialize retournera des helpers (notifyHubNewTierlist, reloadTierlistState)
    const wsApi = wsModule.initialize(io, db);

    // Exposer la fonction de notification pour le reste de l'application
    if (wsApi && typeof wsApi.notifyHubNewTierlist === 'function') {
      global.notifyHubNewTierlist = wsApi.notifyHubNewTierlist;
    }

    console.log('ℹ️ Si vous migrez une BDD existante pour retirer la colonne is_public, utilisez scripts/remove-is-public-column.js');

  } catch (err) {
    console.error('❌ Erreur lors de l\'initialisation du module WS:', err);
  }

  httpServer
    .once("error", (err) => {
      console.error(err);
      db.close();
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
      console.log("> Socket.io server running for collaborative features");
    });

  // NOTE: la fonction notifyHubNewTierlist est désormais exposée par le module WS
});

module.exports = { reloadTierlistState };
