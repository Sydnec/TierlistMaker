const sqlite3 = require("sqlite3").verbose();
const path = require("path");

class Database {
  constructor() {
    if (Database.instance) {
      return Database.instance;
    }
    
    // Forcer un chemin absolu depuis la racine du projet pour éviter les problèmes de contexte
    this.dbPath = path.resolve(process.cwd(), "data", "tierlist-maker.db");
    this.db = null;
    this.initializeDatabase();
    
    Database.instance = this;
  }

  static getInstance() {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  initializeDatabase() {
    // Créer le dossier data s'il n'existe pas
    const fs = require("fs");
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    console.log("🗄️ Chemin de la base de données:", this.dbPath);
    console.log("🗄️ Base de données existe:", fs.existsSync(this.dbPath));

    // Connexion à la base de données avec mode sérialisé
    this.db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
      if (err) {
        console.error("Erreur lors de la connexion à SQLite:", err.message);
      } else {
        console.log("Connexion réussie à la base de données SQLite");
        // Activer le mode WAL pour améliorer la concurrence
        this.db.run("PRAGMA journal_mode=WAL;");
        // Activer les foreign keys
        this.db.run("PRAGMA foreign_keys=ON;");
        // Timeout pour les verrous
        this.db.run("PRAGMA busy_timeout=10000;");
        this.createTables();
      }
    });

    // Forcer le mode sérialisé
    this.db.serialize();
  }

  createTables() {
    console.log("📋 Création/vérification des tables...");
    
    // Table pour les items
    this.db.run(
      `
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        image TEXT,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `,
      (err) => {
        if (err) {
          console.error("❌ Erreur création table items:", err);
        } else {
          console.log("✅ Table items créée/vérifiée avec succès");
        }
      }
    );

    // Table pour les tiers personnalisés
    this.db.run(
      `
      CREATE TABLE IF NOT EXISTS tiers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        position INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `,
      (err) => {
        if (err) {
          console.error("❌ Erreur création table tiers:", err);
        } else {
          console.log("✅ Table tiers créée/vérifiée avec succès");
          // Insérer les tiers par défaut seulement si la table est vide
          this.db.get('SELECT COUNT(*) as count FROM tiers', (err, row) => {
            if (err) {
              console.error('Erreur lors de la vérification du nombre de tiers:', err);
            } else if (row.count === 0) {
              console.log("🎯 Initialisation des tiers par défaut...");
              this.initializeDefaultTiers();
            } else {
              console.log(`🎯 ${row.count} tiers déjà présents, pas d'initialisation`);
            }
          });
        }
      }
    );

    // Table pour les affectations des items aux tiers
    this.db.run(
      `
      CREATE TABLE IF NOT EXISTS tier_assignments (
        item_id TEXT,
        tier_id TEXT,
        position INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (item_id),
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (tier_id) REFERENCES tiers(id)
      )
    `,
      (err) => {
        if (err) {
          console.error("Erreur création table tier_assignments:", err);
        }
      }
    );
  }

  initializeDefaultTiers() {
    const defaultTiers = [
      { id: "S", name: "S - Légendaire", color: "#ff6b6b", position: 0 },
      { id: "A", name: "A - Excellent", color: "#4ecdc4", position: 1 },
      { id: "B", name: "B - Très bon", color: "#45b7d1", position: 2 },
      { id: "C", name: "C - Bon", color: "#96ceb4", position: 3 },
      { id: "D", name: "D - Moyen", color: "#feca57", position: 4 },
    ];

    defaultTiers.forEach((tier) => {
      this.db.run(
        `INSERT OR IGNORE INTO tiers (id, name, color, position) VALUES (?, ?, ?, ?)`,
        [tier.id, tier.name, tier.color, tier.position]
      );
    });
  }

  // Méthodes pour les items
  async addItem(itemData) {
    console.log("🗃️ Database.addItem appelée avec:", {
      id: itemData.id,
      name: itemData.name,
      image: itemData.image,
      description: itemData.description,
    });

    return new Promise((resolve, reject) => {
      const db = this.db; // Référence locale pour éviter les problèmes de contexte
      const {
        id,
        name,
        image = null,
        description = null,
      } = itemData;

      // Utiliser une transaction simple sans imbrication
      db.run(
        `INSERT OR REPLACE INTO items 
         (id, name, image, description, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [id, name, image, description],
        function (err) {
          if (err) {
            console.error("🗃️ Erreur SQL dans addItem:", err);
            reject(err);
          } else {
            console.log("🗃️ Item ajouté en base - lastID:", this.lastID, "changes:", this.changes);
            
            // Vérification supplémentaire : compter tous les items
            db.get(
              "SELECT COUNT(*) as count FROM items",
              [],
              (countErr, countRow) => {
                if (countErr) {
                  console.error("🗃️ Erreur lors du comptage:", countErr);
                } else {
                  console.log("📊 Total items dans la BDD après insertion:", countRow.count);
                }
                
                // Vérification supplémentaire : lire l'item qui vient d'être ajouté
                db.get(
                  "SELECT id FROM items WHERE id = ?",
                  [id],
                  (err, row) => {
                    if (err) {
                      console.error("🗃️ Erreur lors de la vérification:", err);
                      reject(err);
                    } else if (row) {
                      console.log("✅ Item confirmé en base après ajout:", row.id);
                      resolve({ id: this.lastID, changes: this.changes });
                    } else {
                      console.error("❌ Item non trouvé après insertion:", id);
                      reject(new Error("Item non sauvegardé"));
                    }
                  }
                );
              }
            );
          }
        }
      );
    });
  }

  async getAllItems() {
    console.log("🔍 getAllItems appelée - début de la requête");
    
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT id, name, image, description, created_at, updated_at FROM items ORDER BY name`,
        [],
        (err, rows) => {
          if (err) {
            console.error("❌ Erreur SQL dans getAllItems:", err);
            reject(err);
          } else {
            console.log(`🔍 Requête getAllItems terminée - ${rows.length} résultats bruts`);
            console.log("📊 Détail des rows:", JSON.stringify(rows, null, 2));
            
            // Retourner directement les items avec le nouveau format
            const items = rows.map((row) => ({
              id: row.id,
              name: row.name,
              image: row.image,
              description: row.description,
              created_at: row.created_at,
              updated_at: row.updated_at,
            }));
            
            console.log(`✅ getAllItems retourne ${items.length} items formatés`);
            resolve(items);
          }
        }
      );
    });
  }

  async deleteItem(itemId) {
    console.log(
      "🗃️ Database.deleteItem appelée avec ID:",
      itemId,
      "type:",
      typeof itemId
    );
    return new Promise(async (resolve, reject) => {
      try {
        // Chercher l'item par ID exact
        const exactMatch = await new Promise((res, rej) => {
          this.db.get(
            `SELECT id FROM items WHERE id = ?`,
            [itemId],
            (err, row) => {
              if (err) rej(err);
              else res(row);
            }
          );
        });

        if (!exactMatch) {
          console.log("❌ Item non trouvé avec ID:", itemId);
          resolve({ tierChanges: 0, itemChanges: 0 });
          return;
        }

        const itemToDelete = exactMatch.id;
        console.log("🎯 Item trouvé par ID exact:", itemToDelete);

        // Récupérer les informations de l'item avant suppression (pour supprimer l'image)
        const itemData = await new Promise((res, rej) => {
          this.db.get(
            `SELECT * FROM items WHERE id = ?`,
            [itemToDelete],
            (err, row) => {
              if (err) rej(err);
              else res(row);
            }
          );
        });

        // Vérifier si d'autres items utilisent cette image AVANT la suppression
        let canDeleteImage = false;
        if (itemData && itemData.image) {
          const otherItemsUsingImage = await new Promise((res, rej) => {
            this.db.get(
              `SELECT COUNT(*) as count FROM items WHERE image = ? AND id != ?`,
              [itemData.image, itemToDelete],
              (err, row) => {
                if (err) rej(err);
                else res(row.count);
              }
            );
          });

          canDeleteImage = otherItemsUsingImage === 0;
          console.log(`🔍 Autres items utilisant l'image "${itemData.image}": ${otherItemsUsingImage}`);
        }

        // Supprimer d'abord les affectations aux tiers
        console.log(
          "🗃️ Suppression des affectations de tiers pour:",
          itemToDelete
        );
        const tierResult = await new Promise((res, rej) => {
          this.db.run(
            `DELETE FROM tier_assignments WHERE item_id = ?`,
            [itemToDelete],
            function (err) {
              if (err) rej(err);
              else res({ changes: this.changes });
            }
          );
        });
        console.log(
          "🗃️ Affectations supprimées:",
          tierResult.changes,
          "lignes"
        );

        // Ensuite supprimer l'item
        console.log("🗃️ Suppression de l'item:", itemToDelete);
        const itemResult = await new Promise((res, rej) => {
          this.db.run(
            `DELETE FROM items WHERE id = ?`,
            [itemToDelete],
            function (err) {
              if (err) rej(err);
              else res({ changes: this.changes });
            }
          );
        });
        console.log("🗃️ Item supprimé:", itemResult.changes, "lignes");

        // Supprimer l'image du système de fichiers si elle n'est plus utilisée
        if (itemData && itemData.image && canDeleteImage) {
          try {
            const fs = require("fs").promises;
            const path = require("path");
            const imagePath = path.join(process.cwd(), "public", itemData.image);
            
            console.log("🖼️ Suppression de l'image non utilisée:", imagePath);
            await fs.unlink(imagePath);
            console.log("✅ Image supprimée avec succès");
          } catch (imageErr) {
            console.warn("⚠️ Erreur lors de la suppression de l'image:", imageErr.message);
            // Ne pas faire échouer la suppression de l'item si l'image ne peut pas être supprimée
          }
        } else if (itemData && itemData.image && !canDeleteImage) {
          console.log(`🔗 Image conservée car utilisée par d'autres items:`, itemData.image);
        }

        resolve({
          tierChanges: tierResult.changes,
          itemChanges: itemResult.changes,
        });
      } catch (error) {
        console.error("🗃️ Erreur dans deleteItem:", error);
        reject(error);
      }
    });
  }

  // Méthodes pour les tiers
  async getAllTiers() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM tiers ORDER BY position ASC`,
        [],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  async updateTiers(tiers) {
    return new Promise(async (resolve, reject) => {
      try {
        // Supprimer tous les tiers existants
        await new Promise((res, rej) => {
          this.db.run(`DELETE FROM tiers`, [], (err) => {
            if (err) rej(err);
            else res();
          });
        });

        // Insérer les nouveaux tiers
        for (let i = 0; i < tiers.length; i++) {
          const tier = tiers[i];
          await new Promise((res, rej) => {
            this.db.run(
              `INSERT INTO tiers (id, name, color, position) VALUES (?, ?, ?, ?)`,
              [tier.id, tier.name, tier.color, i],
              (err) => {
                if (err) rej(err);
                else res();
              }
            );
          });
        }

        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  // Méthodes pour les affectations
  async assignItemToTier(itemId, tierId, position = 0) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO tier_assignments (item_id, tier_id, position, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        [itemId, tierId, position],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve({ changes: this.changes });
          }
        }
      );
    });
  }

  async removeItemFromTier(itemId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `DELETE FROM tier_assignments WHERE item_id = ?`,
        [itemId],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve({ changes: this.changes });
          }
        }
      );
    });
  }

  async getTierAssignments() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM tier_assignments ORDER BY tier_id, position ASC`,
        [],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            // Convertir en Map pour compatibilité avec le code existant
            const assignments = {};
            const orders = {};

            rows.forEach((row) => {
              assignments[row.item_id] = row.tier_id;

              if (!orders[row.tier_id]) {
                orders[row.tier_id] = [];
              }
              orders[row.tier_id].push(row.item_id);
            });

            resolve({ assignments, orders });
          }
        }
      );
    });
  }

  async getFullState() {
    try {
      const t0 = Date.now();
      const items = await this.getAllItems();
      const t1 = Date.now();
      const tiers = await this.getAllTiers();
      const t2 = Date.now();
      const { assignments, orders } = await this.getTierAssignments();
      const t3 = Date.now();

      console.log(`[PERF] getAllItems: ${t1 - t0}ms, getAllTiers: ${t2 - t1}ms, getTierAssignments: ${t3 - t2}ms`);

      return {
        items,
        tiers,
        tierAssignments: assignments,
        tierOrders: orders,
        lastModified: Date.now(),
      };
    } catch (error) {
      console.error("Erreur lors de la récupération de l'état complet:", error);
      throw error;
    }
  }

  async updateItem(id, setQuery) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE items SET ${setQuery} WHERE id = ?`,
        [id],
        function (err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        }
      );
    });
  }

  // Méthode utilitaire pour nettoyer les images orphelines
  async cleanupOrphanedImages() {
    try {
      const fs = require("fs").promises;
      const path = require("path");
      const imagesDir = path.join(process.cwd(), "public", "images");
      
      // Récupérer tous les chemins d'images utilisés en base
      const usedImages = await new Promise((resolve, reject) => {
        this.db.all(
          `SELECT DISTINCT image FROM items WHERE image IS NOT NULL`,
          [],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows.map(row => row.image));
          }
        );
      });

      console.log(`🧹 ${usedImages.length} images référencées en base de données`);

      try {
        // Lister tous les fichiers dans le dossier images
        const files = await fs.readdir(imagesDir);
        let deletedCount = 0;

        for (const fileName of files) {
          const relativePath = `images/${fileName}`;
          
          // Si l'image n'est pas référencée en base, la supprimer
          if (!usedImages.includes(relativePath)) {
            const filePath = path.join(imagesDir, fileName);
            await fs.unlink(filePath);
            console.log(`🗑️ Image orpheline supprimée: ${fileName}`);
            deletedCount++;
          }
        }

        console.log(`✅ Nettoyage terminé: ${deletedCount} images orphelines supprimées`);
        return { deletedCount, usedImagesCount: usedImages.length };
      } catch (dirErr) {
        console.log("📁 Dossier images inexistant ou vide");
        return { deletedCount: 0, usedImagesCount: usedImages.length };
      }
    } catch (error) {
      console.error("❌ Erreur lors du nettoyage des images orphelines:", error);
      throw error;
    }
  }

  async manualSelect(query) {
    return new Promise((resolve, reject) => {
      this.db.all(
        query,
        [],
        function (err, rows) {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  async manualRun(query, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(query, params, function (err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  }

  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error(
            "Erreur lors de la fermeture de la base de données:",
            err.message
          );
        } else {
          console.log("Connexion à la base de données fermée");
        }
      });
    }
  }
}

module.exports = Database;
