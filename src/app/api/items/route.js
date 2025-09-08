import { NextResponse } from 'next/server';
import Database from '../../../database/db.js';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const tierlistId = searchParams.get('tierlist_id');

        console.log('📋 Récupération des items...', tierlistId ? `pour tierlist ${tierlistId}` : 'tous');
        const db = Database.getInstance();

        let items;
        if (tierlistId) {
            items = await db.getItemsByTierlist(tierlistId);
        } else {
            items = await db.getAllItems();
        }

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
