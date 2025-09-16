import { NextResponse } from 'next/server';
import Database from '../../../database/db.js';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const tierlistId = searchParams.get('tierlist_id');

        console.log('🎯 Récupération des tiers...', tierlistId ? `pour tierlist ${tierlistId}` : 'tous');
        const db = Database.getInstance();

        let tiers;
        if (tierlistId) {
            tiers = await db.getTiersByTierlist(tierlistId);
        } else {
            tiers = await db.getAllTiers();
        }

        console.log(`✅ ${tiers.length} tiers récupérés de la BDD`);

        return NextResponse.json({
            success: true,
            tiers: tiers
        });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des tiers:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

export async function PUT(request) {
    try {
        const body = await request.json();
        const { tiers, tierlist_id } = body;

        // Validation d'entrée — éviter des opérations destructrices sans tierlist_id
        if (!Array.isArray(tiers)) {
            console.error('❌ Payload invalide pour PUT /api/tiers : tiers doit être un tableau');
            return NextResponse.json({ success: false, error: 'Invalid payload: tiers must be an array' }, { status: 400 });
        }

        if (!tierlist_id) {
            console.error('❌ tierlist_id manquant pour PUT /api/tiers — abandon');
            return NextResponse.json({ success: false, error: 'tierlist_id is required' }, { status: 400 });
        }

        console.log('🎯 Mise à jour des tiers pour tierlist:', tierlist_id);
        const db = Database.getInstance();

        if (tierlist_id) {
            // Supprimer tous les tiers existants pour cette tierlist
            await new Promise((resolve, reject) => {
                db.db.run(`DELETE FROM tiers WHERE tierlist_id = ?`, [tierlist_id], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Insérer les nouveaux tiers
            for (let i = 0; i < tiers.length; i++) {
                const tier = tiers[i];
                await db.addTier({
                    id: tier.id,
                    tierlist_id: tierlist_id,
                    name: tier.name,
                    color: tier.color,
                    position: i
                });
            }
        } else {
            // Ancienne méthode pour la compatibilité
            await db.updateTiers(tiers);
        }

        console.log('✅ Tiers mis à jour en BDD');

        return NextResponse.json({
            success: true,
            message: 'Tiers mis à jour avec succès'
        });
    } catch (error) {
        console.error('❌ Erreur lors de la mise à jour des tiers:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
