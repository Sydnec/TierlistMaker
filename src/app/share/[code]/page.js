"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

export default function ShareCodePage() {
    const router = useRouter();
    const params = useParams();
    const shareCode = params.code;

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const redirectToTierlist = async () => {
            try {
                const response = await fetch(`/api/share/${shareCode}`);
                const data = await response.json();

                if (data.success) {
                    router.replace(`/tierlist/${data.tierlistId}`);
                } else {
                    setError(data.error || "Code de partage invalide");
                    setLoading(false);
                }
            } catch (error) {
                console.error("Erreur lors de la redirection:", error);
                setError("Erreur lors de l'accès à la tierlist");
                setLoading(false);
            }
        };

        if (shareCode) {
            redirectToTierlist();
        }
    }, [shareCode, router]);

    if (loading) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                flexDirection: 'column',
                gap: '1rem'
            }}>
                <div>Redirection vers la tierlist...</div>
                <div style={{ fontSize: '0.9rem', opacity: 0.7 }}>
                    Code: {shareCode}
                </div>
            </div>
        );
    }

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            flexDirection: 'column',
            gap: '1rem'
        }}>
            <h1>❌ Erreur</h1>
            <p>{error}</p>
            <button
                onClick={() => router.push('/')}
                style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                }}
            >
                Retour à l&apos;accueil
            </button>
        </div>
    );
}
