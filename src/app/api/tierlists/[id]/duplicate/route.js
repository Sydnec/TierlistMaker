import { NextResponse } from "next/server";
const Database = require("../../../../../database/db");

const db = Database.getInstance();

function generateId() {
    return `tierlist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function generateShareCode() {
    return Math.random().toString(36).substr(2, 8).toUpperCase();
}

// POST /api/tierlists/[id]/duplicate - Dupliquer une tierlist
export async function POST(request, { params }) {
    try {
        console.log("🌐 API: POST /api/tierlists/[id]/duplicate");

        const { id } = await params;
        const body = await request.json();
        const { name } = body;

        // Vérifier que la tierlist source existe
        const sourceTierlist = await db.getTierlistById(id);
        if (!sourceTierlist) {
            return NextResponse.json(
                { success: false, error: "Tierlist source non trouvée" },
                { status: 404 }
            );
        }

        if (!name || !name.trim()) {
            return NextResponse.json(
                { success: false, error: "Le nom est requis pour la copie" },
                { status: 400 }
            );
        }

        const newTierlistData = {
            id: generateId(),
            name: name.trim(),
            description: sourceTierlist.description ? `Copie de ${sourceTierlist.name}` : null,
            share_code: generateShareCode()
        };

        const duplicatedTierlist = await db.duplicateTierlist(id, newTierlistData);

        console.log("✅ Tierlist dupliquée:", duplicatedTierlist.id);

        return NextResponse.json({
            success: true,
            tierlist: duplicatedTierlist,
            message: "Tierlist dupliquée avec succès"
        });
    } catch (error) {
        console.error("❌ Erreur API POST duplicate tierlist:", error);
        return NextResponse.json(
            { success: false, error: "Erreur serveur" },
            { status: 500 }
        );
    }
}
