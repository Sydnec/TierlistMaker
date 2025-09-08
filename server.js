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
    console.time(`Chargement état tierlist ${tierlistId}`);
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
    console.timeEnd(`Chargement état tierlist ${tierlistId}`);
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

  // Gestion des connexions WebSocket
  io.on("connection", (socket) => {
    console.log(`Utilisateur connecté: ${socket.id}`);

    // Rejoindre le hub global (pour les notifications de nouvelles tierlists)
    socket.on("join-hub", () => {
      socket.join("global-hub");
      console.log(`Utilisateur ${socket.id} a rejoint le hub global`);
    });

    // Quitter le hub global
    socket.on("leave-hub", () => {
      socket.leave("global-hub");
      console.log(`Utilisateur ${socket.id} a quitté le hub global`);
    });

    // Rejoindre une tierlist spécifique
    socket.on("join-tierlist", async (tierlistId) => {
      socket.tierlistId = tierlistId;
      socket.join(`tierlist-${tierlistId}`);

      const room = getTierlistRoom(tierlistId);
      room.connectedUsers++;

      // Charger l'état de la tierlist si pas encore fait
      if (room.items.length === 0) {
        await loadTierlistStateFromDB(tierlistId);
      }

      console.log(
        `Utilisateur ${socket.id} a rejoint tierlist ${tierlistId} (Total: ${room.connectedUsers})`
      );

      // Envoie l'état initial au nouveau client
      socket.emit("initial-state", room);

      // Notifie tous les clients de cette tierlist du nombre d'utilisateurs connectés
      io.to(`tierlist-${tierlistId}`).emit("users-count", room.connectedUsers);
    });

    // Ajout d'un item
    socket.on("item-add", async (itemData) => {
      if (!socket.tierlistId) return;

      const room = getTierlistRoom(socket.tierlistId);

      // S'assurer que les champs correspondent au nouveau schéma
      if (itemData.title && !itemData.name) {
        itemData.name = itemData.title;
      }

      // Nettoyer les données
      const cleanedItemData = {
        id: itemData.id,
        tierlist_id: socket.tierlistId,
        name: itemData.name,
        image: itemData.image || null,
        description: itemData.description || null,
        created_at: itemData.created_at || new Date().toISOString(),
        updated_at: itemData.updated_at || new Date().toISOString(),
      };

      console.log(
        `📥 Item ajouté dans tierlist ${socket.tierlistId}:`,
        cleanedItemData.name,
        "ID:",
        cleanedItemData.id
      );

      try {
        // Vérifie si l'item existe déjà dans cette tierlist
        const existingIndex = room.items.findIndex((item) => {
          if (item.id && cleanedItemData.id && item.id === cleanedItemData.id) {
            return true;
          }
          if (item.name === cleanedItemData.name && item.image === cleanedItemData.image) {
            return true;
          }
          return false;
        });

        if (existingIndex === -1) {
          // Assigne un ID unique si nécessaire
          if (!cleanedItemData.id) {
            cleanedItemData.id = `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          }

          console.log("💾 Sauvegarde en base de données...");
          await db.addItem(cleanedItemData);
          console.log("✅ Sauvegarde en base de données réussie");

          // Met à jour l'état en mémoire de la room
          room.items.push(cleanedItemData);
          room.lastModified = Date.now();

          // Diffuse à tous les clients de cette tierlist
          io.to(`tierlist-${socket.tierlistId}`).emit("item-added", cleanedItemData);
        } else {
          console.log("⚠️ Item déjà existant dans cette tierlist");
        }
      } catch (error) {
        console.error("❌ Erreur lors de l'ajout d'item:", error);
      }
    });

    // Déplacement d'un item vers un tier
    socket.on("item-move", async (data) => {
      if (!socket.tierlistId) return;

      const { itemId, tierId, position } = data;
      const room = getTierlistRoom(socket.tierlistId);

      console.log(
        `Item ${itemId} déplacé vers tier ${tierId} dans tierlist ${socket.tierlistId}`
      );

      try {
        // Sauvegarde en base de données
        if (tierId === "unranked") {
          await db.removeItemFromTier(itemId);
        }

        // Met à jour l'état en mémoire de la room
        if (tierId === "unranked") {
          delete room.tierAssignments[itemId];
        } else {
          room.tierAssignments[itemId] = tierId;
        }

        room.lastModified = Date.now();

        // Notifie tous les clients de cette tierlist
        io.to(`tierlist-${socket.tierlistId}`).emit("item-moved", data);
      } catch (error) {
        console.error("❌ Erreur lors du déplacement de l'item:", error);
      }
    });

    // Suppression d'un item
    socket.on("item-delete", async (itemId) => {
      if (!socket.tierlistId) return;

      const room = getTierlistRoom(socket.tierlistId);

      console.log(`Suppression de l'item ${itemId} dans tierlist ${socket.tierlistId}`);

      try {
        await db.deleteItem(itemId);

        // Met à jour l'état en mémoire de la room
        room.items = room.items.filter((item) => item.id !== itemId);
        delete room.tierAssignments[itemId];
        room.lastModified = Date.now();

        // Notifie tous les clients de cette tierlist
        io.to(`tierlist-${socket.tierlistId}`).emit("item-deleted", itemId);
      } catch (error) {
        console.error("❌ Erreur lors de la suppression de l'item:", error);
      }
    });

    // Mise à jour d'un item
    socket.on("item-update", async (updatedItem) => {
      if (!socket.tierlistId) return;

      const room = getTierlistRoom(socket.tierlistId);

      console.log(`Mise à jour de l'item ${updatedItem.id} dans tierlist ${socket.tierlistId}`);

      try {
        await db.updateItem(updatedItem.id, updatedItem);

        // Met à jour l'état en mémoire de la room
        const itemIndex = room.items.findIndex((item) => item.id === updatedItem.id);
        if (itemIndex !== -1) {
          room.items[itemIndex] = { ...room.items[itemIndex], ...updatedItem };
          room.lastModified = Date.now();
        }

        // Notifie tous les clients de cette tierlist
        io.to(`tierlist-${socket.tierlistId}`).emit("item-updated", updatedItem);
      } catch (error) {
        console.error("❌ Erreur lors de la mise à jour de l'item:", error);
      }
    });

    // Mise à jour des tiers
    socket.on("tiers-update", async (newTiers) => {
      if (!socket.tierlistId) return;

      const room = getTierlistRoom(socket.tierlistId);

      console.log(`Mise à jour des tiers dans tierlist ${socket.tierlistId}`);

      try {
        // Adapter les tiers pour inclure le tierlist_id
        const tiersWithTierlistId = newTiers.map(tier => ({
          ...tier,
          tierlist_id: socket.tierlistId
        }));

        await db.updateTiers(tiersWithTierlistId);

        // Met à jour l'état en mémoire de la room
        room.tiers = newTiers;
        room.lastModified = Date.now();

        // Notifie tous les clients de cette tierlist
        io.to(`tierlist-${socket.tierlistId}`).emit("tiers-updated", newTiers);
      } catch (error) {
        console.error("❌ Erreur lors de la mise à jour des tiers:", error);
      }
    });

    // Gestion de la déconnexion
    socket.on("disconnect", () => {
      if (socket.tierlistId) {
        const room = getTierlistRoom(socket.tierlistId);
        room.connectedUsers--;

        console.log(
          `Utilisateur ${socket.id} déconnecté de tierlist ${socket.tierlistId} (Total: ${room.connectedUsers})`
        );

        // Notifie les clients restants de cette tierlist
        io.to(`tierlist-${socket.tierlistId}`).emit("users-count", room.connectedUsers);
      } else {
        console.log(`Utilisateur ${socket.id} déconnecté`);
      }
    });
  });

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

  // Exposer la fonction de notification pour les autres parties de l'application
  global.notifyHubNewTierlist = function (tierlist) {
    console.log('🔔 Notification hub nouvelle tierlist:', tierlist.name);
    io.to("global-hub").emit("new-tierlist", tierlist);
  };
});

module.exports = { reloadTierlistState };
