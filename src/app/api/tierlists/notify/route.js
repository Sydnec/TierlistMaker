import { NextResponse } from "next/server";

// POST /api/tierlists/notify - Notifier la création d'une nouvelle tierlist
export async function POST(request) {
    try {
        const body = await request.json();
        const { tierlist } = body;

        if (!tierlist) {
            return NextResponse.json(
                { success: false, error: "Tierlist data required" },
                { status: 400 }
            );
        }

        // Utiliser la fonction globale directement
        if (typeof global.notifyHubNewTierlist === 'function') {
            global.notifyHubNewTierlist(tierlist);
            console.log('✅ Notification Socket.io envoyée au hub depuis API');
        } else {
            console.warn('⚠️ Fonction notifyHubNewTierlist non disponible');
        }

        return NextResponse.json({
            success: true,
            message: "Notification sent"
        });
    } catch (error) {
        console.error("❌ Erreur API notify tierlist:", error);
        return NextResponse.json(
            { success: false, error: "Erreur serveur" },
            { status: 500 }
        );
    }
}
