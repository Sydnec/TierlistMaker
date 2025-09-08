import { NextResponse } from "next/server";

// POST /api/socket/notify-tierlist-created - Interface pour notifier via Socket.io
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

        // Utiliser la fonction globale exposée par le serveur Socket.io
        if (typeof global.notifyHubNewTierlist === 'function') {
            global.notifyHubNewTierlist(tierlist);
            console.log('✅ Notification Socket.io envoyée au hub');
        } else {
            console.warn('⚠️ Fonction notifyHubNewTierlist non disponible');
        }

        return NextResponse.json({
            success: true,
            message: "Notification sent to hub"
        });
    } catch (error) {
        console.error("❌ Erreur API socket notify:", error);
        return NextResponse.json(
            { success: false, error: "Erreur serveur" },
            { status: 500 }
        );
    }
}
