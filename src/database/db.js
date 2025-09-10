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

    // Table pour les tierlists (attention: plus de colonne is_public)
    this.db.run(
      `
      CREATE TABLE IF NOT EXISTS tierlists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        share_code TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `,
      (err) => {
        if (err) {
          console.error("❌ Erreur création table tierlists:", err);
        } else {
          console.log("✅ Table tierlists créée/vérifiée avec succès");
          // Ne pas ajouter la colonne is_public ici - elle est retirée
        }
      }
    );

    // Table pour les items
    this.db.run(
      `
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        tierlist_id TEXT,
        name TEXT NOT NULL,
        image TEXT,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tierlist_id) REFERENCES tierlists (id) ON DELETE CASCADE
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

    // Table pour les tiers personnalisés (contient maintenant l'ordre des items)
    this.db.run(
      `
      CREATE TABLE IF NOT EXISTS tiers (
        id TEXT PRIMARY KEY,
        tierlist_id TEXT,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        position INTEGER,
        item_order TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tierlist_id) REFERENCES tierlists (id) ON DELETE CASCADE
      )
    `,
      (err) => {
        if (err) {
          console.error("❌ Erreur création table tiers:", err);
        } else {
          console.log("✅ Table tiers créée/vérifiée avec succès");
          // Ajouter la colonne item_order si elle n'existe pas déjà
          this.db.run(
            `ALTER TABLE tiers ADD COLUMN item_order TEXT DEFAULT '[]'`,
            (alterErr) => {
              if (alterErr && !alterErr.message.includes('duplicate column')) {
                console.log("⚠️ Colonne item_order existe déjà ou erreur:", alterErr.message);
              } else if (!alterErr) {
                console.log("✅ Colonne item_order ajoutée à la table tiers");
              }
            }
          );
        }
      }
    );

    // Migration des données existantes et nettoyage des tables redondantes
    this.migrateToSimplifiedStructure()
      .then(() => this.removeIsPublicColumnIfPresent())
      .catch((e) => console.warn('⚠️ Erreur durant les migrations:', e));
  }

  // Migration sûre pour supprimer la colonne is_public si elle existe
  async removeIsPublicColumnIfPresent() {
    return new Promise((resolve) => {
      try {
        this.db.all("PRAGMA table_info('tierlists')", [], (err, rows) => {
          if (err) {
            console.warn('⚠️ Impossible de vérifier les colonnes de tierlists:', err.message);
            resolve();
            return;
          }

          const hasIsPublic = rows && rows.some(r => r.name === 'is_public');
          if (!hasIsPublic) {
            console.log('ℹ️ Colonne is_public absente — aucune migration nécessaire');
            resolve();
            return;
          }

          console.log('🔧 Migration: suppression de la colonne is_public de tierlists');
          this.db.exec('PRAGMA foreign_keys=OFF; BEGIN TRANSACTION;', (pragmaErr) => {
            if (pragmaErr) {
              console.error('❌ Erreur démarrage transaction migration is_public:', pragmaErr);
              resolve();
              return;
            }

            // Créer une table temporaire sans is_public
            this.db.run(
              `CREATE TABLE IF NOT EXISTS _tierlists_new (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                share_code TEXT UNIQUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
              )`,
              (createErr) => {
                if (createErr) {
                  console.error('❌ Erreur création table temporaire:', createErr);
                  this.db.exec('ROLLBACK; PRAGMA foreign_keys=ON;', () => resolve());
                  return;
                }

                // Copier les données (en ignorant is_public)
                this.db.run(
                  `INSERT OR REPLACE INTO _tierlists_new (id, name, description, share_code, created_at, updated_at)
                   SELECT id, name, description, share_code, created_at, updated_at FROM tierlists`,
                  (copyErr) => {
                    if (copyErr) {
                      console.error('❌ Erreur copie données tierlists:', copyErr);
                      this.db.exec('ROLLBACK; PRAGMA foreign_keys=ON;', () => resolve());
                      return;
                    }

                    // Remplacer l'ancienne table
                    this.db.run('DROP TABLE IF EXISTS tierlists', (dropErr) => {
                      if (dropErr) console.error('❌ Erreur suppression ancienne table tierlists:', dropErr);

                      this.db.run('ALTER TABLE _tierlists_new RENAME TO tierlists', (renameErr) => {
                        if (renameErr) console.error('❌ Erreur renommage table temporaire:', renameErr);

                        this.db.exec('COMMIT; PRAGMA foreign_keys=ON;', (commitErr) => {
                          if (commitErr) console.error('❌ Erreur commit migration is_public:', commitErr);
                          else console.log('✅ Migration is_public terminée avec succès');
                          resolve();
                        });
                      });
                    });
                  }
                );
              }
            );
          });
        });
      } catch (e) {
        console.error('❌ Exception durant removeIsPublicColumnIfPresent:', e);
        resolve();
      }
    });
  }

  // Méthodes pour les items
  async addItem(itemData) {
    console.log("🗃️ Database.addItem appelée avec:", {
      id: itemData.id,
      name: itemData.name,
      image: itemData.image,
      description: itemData.description,
      tierlist_id: itemData.tierlist_id,
    });

    return new Promise((resolve, reject) => {
      const db = this.db; // Référence locale pour éviter les problèmes de contexte
      const {
        id,
        tierlist_id,
        name,
        image = null,
        description = null,
      } = itemData;

      // Utiliser une transaction simple sans imbrication
      db.run(
        `INSERT OR REPLACE INTO items 
         (id, tierlist_id, name, image, description, updated_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [id, tierlist_id, name, image, description],
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
          resolve({ tierChanges: 0, itemChanges: 0 });
          return;
        }

        const itemToDelete = exactMatch.id;

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

        // Supprimer l'item de l'ordre de tous les tiers (nouvelle logique)
        console.log(
          "🗃️ Suppression des affectations de tiers pour:",
          itemToDelete
        );

        // Récupérer tous les tiers et nettoyer leurs item_order
        const tierResult = await new Promise((res, rej) => {
          this.db.all(
            "SELECT id, item_order FROM tiers",
            [],
            (err, rows) => {
              if (err) {
                rej(err);
                return;
              }

              let totalChanges = 0;
              const updatePromises = rows.map(tier => {
                const itemOrder = JSON.parse(tier.item_order || '[]');
                const filteredOrder = itemOrder.filter(id => id !== itemToDelete);

                // Ne mettre à jour que si l'item était présent
                if (itemOrder.length !== filteredOrder.length) {
                  return new Promise((updateRes, updateRej) => {
                    this.db.run(
                      "UPDATE tiers SET item_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                      [JSON.stringify(filteredOrder), tier.id],
                      function (updateErr) {
                        if (updateErr) {
                          updateRej(updateErr);
                        } else {
                          totalChanges += this.changes;
                          updateRes();
                        }
                      }
                    );
                  });
                } else {
                  return Promise.resolve();
                }
              });

              Promise.all(updatePromises).then(() => {
                res({ changes: totalChanges });
              }).catch(rej);
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

  async addTier(tierData) {
    console.log("🗃️ Database.addTier appelée avec:", tierData);

    return new Promise((resolve, reject) => {
      const { id, tierlist_id, name, color, position } = tierData;

      this.db.run(
        `INSERT INTO tiers (id, tierlist_id, name, color, position, updated_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [id, tierlist_id, name, color, position],
        function (err) {
          if (err) {
            console.error("🗃️ Erreur SQL dans addTier:", err);
            reject(err);
          } else {
            console.log("🗃️ Tier ajouté en base - lastID:", this.lastID);
            resolve({ id, tierlist_id, name, color, position });
          }
        }
      );
    });
  }

  // **NOUVELLES MÉTHODES SIMPLIFIÉES**

  // Sauvegarder l'ordre des items dans un tier
  async updateTierOrder(tierId, itemOrder) {
    console.log("🗃️ Database.updateTierOrder appelée avec:", { tierId, itemOrder });

    return new Promise((resolve, reject) => {
      this.db.run(
        "UPDATE tiers SET item_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [JSON.stringify(itemOrder), tierId],
        function (err) {
          if (err) {
            console.error("🗃️ Erreur SQL dans updateTierOrder:", err);
            reject(err);
          } else {
            console.log("🗃️ Ordre des items mis à jour - changes:", this.changes);
            resolve({ changes: this.changes });
          }
        }
      );
    });
  }

  // Obtenir les assignments depuis les tiers (nouvelle logique)
  async getTierAssignmentsFromTiers(tierlistId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT id, item_order FROM tiers WHERE tierlist_id = ?",
        [tierlistId],
        (err, rows) => {
          if (err) {
            console.error("🗃️ Erreur SQL dans getTierAssignmentsFromTiers:", err);
            reject(err);
          } else {
            console.log(`🗃️ ${rows.length} tiers récupérés pour reconstruire les assignments`);

            // Reconstruire les assignments à partir des tiers
            const assignments = {};
            const tierOrders = {};

            rows.forEach(tier => {
              const itemOrder = JSON.parse(tier.item_order || '[]');
              tierOrders[tier.id] = itemOrder;

              // Chaque item dans le tier est assigné à ce tier
              itemOrder.forEach(itemId => {
                assignments[itemId] = tier.id;
              });
            });

            resolve({ assignments, tierOrders });
          }
        }
      );
    });
  }

  // Déplacer un item vers un tier (nouvelle logique)
  async moveItemToTier(itemId, oldTierId, newTierId, newPosition = -1) {
    console.log("🗃️ Database.moveItemToTier appelée avec:", { itemId, oldTierId, newTierId, newPosition });

    return new Promise((resolve, reject) => {
      // Si oldTierId est fourni, retirer l'item de l'ancien tier
      const removeFromOld = oldTierId ? this.removeItemFromTierOrder(itemId, oldTierId) : Promise.resolve();

      removeFromOld.then(() => {
        // Si newTierId est fourni, ajouter l'item au nouveau tier
        if (newTierId && newTierId !== 'unranked') {
          return this.addItemToTierOrder(itemId, newTierId, newPosition);
        } else {
          resolve({ success: true });
        }
      }).then(() => {
        resolve({ success: true });
      }).catch(err => {
        console.error("❌ Erreur lors du déplacement:", err);
        reject(err);
      });
    });
  }

  // Retirer un item de l'ordre d'un tier
  async removeItemFromTierOrder(itemId, tierId) {
    return new Promise((resolve, reject) => {
      // Récupérer l'ordre actuel
      this.db.get(
        "SELECT item_order FROM tiers WHERE id = ?",
        [tierId],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          const currentOrder = JSON.parse(row?.item_order || '[]');
          const newOrder = currentOrder.filter(id => id !== itemId);

          // Mettre à jour l'ordre
          this.db.run(
            "UPDATE tiers SET item_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [JSON.stringify(newOrder), tierId],
            function (updateErr) {
              if (updateErr) {
                reject(updateErr);
              } else {
                resolve({ changes: this.changes });
              }
            }
          );
        }
      );
    });
  }

  // Ajouter un item à l'ordre d'un tier
  async addItemToTierOrder(itemId, tierId, position = -1) {
    return new Promise((resolve, reject) => {
      // Récupérer l'ordre actuel
      this.db.get(
        "SELECT item_order FROM tiers WHERE id = ?",
        [tierId],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          const currentOrder = JSON.parse(row?.item_order || '[]');

          // Retirer l'item s'il existe déjà
          const filteredOrder = currentOrder.filter(id => id !== itemId);

          // Ajouter à la position spécifiée (ou à la fin si position = -1)
          if (position >= 0 && position < filteredOrder.length) {
            filteredOrder.splice(position, 0, itemId);
          } else {
            filteredOrder.push(itemId);
          }

          // Mettre à jour l'ordre
          this.db.run(
            "UPDATE tiers SET item_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [JSON.stringify(filteredOrder), tierId],
            function (updateErr) {
              if (updateErr) {
                reject(updateErr);
              } else {
                resolve({ changes: this.changes });
              }
            }
          );
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

  // Méthodes pour les tierlists
  async createTierlist(tierlistData) {
    console.log("🗃️ Database.createTierlist appelée avec:", tierlistData);

    return new Promise((resolve, reject) => {
      const { id, name, description = null, share_code } = tierlistData;

      this.db.run(
        `INSERT INTO tierlists (id, name, description, share_code, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [id, name, description, share_code],
        function (err) {
          if (err) {
            console.error("🗃️ Erreur SQL dans createTierlist:", err);
            reject(err);
          } else {
            console.log("🗃️ Tierlist créée en base - lastID:", this.lastID);
            resolve({ id, name, description, share_code });
          }
        }
      );
    });
  }

  async getAllTierlists() {
    console.log("🗃️ Database.getAllTierlists appelée");

    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT * FROM tierlists ORDER BY updated_at DESC",
        [],
        (err, rows) => {
          if (err) {
            console.error("🗃️ Erreur SQL dans getAllTierlists:", err);
            reject(err);
          } else {
            console.log(`🗃️ ${rows.length} tierlists récupérées de la base`);
            resolve(rows);
          }
        }
      );
    });
  }

  async getTierlistById(tierlistId) {
    console.log("🗃️ Database.getTierlistById appelée avec:", tierlistId);

    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT * FROM tierlists WHERE id = ?",
        [tierlistId],
        (err, row) => {
          if (err) {
            console.error("🗃️ Erreur SQL dans getTierlistById:", err);
            reject(err);
          } else {
            console.log("🗃️ Tierlist récupérée:", row ? "trouvée" : "non trouvée");
            resolve(row);
          }
        }
      );
    });
  }

  async getTierlistByShareCode(shareCode) {
    console.log("🗃️ Database.getTierlistByShareCode appelée avec:", shareCode);

    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT * FROM tierlists WHERE share_code = ?",
        [shareCode],
        (err, row) => {
          if (err) {
            console.error("🗃️ Erreur SQL dans getTierlistByShareCode:", err);
            reject(err);
          } else {
            console.log("🗃️ Tierlist par share_code:", row ? "trouvée" : "non trouvée");
            resolve(row);
          }
        }
      );
    });
  }

  async updateTierlistShareCode(tierlistId, shareCode) {
    console.log("🗃️ Database.updateTierlistShareCode appelée avec:", { tierlistId, shareCode });

    return new Promise((resolve, reject) => {
      this.db.run(
        "UPDATE tierlists SET share_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [shareCode, tierlistId],
        function (err) {
          if (err) {
            console.error("🗃️ Erreur SQL dans updateTierlistShareCode:", err);
            reject(err);
          } else {
            console.log("🗃️ Share code mis à jour:", this.changes > 0 ? "succès" : "aucune modification");
            resolve({ changes: this.changes });
          }
        }
      );
    });
  }

  async updateTierlist(tierlistId, updates) {
    console.log("🗃️ Database.updateTierlist appelée avec:", { tierlistId, updates });

    return new Promise((resolve, reject) => {
      const fields = Object.keys(updates);
      const values = Object.values(updates);
      const setClause = fields.map(field => `${field} = ?`).join(', ');

      this.db.run(
        `UPDATE tierlists SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...values, tierlistId],
        function (err) {
          if (err) {
            console.error("🗃️ Erreur SQL dans updateTierlist:", err);
            reject(err);
          } else {
            console.log("🗃️ Tierlist mise à jour - changes:", this.changes);
            resolve({ changes: this.changes });
          }
        }
      );
    });
  }

  async deleteTierlist(tierlistId) {
    console.log("🗃️ Database.deleteTierlist appelée avec:", tierlistId);

    // Désactivée pour protéger les tierlists (elles sont maintenant permanentes)
    console.log('⚠️ deleteTierlist appelé mais opération désactivée — aucun changement effectué');
    return { changes: 0 };
  }

  async duplicateTierlist(sourceTierlistId, newTierlistData) {
    console.log("🗃️ Database.duplicateTierlist appelée", { sourceTierlistId, newTierlistData });

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run("BEGIN TRANSACTION");

        // Créer la nouvelle tierlist
        this.db.run(
          `INSERT INTO tierlists (id, name, description, share_code, updated_at)
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [newTierlistData.id, newTierlistData.name, newTierlistData.description, newTierlistData.share_code],
          function (err) {
            if (err) {
              console.error("🗃️ Erreur création nouvelle tierlist:", err);
              db.run("ROLLBACK");
              reject(err);
              return;
            }

            // Copier les tiers
            this.db.run(
              `INSERT INTO tiers (id, tierlist_id, name, color, position, created_at, updated_at)
               SELECT 'tier-' || ? || '-' || substr(id, 6), ?, name, color, position, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
               FROM tiers WHERE tierlist_id = ?`,
              [Date.now(), newTierlistData.id, sourceTierlistId],
              function (err) {
                if (err) {
                  console.error("🗃️ Erreur copie tiers:", err);
                  this.db.run("ROLLBACK");
                  reject(err);
                  return;
                }

                // Copier les items
                this.db.run(
                  `INSERT INTO items (id, tierlist_id, name, image, description, created_at, updated_at)
                   SELECT 'item-' || ? || '-' || substr(id, 6), ?, name, image, description, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                   FROM items WHERE tierlist_id = ?`,
                  [Date.now(), newTierlistData.id, sourceTierlistId],
                  function (err) {
                    if (err) {
                      console.error("🗃️ Erreur copie items:", err);
                      this.db.run("ROLLBACK");
                      reject(err);
                      return;
                    }

                    // Copier les assignments (à adapter selon les nouveaux IDs)
                    this.db.run("COMMIT", (err) => {
                      if (err) {
                        console.error("🗃️ Erreur commit duplication:", err);
                        reject(err);
                      } else {
                        console.log("🗃️ Tierlist dupliquée avec succès");
                        resolve(newTierlistData);
                      }
                    });
                  }.bind(this)
                );
              }.bind(this)
            );
          }.bind(this)
        );
      });
    });
  }

  // Adapter la méthode getFullState pour une tierlist spécifique
  async getFullState(tierlistId) {
    console.log("🗃️ Database.getFullState appelée pour tierlist:", tierlistId);

    try {
      const timestamp = Date.now();

      console.time(`Récupération items-${timestamp}`);
      const items = await this.getItemsByTierlist(tierlistId);
      console.timeEnd(`Récupération items-${timestamp}`);

      console.time(`Récupération tiers-${timestamp}`);
      const tiers = await this.getTiersByTierlist(tierlistId);
      console.timeEnd(`Récupération tiers-${timestamp}`);

      console.time(`Récupération assignments depuis tiers-${timestamp}`);
      const { assignments, tierOrders } = await this.getTierAssignmentsFromTiers(tierlistId);
      console.timeEnd(`Récupération assignments depuis tiers-${timestamp}`);

      return {
        items,
        tiers,
        tierAssignments: assignments,
        tierOrders: tierOrders,
      };
    } catch (error) {
      console.error("❌ Erreur dans getFullState:", error);
      throw error;
    }
  }

  async getItemsByTierlist(tierlistId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT * FROM items WHERE tierlist_id = ? ORDER BY updated_at DESC",
        [tierlistId],
        (err, rows) => {
          if (err) {
            console.error("🗃️ Erreur SQL dans getItemsByTierlist:", err);
            reject(err);
          } else {
            console.log(`🗃️ ${rows.length} items récupérés pour tierlist ${tierlistId}`);
            resolve(rows);
          }
        }
      );
    });
  }

  async getTiersByTierlist(tierlistId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT * FROM tiers WHERE tierlist_id = ? ORDER BY position",
        [tierlistId],
        (err, rows) => {
          if (err) {
            console.error("🗃️ Erreur SQL dans getTiersByTierlist:", err);
            reject(err);
          } else {
            console.log(`🗃️ ${rows.length} tiers récupérés pour tierlist ${tierlistId}`);
            resolve(rows);
          }
        }
      );
    });
  }

  async getTierAssignmentsByTierlist(tierlistId) {
    console.log("⚠️ Utilisation de l'ancienne méthode getTierAssignmentsByTierlist - à migrer");
    const result = await this.getTierAssignmentsFromTiers(tierlistId);
    return Object.entries(result.assignments).map(([item_id, tier_id]) => ({ item_id, tier_id }));
  }

  async getTierOrdersByTierlist(tierlistId) {
    console.log("⚠️ Utilisation de l'ancienne méthode getTierOrdersByTierlist - à migrer");
    const result = await this.getTierAssignmentsFromTiers(tierlistId);
    return Object.entries(result.tierOrders).map(([tier_id, item_order]) => ({
      tier_id,
      item_order: JSON.stringify(item_order)
    }));
  }

  async getAllTierAssignments() {
    throw new Error("Méthode getAllTierAssignments non supportée dans la version simplifiée");
  }

  async saveTierAssignment(assignmentData) {
    console.log("⚠️ Utilisation de l'ancienne méthode saveTierAssignment - ignorée car redondante");
    // Dans la nouvelle structure, cette méthode n'est plus nécessaire
    // car les assignments sont gérés via les tiers directement
    return { changes: 1 }; // Simulation pour compatibilité
  }

  async removeItemFromTier(itemId) {
    console.log("⚠️ Utilisation de l'ancienne méthode removeItemFromTier - à migrer");
    // Pour l'instant, on ne fait rien car cette logique est gérée par moveItemToTier
    return { changes: 1 }; // Simulation pour compatibilité
  }

  async saveTierOrder(orderData) {
    console.log("⚠️ Utilisation de l'ancienne méthode saveTierOrder - redirection vers updateTierOrder");
    return this.updateTierOrder(orderData.tier_id, orderData.item_order);
  }

  async getTierOrdersByTierlist(tierlistId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT tier_orders.* FROM tier_orders
         JOIN tiers t ON tier_orders.tier_id = t.id
         WHERE t.tierlist_id = ?`,
        [tierlistId],
        (err, rows) => {
          if (err) {
            console.error("🗃️ Erreur SQL dans getTierOrdersByTierlist:", err);
            reject(err);
          } else {
            console.log(`🗃️ ${rows.length} ordres récupérés pour tierlist ${tierlistId}`);
            resolve(rows);
          }
        }
      );
    });
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

  async saveTierAssignment(assignmentData) {
    console.log("🗃️ Database.saveTierAssignment appelée avec:", assignmentData);

    return new Promise((resolve, reject) => {
      const { item_id, tier_id, position = 0 } = assignmentData;

      this.db.run(
        `INSERT OR REPLACE INTO tier_assignments (item_id, tier_id, position, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        [item_id, tier_id, position],
        function (err) {
          if (err) {
            console.error("🗃️ Erreur SQL dans saveTierAssignment:", err);
            reject(err);
          } else {
            console.log("🗃️ Assignment sauvegardé - changes:", this.changes);
            resolve({ changes: this.changes });
          }
        }
      );
    });
  }

  async saveTierOrder(orderData) {
    console.log("🗃️ Database.saveTierOrder appelée avec:", orderData);

    return new Promise((resolve, reject) => {
      const { tier_id, item_order } = orderData;

      this.db.run(
        `INSERT OR REPLACE INTO tier_orders (tier_id, item_order, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)`,
        [tier_id, JSON.stringify(item_order)],
        function (err) {
          if (err) {
            console.error("🗃️ Erreur SQL dans saveTierOrder:", err);
            reject(err);
          } else {
            console.log("🗃️ Ordre sauvegardé - changes:", this.changes);
            resolve({ changes: this.changes });
          }
        }
      );
    });
  }

  // Migration vers la structure simplifiée
  async migrateToSimplifiedStructure() {
    return new Promise((resolve, reject) => {
      console.log("🔄 Migration vers la structure simplifiée...");

      // Vérifier si les anciennes tables existent
      this.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='tier_orders'",
        async (err, row) => {
          if (err) {
            console.log("⚠️ Erreur vérification table tier_orders:", err);
            resolve();
            return;
          }

          if (!row) {
            console.log("✅ Migration déjà effectuée ou pas de données à migrer");
            resolve();
            return;
          }

          try {
            // Migrer les données de tier_orders vers tiers.item_order
            console.log("📦 Migration des ordres des tiers...");
            this.db.all("SELECT tier_id, item_order FROM tier_orders",
              (err, orders) => {
                if (err) {
                  console.error("❌ Erreur lecture tier_orders:", err);
                  resolve();
                  return;
                }

                console.log(`📋 ${orders.length} ordres de tiers à migrer`);

                // Mettre à jour chaque tier avec son ordre
                const updatePromises = orders.map(order => {
                  return new Promise((resolveUpdate, rejectUpdate) => {
                    this.db.run(
                      "UPDATE tiers SET item_order = ? WHERE id = ?",
                      [order.item_order || '[]', order.tier_id],
                      function (err) {
                        if (err) {
                          console.error(`❌ Erreur mise à jour tier ${order.tier_id}:`, err);
                          rejectUpdate(err);
                        } else {
                          console.log(`✅ Tier ${order.tier_id} mis à jour`);
                          resolveUpdate();
                        }
                      }
                    );
                  });
                });

                Promise.all(updatePromises).then(() => {
                  // Supprimer les anciennes tables
                  console.log("🗑️ Suppression des tables redondantes...");
                  this.db.run("DROP TABLE IF EXISTS tier_assignments", (err) => {
                    if (err) console.error("❌ Erreur suppression tier_assignments:", err);
                    else console.log("✅ Table tier_assignments supprimée");
                  });

                  this.db.run("DROP TABLE IF EXISTS tier_orders", (err) => {
                    if (err) console.error("❌ Erreur suppression tier_orders:", err);
                    else console.log("✅ Table tier_orders supprimée");
                  });

                  console.log("🎉 Migration terminée avec succès!");
                  resolve();
                }).catch(err => {
                  console.error("❌ Erreur durant la migration:", err);
                  resolve();
                });
              }
            );
          } catch (error) {
            console.error("❌ Erreur durant la migration:", error);
            resolve();
          }
        }
      );
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
