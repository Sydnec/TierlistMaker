import { NextResponse } from "next/server";
const Database = require("../../../../database/db");

const db = Database.getInstance();

function generateId() {
    return `tierlist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function generateShareCode() {
    return Math.random().toString(36).substr(2, 8).toUpperCase();
}

// GET /api/tierlists/[id] - Récupérer une tierlist
export async function GET(request, { params }) {
    try {
        const { id } = await params;
        const tierlistId = id;

        const tierlist = await db.getTierlistById(tierlistId);
        if (!tierlist) {
            return NextResponse.json(
                { success: false, error: "Tierlist non trouvée" },
                { status: 404 }
            );
        }

        console.log("🗃️ Tierlist récupérée:", tierlist ? "trouvée" : "non trouvée");
        return NextResponse.json({ success: true, tierlist });
    } catch (error) {
        console.error("Erreur récupération tierlist:", error);
        return NextResponse.json(
            { success: false, error: "Erreur interne du serveur" },
            { status: 500 }
        );
    }
}

// PUT /api/tierlists/[id] - Mettre à jour une tierlist
export async function PUT(request, { params }) {
    try {
        console.log("🌐 API: PUT /api/tierlists/[id]");

        const { id } = params;
        const body = await request.json();
        const { name, description } = body;

        // Vérifier que la tierlist existe
        const existingTierlist = await db.getTierlistById(id);
        if (!existingTierlist) {
            return NextResponse.json(
                { success: false, error: "Tierlist non trouvée" },
                { status: 404 }
            );
        }

        const updates = {};
        if (name !== undefined) updates.name = name.trim();
        if (description !== undefined) updates.description = description?.trim() || null;

        if (Object.keys(updates).length === 0) {
            return NextResponse.json(
                { success: false, error: "Aucune modification fournie" },
                { status: 400 }
            );
        }

        await db.updateTierlist(id, updates);

        const updatedTierlist = await db.getTierlistById(id);

        console.log("✅ Tierlist mise à jour:", id);

        return NextResponse.json({
            success: true,
            tierlist: updatedTierlist
        });
    } catch (error) {
        console.error("❌ Erreur API PUT tierlist:", error);
        return NextResponse.json(
            { success: false, error: "Erreur serveur" },
            { status: 500 }
        );
    }
}

// DELETE /api/tierlists/[id] - Supprimer une tierlist
export async function DELETE(request, { params }) {
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

        await db.deleteTierlist(tierlistId);

        return NextResponse.json({ message: "Tierlist supprimée avec succès" });
    } catch (error) {
        console.error("Erreur suppression tierlist:", error);
        return NextResponse.json(
            { error: "Erreur interne du serveur" },
            { status: 500 }
        );
    }
}
