#!/usr/bin/env node

const Database = require('../src/database/db');

async function cleanupNullAssignments() {
    console.log('🧹 Début du nettoyage des assignments NULL...');

    const db = Database.getInstance();

    try {
        // Compter les enregistrements avec des valeurs NULL
        const countBefore = await new Promise((resolve, reject) => {
            db.db.get(
                `SELECT COUNT(*) as count FROM tier_assignments WHERE item_id IS NULL OR tier_id IS NULL`,
                [],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row.count);
                }
            );
        });

        console.log(`📋 ${countBefore} enregistrements avec des valeurs NULL trouvés`);

        if (countBefore === 0) {
            console.log('✅ Aucun enregistrement NULL à nettoyer');
            process.exit(0);
        }

        // Supprimer les enregistrements avec des valeurs NULL
        const result = await new Promise((resolve, reject) => {
            db.db.run(
                `DELETE FROM tier_assignments WHERE item_id IS NULL OR tier_id IS NULL`,
                [],
                function (err) {
                    if (err) reject(err);
                    else resolve({ changes: this.changes });
                }
            );
        });

        console.log(`🗑️ ${result.changes} enregistrements NULL supprimés`);

        // Vérifier le résultat
        const countAfter = await new Promise((resolve, reject) => {
            db.db.get(
                `SELECT COUNT(*) as count FROM tier_assignments WHERE item_id IS NULL OR tier_id IS NULL`,
                [],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row.count);
                }
            );
        });

        console.log(`🔍 Il reste ${countAfter} enregistrements NULL après nettoyage`);

        // Afficher les stats finales
        const totalCount = await new Promise((resolve, reject) => {
            db.db.get(
                `SELECT COUNT(*) as count FROM tier_assignments`,
                [],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row.count);
                }
            );
        });

        console.log(`📊 Total des assignments restants: ${totalCount}`);

        process.exit(0);

    } catch (error) {
        console.error('❌ Erreur lors du nettoyage:', error);
        process.exit(1);
    }
}

cleanupNullAssignments();
