import { NextResponse } from "next/server";
const Database = require("../../../../../../database/db");

const db = Database.getInstance();

// GET /api/tierlists/share/[code] - Récupérer une tierlist par code de partage
export async function GET(request, { params }) {
    try {
        console.log("🌐 API: GET /api/tierlists/share/[code]");

        const { code } = params;

        const tierlist = await db.getTierlistByShareCode(code);

        if (!tierlist) {
            return NextResponse.json(
                { success: false, error: "Tierlist non trouvée avec ce code de partage" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            tierlist: tierlist
        });
    } catch (error) {
        console.error("❌ Erreur API GET tierlist by share code:", error);
        return NextResponse.json(
            { success: false, error: "Erreur serveur" },
            { status: 500 }
        );
    }
}
