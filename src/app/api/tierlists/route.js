import { NextResponse } from "next/server";
const Database = require("../../../database/db");

const db = Database.getInstance();

function generateId() {
    return `tierlist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function generateShareCode() {
    return Math.random().toString(36).substr(2, 8).toUpperCase();
}

// GET /api/tierlists - Récupérer toutes les tierlists
export async function GET() {
    try {
        console.log("🌐 API: GET /api/tierlists");

        const tierlists = await db.getAllTierlists();

        return NextResponse.json({
            success: true,
            tierlists: tierlists
        });
    } catch (error) {
        console.error("❌ Erreur API GET tierlists:", error);
        return NextResponse.json(
            { success: false, error: "Erreur serveur" },
            { status: 500 }
        );
    }
}

// POST /api/tierlists - Créer une nouvelle tierlist
export async function POST(request) {
    try {
        console.log("🌐 API: POST /api/tierlists");

        const body = await request.json();
        const { name, description, is_public } = body;

        if (!name || !name.trim()) {
            return NextResponse.json(
                { success: false, error: "Le nom est requis" },
                { status: 400 }
            );
        }

        const tierlistData = {
            id: generateId(),
            name: name.trim(),
            description: description?.trim() || null,
            share_code: generateShareCode(),
            is_public: is_public || 0
        };

        const createdTierlist = await db.createTierlist(tierlistData);

        // Créer les tiers par défaut pour cette nouvelle tierlist
        const defaultTiers = [
            { name: "S", color: "#ff7f7f", position: 0 },
            { name: "A", color: "#ffbf7f", position: 1 },
            { name: "B", color: "#ffff7f", position: 2 },
            { name: "C", color: "#bfff7f", position: 3 },
            { name: "D", color: "#7fff7f", position: 4 },
        ];

        for (const tier of defaultTiers) {
            await db.addTier({
                id: `tier-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                tierlist_id: createdTierlist.id,
                name: tier.name,
                color: tier.color,
                position: tier.position
            });
        }

        console.log("✅ Tierlist créée:", createdTierlist.id);

        // Notifier les utilisateurs connectés au hub de la nouvelle tierlist (si publique)
        if (createdTierlist.is_public) {
            try {
                await fetch('http://localhost:3000/api/tierlists/notify', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ tierlist: createdTierlist })
                });
                console.log('🔔 Notification hub envoyée pour nouvelle tierlist publique');
            } catch (notifyError) {
                console.warn('⚠️ Erreur notification hub:', notifyError.message);
            }
        }

        return NextResponse.json({
            success: true,
            tierlist: createdTierlist
        });
    } catch (error) {
        console.error("❌ Erreur API POST tierlists:", error);
        return NextResponse.json(
            { success: false, error: "Erreur serveur" },
            { status: 500 }
        );
    }
}
