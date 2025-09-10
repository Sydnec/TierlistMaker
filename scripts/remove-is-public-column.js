// Script safe pour supprimer la colonne `is_public` de la table `tierlists` dans la BDD SQLite
// Usage: node scripts/remove-is-public-column.js

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

(async () => {
  try {
    const dbPath = path.resolve(process.cwd(), 'data', 'tierlist-maker.db');
    if (!fs.existsSync(dbPath)) {
      console.error('❌ Fichier de base de données introuvable:', dbPath);
      process.exit(1);
    }

    const backupPath = dbPath + '.bak-' + Date.now();
    fs.copyFileSync(dbPath, backupPath);
    console.log('✅ Sauvegarde créée:', backupPath);

    const db = new sqlite3.Database(dbPath);

    db.serialize(() => {
      db.all("PRAGMA table_info('tierlists')", [], (err, rows) => {
        if (err) {
          console.error('❌ Impossible de lire la structure de la table tierlists:', err.message);
          db.close();
          process.exit(1);
        }

        const hasIsPublic = rows && rows.some(r => r.name === 'is_public');
        if (!hasIsPublic) {
          console.log('ℹ️ Colonne is_public absente — rien à faire');
          db.close();
          process.exit(0);
        }

        console.log('🔧 Début de la migration: suppression de is_public');

        db.exec('PRAGMA foreign_keys=OFF; BEGIN TRANSACTION;', (pragmaErr) => {
          if (pragmaErr) {
            console.error('❌ Erreur démarrage transaction:', pragmaErr.message);
            db.close();
            process.exit(1);
          }

          db.run(
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
                console.error('❌ Erreur création table temporaire:', createErr.message);
                db.exec('ROLLBACK; PRAGMA foreign_keys=ON;', () => db.close());
                process.exit(1);
              }

              db.run(
                `INSERT OR REPLACE INTO _tierlists_new (id, name, description, share_code, created_at, updated_at)
                 SELECT id, name, description, share_code, created_at, updated_at FROM tierlists`,
                (copyErr) => {
                  if (copyErr) {
                    console.error('❌ Erreur copie des données:', copyErr.message);
                    db.exec('ROLLBACK; PRAGMA foreign_keys=ON;', () => db.close());
                    process.exit(1);
                  }

                  db.run('DROP TABLE IF EXISTS tierlists', (dropErr) => {
                    if (dropErr) console.warn('⚠️ Erreur suppression ancienne table tierlists:', dropErr.message);

                    db.run('ALTER TABLE _tierlists_new RENAME TO tierlists', (renameErr) => {
                      if (renameErr) console.error('❌ Erreur renommage table:', renameErr.message);

                      db.exec('COMMIT; PRAGMA foreign_keys=ON;', (commitErr) => {
                        if (commitErr) {
                          console.error('❌ Erreur commit migration:', commitErr.message);
                          db.exec('ROLLBACK; PRAGMA foreign_keys=ON;', () => db.close());
                          process.exit(1);
                        }

                        console.log('✅ Migration terminée: colonne is_public supprimée');
                        db.close();
                        process.exit(0);
                      });
                    });
                  });
                }
              );
            }
          );
        });
      });
    });
  } catch (e) {
    console.error('❌ Exception inattendue:', e);
    process.exit(1);
  }
})();
