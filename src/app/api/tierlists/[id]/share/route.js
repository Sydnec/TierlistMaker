import { NextResponse } from "next/server";
const Database = require("../../../../../database/db");

const db = Database.getInstance();

// GET /api/tierlists/[id]/share - Générer code de partage
export async function GET(request, { params }) {
    try {
        const { id } = await params;
        const tierlistId = id;

        const tierlist = await db.getTierlistById(tierlistId);
        if (!tierlist) {
            return NextResponse.json(
                { error: "Tierlist non trouvée" },
                { status: 404 }
            );
        }

        // Générer un code de partage unique (8 caractères alphanumériques)
        const shareCode = Math.random().toString(36).substring(2, 10).toUpperCase();

        // Mettre à jour la tierlist avec le code de partage
        await db.updateTierlistShareCode(tierlistId, shareCode);

        return NextResponse.json({
            shareCode,
            shareUrl: `${request.nextUrl.origin}/share/${shareCode}`
        });
    } catch (error) {
        console.error("Erreur génération code de partage:", error);
        return NextResponse.json(
            { error: "Erreur interne du serveur" },
            { status: 500 }
        );
    }
}
