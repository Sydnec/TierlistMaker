import { NextResponse } from 'next/server';
import Database from '../../../database/db.js';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const tierlistId = searchParams.get('tierlist_id');

        console.log('🔗 Récupération des assignments...', tierlistId ? `pour tierlist ${tierlistId}` : 'tous');
        const db = Database.getInstance();

        let assignments;
        if (tierlistId) {
            const result = await db.getTierAssignmentsFromTiers(tierlistId);
            assignments = Object.entries(result.assignments).map(([item_id, tier_id]) => ({ item_id, tier_id }));
        } else {
            // Pour tous les tierlists, on devrait refactorer mais pour l'instant...
            throw new Error('Récupération globale non supportée dans la version simplifiée');
        }

        console.log(`✅ ${assignments.length} assignments récupérés de la BDD`);

        return NextResponse.json({
            success: true,
            assignments: assignments
        });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des assignments:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { item_id, tier_id, old_tier_id, position = -1 } = body;

        console.log('🔗 Déplacement item:', { item_id, old_tier_id, tier_id, position });
        const db = Database.getInstance();

        // Utiliser la nouvelle méthode simplifiée avec position
        const success = await db.moveItemToTier(item_id, old_tier_id, tier_id, position);

        if (success) {
            console.log('✅ Item déplacé avec succès');
            return NextResponse.json({
                success: true,
                message: 'Item déplacé avec succès'
            });
        } else {
            throw new Error('Échec du déplacement');
        }
    } catch (error) {
        console.error('❌ Erreur lors du déplacement de l\'item:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
