import { NextResponse } from 'next/server';
import Database from '../../../../database/db.js';

export async function POST() {
  try {
    console.log('🔄 Rechargement forcé de l\'état collaboratif...');
    const db = Database.getInstance();
    
    // Récupérer l'état complet depuis la BDD
    const fullState = await db.getFullState();
    
    console.log(`✅ État rechargé: ${fullState.items.length} items, ${fullState.tiers.length} tiers`);
    
    return NextResponse.json({ 
      success: true, 
      message: 'État collaboratif rechargé',
      itemCount: fullState.items.length,
      tierCount: fullState.tiers.length
    });
  } catch (error) {
    console.error('❌ Erreur lors du rechargement:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
