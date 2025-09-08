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
            assignments = await db.getTierAssignmentsByTierlist(tierlistId);
        } else {
            assignments = await db.getAllTierAssignments();
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
        const { item_id, tier_id } = body;

        console.log('🔗 Sauvegarde assignment:', { item_id, tier_id });
        const db = Database.getInstance();

        const success = await db.saveTierAssignment(item_id, tier_id);

        if (success) {
            console.log('✅ Assignment sauvegardé en BDD');
            return NextResponse.json({
                success: true,
                message: 'Assignment sauvegardé avec succès'
            });
        } else {
            throw new Error('Échec de la sauvegarde');
        }
    } catch (error) {
        console.error('❌ Erreur lors de la sauvegarde de l\'assignment:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
