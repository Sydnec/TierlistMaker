import { NextResponse } from "next/server";
const Database = require("../../../../../database/db");

const db = Database.getInstance();

// GET /api/tierlists/[id]/full - Récupérer toutes les données d'une tierlist en une seule requête
export async function GET(request, { params }) {
    try {
        console.time('API tierlist full');
        const { id } = await params;
        const tierlistId = id;

        // Récupérer les métadonnées de la tierlist
        console.time('Tierlist metadata');
        const tierlist = await db.getTierlistById(tierlistId);
        console.timeEnd('Tierlist metadata');

        if (!tierlist) {
            return NextResponse.json(
                { success: false, error: "Tierlist non trouvée" },
                { status: 404 }
            );
        }

        // Récupérer toutes les données associées en parallèle
        console.time('Parallel data fetch');
        const [items, tiers, assignments, orders] = await Promise.all([
            db.getItemsByTierlist(tierlistId),
            db.getTiersByTierlist(tierlistId),
            db.getTierAssignmentsByTierlist(tierlistId),
            db.getTierOrdersByTierlist(tierlistId)
        ]);
        console.timeEnd('Parallel data fetch');

        // Convertir les assignments en format Map pour la compatibilité
        const tierAssignments = {};
        assignments.forEach(assignment => {
            tierAssignments[assignment.item_id] = assignment.tier_id;
        });

        // Convertir les ordres en format Map
        const tierOrders = {};
        orders.forEach(order => {
            tierOrders[order.tier_id] = JSON.parse(order.item_order);
        });

        const result = {
            success: true,
            tierlist,
            data: {
                items,
                tiers,
                tierAssignments,
                tierOrders
            }
        };

        console.timeEnd('API tierlist full');
        console.log(`✅ Tierlist complète chargée: ${items.length} items, ${tiers.length} tiers`);

        return NextResponse.json(result);
    } catch (error) {
        console.error("Erreur récupération tierlist complète:", error);
        return NextResponse.json(
            { success: false, error: "Erreur interne du serveur" },
            { status: 500 }
        );
    }
}
