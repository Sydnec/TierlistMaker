import { NextResponse } from 'next/server';
import Database from '../../../database/db.js';

export async function GET() {
  try {
    console.log('📋 Récupération de tous les items...');
    const db = Database.getInstance();
    
    // Forcer la création des tables au cas où
    await new Promise((resolve, reject) => {
      db.db.run(`
        CREATE TABLE IF NOT EXISTS items (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          image TEXT,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          console.error('❌ Erreur création table items dans API:', err);
          reject(err);
        } else {
          console.log('✅ Table items vérifiée/créée dans API');
          resolve();
        }
      });
    });
    
    const items = await db.getAllItems();
    
    console.log(`✅ ${items.length} items récupérés de la BDD`);
    
    return NextResponse.json({ 
      success: true, 
      items: items 
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des items:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
