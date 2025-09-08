import { NextResponse } from 'next/server';
import Database from '../../../../database/db.js';

export async function POST() {
  try {
    console.log('🧹 Démarrage du nettoyage des images orphelines...');
    const db = Database.getInstance();
    const result = await db.cleanupOrphanedImages();
    
    console.log(`✅ Nettoyage terminé: ${result.deletedCount} images supprimées, ${result.usedImagesCount} images conservées`);
    
    return NextResponse.json({ 
      success: true, 
      message: `${result.deletedCount} images orphelines supprimées`,
      deletedCount: result.deletedCount,
      usedImagesCount: result.usedImagesCount
    });
  } catch (error) {
    console.error('❌ Erreur lors du nettoyage:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
