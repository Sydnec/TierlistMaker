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

        // Récupérer toutes les données associées via la nouvelle méthode simplifiée
        console.time('Parallel data fetch');
        const fullData = await db.getFullState(tierlistId);
        console.timeEnd('Parallel data fetch');

        const result = {
            success: true,
            tierlist,
            data: fullData
        };

        console.timeEnd('API tierlist full');
        console.log(`✅ Tierlist complète chargée: ${fullData.items.length} items, ${fullData.tiers.length} tiers`);

        return NextResponse.json(result);
    } catch (error) {
        console.error("Erreur récupération tierlist complète:", error);
        return NextResponse.json(
            { success: false, error: "Erreur interne du serveur" },
            { status: 500 }
        );
    }
}
