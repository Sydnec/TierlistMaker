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

// État collaboratif en mémoire (synchronisé avec la DB)
let collaborativeState = {
  items: [],
  tierAssignments: {},
  tiers: [],
  tierOrders: {},
  connectedUsers: 0,
  lastModified: Date.now(),
};

// Fonction pour charger l'état depuis la base de données
async function loadStateFromDB() {
  try {
    console.time('Chargement complet état BDD');
    const state = await db.getFullState();
    collaborativeState = {
      ...state,
      connectedUsers: 0,
    };
    console.log(
      `État chargé depuis la base de données: ${state.items.length} items, ${state.tiers.length} tiers`
    );
    console.timeEnd('Chargement complet état BDD');
  } catch (error) {
    console.error(
      "Erreur lors du chargement depuis la base de données:",
      error
    );
  }
}

app.prepare().then(async () => {
  // Charger l'état depuis la base de données au démarrage
  await loadStateFromDB();
  const httpServer = createServer((req, res) => {
    // Servir les fichiers statiques depuis /public
    if (req.url && req.url.startsWith('/images/')) {
      const path = require('path');
      const fs = require('fs');
      
      const filePath = path.join(process.cwd(), 'public', req.url);
      
      fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
          res.writeHead(404, {'Content-Type': 'text/plain'});
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
              res.writeHead(500, {'Content-Type': 'text/plain'});
              res.end('Internal server error');
            } else {
              res.writeHead(200, {'Content-Type': contentType});
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
    collaborativeState.connectedUsers++;
    console.log(
      `Utilisateur connecté: ${socket.id} (Total: ${collaborativeState.connectedUsers})`
    );

    // Envoie l'état initial au nouveau client
    socket.emit("initial-state", collaborativeState);

    // Notifie tous les clients du nombre d'utilisateurs connectés
    io.emit("users-count", collaborativeState.connectedUsers);

    // Ajout d'un item
    socket.on("item-add", async (itemData) => {
      // S'assurer que les champs correspondent au nouveau schéma (name au lieu de title)
      if (itemData.title && !itemData.name) {
        itemData.name = itemData.title;
      }
      
      // Nettoyer les anciens champs si présents
      const cleanedItemData = {
        id: itemData.id,
        name: itemData.name,
        image: itemData.image || null,
        description: itemData.description || null,
        created_at: itemData.created_at || new Date().toISOString(),
        updated_at: itemData.updated_at || new Date().toISOString(),
      };

      console.log(
        "📥 Item ajouté:",
        cleanedItemData.name,
        "ID:",
        cleanedItemData.id
      );
      console.log("📊 État avant ajout:", {
        items: collaborativeState.items.length,
        tierAssignments: Object.keys(collaborativeState.tierAssignments).length,
      });

      try {
        // Vérifie si l'item existe déjà
        const existingIndex = collaborativeState.items.findIndex((item) => {
          // Compare par ID
          if (item.id && cleanedItemData.id && item.id === cleanedItemData.id) {
            return true;
          }
          // Compare par nom si même nom et image
          if (item.name === cleanedItemData.name && item.image === cleanedItemData.image) {
            return true;
          }
          return false;
        });

        console.log("🔍 Vérification existence - Index trouvé:", existingIndex);
        if (existingIndex !== -1) {
          console.log(
            "⚠️ Item déjà existant:",
            collaborativeState.items[existingIndex].name || collaborativeState.items[existingIndex].title
          );
        }

        if (existingIndex === -1) {
          // Assigne un ID unique si nécessaire
          if (!cleanedItemData.id) {
            cleanedItemData.id = `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            console.log("🆔 ID assigné:", cleanedItemData.id);
          }

          console.log("💾 Sauvegarde en base de données...");
          // Sauvegarde en base de données
          await db.addItem(cleanedItemData);
          console.log("✅ Sauvegarde en base de données réussie");

          // Met à jour l'état en mémoire
          collaborativeState.items.push(cleanedItemData);
          collaborativeState.lastModified = Date.now();

          console.log("📊 État après ajout:", {
            items: collaborativeState.items.length,
            tierAssignments: Object.keys(collaborativeState.tierAssignments)
              .length,
          });

          console.log(
            "📡 Émission de l'événement item-added vers tous les clients"
          );
          // Notifie tous les clients
          io.emit("item-added", cleanedItemData);
        } else {
          console.log("❌ Item non ajouté car il existe déjà");
        }
      } catch (error) {
        console.error("❌ Erreur lors de l'ajout de l'item:", error);
        socket.emit("error", { message: "Erreur lors de l'ajout de l'item" });
      }
    });

    // Déplacement d'un item vers un tier
    socket.on("item-move", async (data) => {
      const { itemId, tierId, position } = data;
      console.log(
        `Item ${itemId} déplacé vers tier ${tierId} à la position ${position}`
      );

      try {
        // Sauvegarde en base de données
        if (tierId === "unranked") {
          await db.removeItemFromTier(itemId);
        }

        // Met à jour l'état en mémoire
        if (tierId === "unranked") {
          delete collaborativeState.tierAssignments[itemId];
        } else {
          collaborativeState.tierAssignments[itemId] = tierId;
        }

        // Met à jour l'ordre dans le tier
        if (!collaborativeState.tierOrders[tierId]) {
          collaborativeState.tierOrders[tierId] = [];
        }

        // Retire l'item de tous les autres tiers
        Object.keys(collaborativeState.tierOrders).forEach((tier) => {
          if (tier !== tierId) {
            const index = collaborativeState.tierOrders[tier].indexOf(itemId);
            if (index !== -1) {
              collaborativeState.tierOrders[tier].splice(index, 1);
            }
          }
        });

        // Ajoute à la position spécifiée dans le nouveau tier
        if (tierId !== "unranked") {
          const tierOrder = collaborativeState.tierOrders[tierId];
          const currentIndex = tierOrder.indexOf(itemId);
          if (currentIndex !== -1) {
            tierOrder.splice(currentIndex, 1);
          }

          const insertPosition = Math.min(position || 0, tierOrder.length);
          tierOrder.splice(insertPosition, 0, itemId);

          // Met à jour la position de tous les items du tier dans la BDD (en parallèle)
          await Promise.all(
            tierOrder.map((id, i) => db.assignItemToTier(id, tierId, i))
          );
        }

        collaborativeState.lastModified = Date.now();

        // Notifie tous les autres clients (pas l'expéditeur)
        socket.broadcast.emit("item-moved", data);
      } catch (error) {
        console.error("Erreur lors du déplacement de l'item:", error);
        socket.emit("error", {
          message: "Erreur lors du déplacement de l'item",
        });
      }
    });

    // Modification des tiers personnalisés
    socket.on("tiers-update", async (newTiers) => {
      console.log("Tiers mis à jour:", newTiers.length);

      try {
        // Sauvegarde en base de données
        await db.updateTiers(newTiers);

        // Met à jour l'état en mémoire
        collaborativeState.tiers = newTiers;
        collaborativeState.lastModified = Date.now();

        // Notifie tous les autres clients
        socket.broadcast.emit("tiers-updated", newTiers);
      } catch (error) {
        console.error("Erreur lors de la mise à jour des tiers:", error);
        socket.emit("error", {
          message: "Erreur lors de la mise à jour des tiers",
        });
      }
    });

    // Import en lot depuis MAL
    socket.on("bulk-import", async (items) => {
      // Adapter chaque item au schéma SQL
      items = items.map(itemData => ({
        ...itemData,
        title: itemData.title || itemData.title_english || itemData.title_original,
        title_english: itemData.title_english || null,
        title_original: itemData.title_original || null,
      }));

      console.log(`Import en lot de ${items.length} items`);

      try {
        let addedCount = 0;
        const addedItems = [];

        for (const itemData of items) {
          console.log(
            `🔄 Processing item ${addedCount + 1}/${items.length}:`,
            itemData.title
          );
          console.log("📋 Item data:", {
            id: itemData.id,
            mal_id: itemData.mal_id,
            title: itemData.title,
          });

          const existingIndex = collaborativeState.items.findIndex((item) => {
            // Compare by ID if both have valid IDs (and not undefined/null)
            if (
              item.id &&
              itemData.id &&
              item.id !== undefined &&
              itemData.id !== undefined &&
              item.id === itemData.id
            ) {
              return true;
            }
            // Compare by mal_id if both have valid mal_ids (not undefined/null/NaN)
            if (
              item.mal_id &&
              itemData.mal_id &&
              item.mal_id !== undefined &&
              itemData.mal_id !== undefined &&
              !isNaN(item.mal_id) &&
              !isNaN(itemData.mal_id) &&
              item.mal_id === itemData.mal_id
            ) {
              return true;
            }
            return false;
          });

          console.log("🔍 Existing index found:", existingIndex);

          if (existingIndex === -1) {
            if (!itemData.id) {
              itemData.id =
                itemData.mal_id || (Date.now() + addedCount).toString();
            }

            console.log("💾 Adding to database:", itemData.title);
            // Sauvegarde en base de données
            await db.addItem(itemData);

            // Met à jour l'état en mémoire
            collaborativeState.items.push(itemData);
            addedItems.push(itemData);
            addedCount++;
            console.log("✅ Successfully added:", itemData.title);
          } else {
            console.log("⚠️ Item already exists:", itemData.title);
          }
        }

        if (addedCount > 0) {
          collaborativeState.lastModified = Date.now();
          console.log(
            `📡 Emitting bulk-imported event with ${addedItems.length} items`
          );
          io.emit("bulk-imported", addedItems);
        }

        console.log(
          `✅ Bulk import completed: ${addedCount} items added out of ${items.length} processed`
        );
      } catch (error) {
        console.error("Erreur lors de l'import en lot:", error);
        socket.emit("error", { message: "Erreur lors de l'import en lot" });
      }
    });

    // Suppression d'un item
    socket.on("item-delete", async (itemId) => {
      console.log("🗑️ Suppression d élément:", itemId);
      console.log("📊 État avant suppression:", {
        items: collaborativeState.items.length,
        tierAssignments: Object.keys(collaborativeState.tierAssignments).length,
      });

      try {
        // Supprime de la base de données (item + affectations)
        console.log("💾 Suppression en base de données...");
        const result = await db.deleteItem(itemId);
        console.log("✅ Suppression en base de données réussie:", result);

        // Si la suppression a réussi, mettre à jour l'état en mémoire
        if (result.itemChanges > 0) {
          // Trouver l'item à supprimer dans l'état (par ID ou mal_id)
          const itemToRemove = collaborativeState.items.find(
            (item) => item.id === itemId || item.mal_id === itemId
          );

          if (itemToRemove) {
            console.log(
              "🎯 Item trouvé dans l'état:",
              itemToRemove.title,
              "ID:",
              itemToRemove.id
            );

            // Supprime de l'état en mémoire en utilisant le bon ID
            const realId = itemToRemove.id;
            collaborativeState.items = collaborativeState.items.filter(
              (item) => item.id !== realId
            );
            delete collaborativeState.tierAssignments[realId];

            // Retire de tous les ordres de tiers
            Object.keys(collaborativeState.tierOrders).forEach((tierId) => {
              if (collaborativeState.tierOrders[tierId]) {
                const index =
                  collaborativeState.tierOrders[tierId].indexOf(realId);
                if (index !== -1) {
                  collaborativeState.tierOrders[tierId].splice(index, 1);
                  console.log(`🔄 Retiré de tier ${tierId}`);
                }
              }
            });

            collaborativeState.lastModified = Date.now();

            console.log(
              "📡 Émission de l'événement item-deleted vers les autres clients avec ID:",
              realId
            );
            // Notifie tous les autres clients (pas l'expéditeur) avec le vrai ID
            socket.broadcast.emit("item-deleted", realId);
          } else {
            console.log("⚠️ Item non trouvé dans l'état en mémoire");
          }
        } else {
          console.log("⚠️ Aucun item supprimé de la base de données");
        }

        console.log("📊 État après suppression:", {
          items: collaborativeState.items.length,
          tierAssignments: Object.keys(collaborativeState.tierAssignments)
            .length,
        });
      } catch (error) {
        console.error("❌ Erreur lors de la suppression de l'item:", error);
        socket.emit("error", {
          message: "Erreur lors de la suppression de l'item",
        });
      }
    });

    // Mise à jour d'un item existant (pour les images enrichies)
    socket.on("item-update", async (updatedItem) => {
      // Adapter au schéma SQL
      updatedItem = {
        ...updatedItem,
        title: updatedItem.title || updatedItem.title_english || updatedItem.title_original,
        title_english: updatedItem.title_english || null,
        title_original: updatedItem.title_original || null,
      };

      console.log(
        "🔄 Mise à jour d'item:",
        updatedItem.title,
        "avec image:",
        updatedItem.image
      );

      try {
        // Trouve l'item existant dans l'état
        const existingIndex = collaborativeState.items.findIndex((item) => {
          return (
            (item.id && updatedItem.id && item.id === updatedItem.id) ||
            (item.mal_id &&
              updatedItem.mal_id &&
              item.mal_id === updatedItem.mal_id)
          );
        });

        if (existingIndex !== -1) {
          // Met à jour en base de données
          await db.addItem(updatedItem); // addItem fait un INSERT OR REPLACE

          // Met à jour l'état en mémoire
          collaborativeState.items[existingIndex] = {
            ...collaborativeState.items[existingIndex],
            ...updatedItem,
          };

          collaborativeState.lastModified = Date.now();

          console.log(`✅ Item mis à jour: ${updatedItem.title}`);

          // Notifie tous les clients de la mise à jour
          io.emit("item-updated", updatedItem);
        } else {
          console.log(
            `⚠️ Item non trouvé pour mise à jour: ${updatedItem.title}`
          );
        }
      } catch (error) {
        console.error("❌ Erreur lors de la mise à jour de l'item:", error);
        socket.emit("error", {
          message: "Erreur lors de la mise à jour de l'item",
        });
      }
    });

    // Synchronisation d'urgence (si un client détecte une désynchronisation)
    socket.on("request-sync", () => {
      socket.emit("full-sync", collaborativeState);
    });

    // Déconnexion
    socket.on("disconnect", () => {
      collaborativeState.connectedUsers--;
      console.log(
        `Utilisateur déconnecté: ${socket.id} (Total: ${collaborativeState.connectedUsers})`
      );

      // Notifie les clients restants
      io.emit("users-count", collaborativeState.connectedUsers);
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
});

// Gestion de la fermeture propre
process.on("SIGINT", () => {
  console.log("Arrêt du serveur...");
  db.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Arrêt du serveur...");
  db.close();
  process.exit(0);
});
