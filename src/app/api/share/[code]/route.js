import { NextResponse } from "next/server";
const Database = require("../../../../database/db");

const db = Database.getInstance();

// GET /api/share/[code] - Résoudre un code de partage
export async function GET(request, { params }) {
    try {
        const { code } = await params;
        const shareCode = code;

        const tierlist = await db.getTierlistByShareCode(shareCode);

        if (!tierlist) {
            return NextResponse.json(
                { success: false, error: "Code de partage invalide ou expiré" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            tierlistId: tierlist.id,
            tierlist
        });
    } catch (error) {
        console.error("Erreur résolution code de partage:", error);
        return NextResponse.json(
            { success: false, error: "Erreur interne du serveur" },
            { status: 500 }
        );
    }
}
