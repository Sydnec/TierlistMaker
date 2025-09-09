import { NextResponse } from 'next/server';
import Database from '../../../database/db.js';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const tierlistId = searchParams.get('tierlist_id');

        console.log('📊 Récupération des ordres...', tierlistId ? `pour tierlist ${tierlistId}` : 'tous');
        const db = Database.getInstance();

        let orders;
        if (tierlistId) {
            const result = await db.getTierAssignmentsFromTiers(tierlistId);
            orders = Object.entries(result.tierOrders).map(([tier_id, item_order]) => ({
                tier_id,
                item_order: JSON.stringify(item_order)
            }));
        } else {
            throw new Error('Récupération globale non supportée dans la version simplifiée');
        }

        console.log(`✅ ${orders.length} ordres récupérés de la BDD`);

        return NextResponse.json({
            success: true,
            orders: orders
        });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des ordres:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { tier_id, item_order } = body;

        console.log('📊 Sauvegarde ordre:', { tier_id, item_order });
        const db = Database.getInstance();

        const success = await db.updateTierOrder(tier_id, item_order);

        if (success) {
            console.log('✅ Ordre sauvegardé en BDD');
            return NextResponse.json({
                success: true,
                message: 'Ordre sauvegardé avec succès'
            });
        } else {
            throw new Error('Échec de la sauvegarde');
        }
    } catch (error) {
        console.error('❌ Erreur lors de la sauvegarde de l\'ordre:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
