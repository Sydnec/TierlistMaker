import { NextResponse } from 'next/server';
import Database from '../../../../database/db.js';

const db = Database.getInstance();

// DELETE /api/items/[id] - Supprimer un item spécifique
export async function DELETE(request, { params }) {
    try {
        const { id } = await params;
        const itemId = id;

        const result = await db.deleteItem(itemId);

        if (result.itemChanges > 0) {
            return NextResponse.json({
                success: true,
                message: 'Item supprimé avec succès',
                changes: result
            });
        } else {
            return NextResponse.json(
                { success: false, error: "Item non trouvé" },
                { status: 404 }
            );
        }
    } catch (error) {
        console.error('❌ Erreur lors de la suppression de l\'item:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
