import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import Database from '../../../../database/db.js';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const itemsData = JSON.parse(formData.get('items'));
    
    const db = Database.getInstance();
    const savedItems = [];

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

        // Générer un nom de fichier unique si nécessaire
        const originalName = file.name;
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

      // Créer l'objet item avec le bon format
      const newItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: itemData.name,
        image: finalImagePath,
        description: itemData.description || null,
        created_at: itemData.created_at,
        updated_at: itemData.updated_at
      };

      // Sauvegarder en base de données
      const success = await db.addItem(newItem);
      
      if (success) {
        savedItems.push(newItem);
        console.log(`Item ajouté en BDD: ${newItem.name}`);
      } else {
        console.error(`Erreur lors de l'ajout en BDD: ${newItem.name}`);
      }
    }

    return NextResponse.json({ 
      success: true, 
      items: savedItems,
      count: savedItems.length 
    });

  } catch (error) {
    console.error('Erreur dans l\'API upload:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}
