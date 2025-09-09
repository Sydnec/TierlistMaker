import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import Database from '../../../../database/db.js';
import { cleanFileName } from '../../../../utils/fileUtils.js';

// Fonction pour calculer le hash MD5 d'un buffer
function calculateHash(buffer) {
    return crypto.createHash('md5').update(buffer).digest('hex');
}

// Fonction pour trouver un fichier existant avec le même contenu
async function findExistingFileByHash(buffer, imagesDir) {
    const hash = calculateHash(buffer);

    try {
        // Lire tous les fichiers du dossier images
        const fs = require('fs');
        const files = fs.readdirSync(imagesDir);

        for (const fileName of files) {
            const filePath = path.join(imagesDir, fileName);
            try {
                const existingBuffer = await readFile(filePath);
                const existingHash = calculateHash(existingBuffer);

                if (hash === existingHash) {
                    console.log(`🔍 Fichier identique trouvé: ${fileName}`);
                    // Assurer qu'il n'y a pas d'espaces dans le chemin retourné
                    return `images/${cleanFileName(fileName)}`;
                }
            } catch (err) {
                // Ignorer les erreurs de lecture de fichier
                continue;
            }
        }
    } catch (err) {
        console.log("📁 Dossier images vide ou inexistant");
    }

    return null;
}

// Fonction pour détecter les doublons potentiels en base de données
async function checkForDuplicates(itemData, db, tierlistId) {
    try {
        const allItems = tierlistId ? await db.getItemsByTierlist(tierlistId) : await db.getAllItems();

        const exactDuplicate = allItems.find(item =>
            item.name === itemData.name && item.image === itemData.image
        );

        const partialDuplicate = allItems.find(item =>
            (item.name === itemData.name || item.image === itemData.image) &&
            !(item.name === itemData.name && item.image === itemData.image)
        );

        return {
            exactDuplicate,
            partialDuplicate,
            duplicateType: exactDuplicate ? 'exact' : partialDuplicate ? 'partial' : 'none'
        };
    } catch (error) {
        console.error('Erreur lors de la vérification des doublons:', error);
        return { duplicateType: 'none' };
    }
}

export async function POST(request) {
    try {
        const formData = await request.formData();
        const itemsData = JSON.parse(formData.get('items'));
        const tierlistId = formData.get('tierlist_id'); // Nouveau paramètre

        console.log(`📤 Upload pour tierlist: ${tierlistId || 'global'}`);

        const db = Database.getInstance();
        const savedItems = [];
        const skippedItems = [];
        const duplicateWarnings = [];

        // Créer le dossier images s'il n'existe pas
        const imagesDir = path.join(process.cwd(), 'public', 'images');
        if (!existsSync(imagesDir)) {
            await mkdir(imagesDir, { recursive: true });
        }

        for (let i = 0; i < itemsData.length; i++) {
            const itemData = itemsData[i];
            let finalImagePath = itemData.image;

            // Traiter le fichier image s'il existe
            const file = formData.get(`file-${i}`);
            if (file && file.size > 0) {
                const bytes = await file.arrayBuffer();
                const buffer = Buffer.from(bytes);

                // D'abord, vérifier s'il existe déjà un fichier identique
                const existingFilePath = await findExistingFileByHash(buffer, imagesDir);

                if (existingFilePath) {
                    console.log(`♻️ Réutilisation du fichier existant: ${existingFilePath}`);
                    finalImagePath = existingFilePath;
                } else {
                    // Générer un nom de fichier unique si nécessaire (sans espaces)
                    const originalName = cleanFileName(file.name); // Nettoyer le nom de fichier
                    const extension = path.extname(originalName);
                    const nameWithoutExt = path.basename(originalName, extension);

                    let fileName = originalName;
                    let counter = 1;
                    let filePath = path.join(imagesDir, fileName);

                    // Vérifier si le fichier existe déjà et générer un nouveau nom si nécessaire
                    while (existsSync(filePath)) {
                        fileName = `${nameWithoutExt}_${counter}${extension}`;
                        filePath = path.join(imagesDir, fileName);
                        counter++;
                    }

                    // Sauvegarder le fichier
                    await writeFile(filePath, buffer);
                    finalImagePath = `images/${fileName}`;

                    console.log(`Image sauvegardée: ${finalImagePath}`);
                }
            }

            // Créer l'objet item avec le bon format
            const newItem = {
                id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                tierlist_id: tierlistId, // Associer à la tierlist
                name: itemData.name,
                image: finalImagePath,
                description: itemData.description || null,
                created_at: itemData.created_at,
                updated_at: itemData.updated_at
            };

            // Vérifier les doublons (dans le contexte de cette tierlist)
            const duplicateCheck = await checkForDuplicates(newItem, db, tierlistId);

            if (duplicateCheck.duplicateType === 'exact') {
                // Doublon exact : ne pas ajouter
                console.log(`🚫 Doublon exact ignoré: ${newItem.name} avec ${newItem.image}`);
                skippedItems.push({
                    item: newItem,
                    reason: 'Doublon exact (même nom et même image)',
                    existingItem: duplicateCheck.exactDuplicate
                });
            } else {
                // Soit pas de doublon, soit doublon partiel : ajouter mais signaler
                if (duplicateCheck.duplicateType === 'partial') {
                    console.log(`⚠️ Doublon partiel détecté: ${newItem.name} avec ${newItem.image}`);
                    duplicateWarnings.push({
                        item: newItem,
                        reason: 'Doublon partiel (nom ou image similaire)',
                        existingItem: duplicateCheck.partialDuplicate
                    });
                }

                // Sauvegarder en base de données
                const success = await db.addItem(newItem);

                if (success) {
                    savedItems.push(newItem);
                    console.log(`Item ajouté en BDD: ${newItem.name}`);
                } else {
                    console.error(`Erreur lors de l'ajout en BDD: ${newItem.name}`);
                }
            }
        }

        // Déclencher un rechargement de l'état collaboratif si des items ont été ajoutés
        if (savedItems.length > 0) {
            try {
                console.log('🔄 Déclenchement du rechargement de l\'état collaboratif...');
                await fetch('http://localhost:3000/api/state/reload', {
                    method: 'POST'
                });
            } catch (reloadError) {
                console.warn('⚠️ Erreur lors du rechargement de l\'état:', reloadError.message);
                // Ne pas faire échouer l'upload si le rechargement échoue
            }
        }

        return NextResponse.json({
            success: true,
            items: savedItems,
            count: savedItems.length,
            skipped: skippedItems,
            skippedCount: skippedItems.length,
            warnings: duplicateWarnings,
            warningsCount: duplicateWarnings.length,
            summary: {
                total: itemsData.length,
                added: savedItems.length,
                skipped: skippedItems.length,
                warnings: duplicateWarnings.length
            }
        });

    } catch (error) {
        console.error('Erreur dans l\'API upload:', error);
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}
