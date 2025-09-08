"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import io from "socket.io-client";
import styles from "./TierlistHub.module.css";

export default function TierlistHub() {
    const router = useRouter();
    const [tierlists, setTierlists] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newTierlistName, setNewTierlistName] = useState("");
    const [newTierlistDescription, setNewTierlistDescription] = useState("");
    const [newTierlistIsPublic, setNewTierlistIsPublic] = useState(false);
    const [createLoading, setCreateLoading] = useState(false);

    // Socket.io state
    const [socket, setSocket] = useState(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        loadTierlists();
        setupSocket();

        return () => {
            if (socket) {
                console.log("🔌 Déconnexion Socket.io hub");
                socket.emit("leave-hub");
                socket.disconnect();
            }
        };
    }, []);

    const setupSocket = () => {
        console.log("🔌 Connexion Socket.io hub...");
        const newSocket = io("http://localhost:3000");

        newSocket.on("connect", () => {
            console.log("✅ Connecté au serveur Socket.io");
            setIsConnected(true);

            // Rejoindre le hub global pour recevoir les notifications
            newSocket.emit("join-hub");
            console.log("🏠 Rejoint le hub global");
        });

        newSocket.on("disconnect", () => {
            console.log("❌ Déconnecté du serveur Socket.io");
            setIsConnected(false);
        });

        // Écouter les nouvelles tierlists
        newSocket.on("new-tierlist", (tierlist) => {
            console.log("🔔 Nouvelle tierlist reçue:", tierlist.name);

            // Ajouter la nouvelle tierlist à la liste (seulement si elle est publique)
            if (tierlist.is_public) {
                setTierlists(prevTierlists => {
                    // Vérifier si elle n'existe pas déjà
                    const exists = prevTierlists.some(existing => existing.id === tierlist.id);
                    if (exists) return prevTierlists;

                    // Ajouter au début de la liste
                    return [tierlist, ...prevTierlists];
                });
            }
        });

        setSocket(newSocket);
    };

    const loadTierlists = async () => {
        try {
            setLoading(true);
            console.log("🔄 Chargement des tierlists...");

            const response = await fetch("/api/tierlists");
            const data = await response.json();

            if (data.success) {
                console.log(`✅ ${data.tierlists.length} tierlists chargées`);
                setTierlists(data.tierlists);
            } else {
                console.error("❌ Erreur lors du chargement des tierlists:", data.error);
            }
        } catch (error) {
            console.error("❌ Erreur réseau lors du chargement des tierlists:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateTierlist = async () => {
        if (!newTierlistName.trim()) {
            alert("Le nom de la tierlist est requis");
            return;
        }

        try {
            setCreateLoading(true);
            console.log("🔄 Création d'une nouvelle tierlist...");

            const response = await fetch("/api/tierlists", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: newTierlistName.trim(),
                    description: newTierlistDescription.trim() || null,
                    is_public: newTierlistIsPublic ? 1 : 0,
                }),
            });

            const data = await response.json();

            if (data.success) {
                console.log("✅ Tierlist créée:", data.tierlist.id);
                setShowCreateModal(false);
                setNewTierlistName("");
                setNewTierlistDescription("");
                setNewTierlistIsPublic(false);

                // Rediriger vers la nouvelle tierlist en utilisant le share code
                router.push(`/tierlist/${data.tierlist.share_code}`);
            } else {
                console.error("❌ Erreur lors de la création:", data.error);
                alert(`Erreur: ${data.error}`);
            }
        } catch (error) {
            console.error("❌ Erreur réseau lors de la création:", error);
            alert("Erreur réseau lors de la création");
        } finally {
            setCreateLoading(false);
        }
    };

    const handleOpenTierlist = (shareCode) => {
        router.push(`/tierlist/${shareCode}`);
    };

    const handleDeleteTierlist = async (tierlistId, tierlistName) => {
        if (!confirm(`Êtes-vous sûr de vouloir supprimer "${tierlistName}" ?`)) {
            return;
        }

        try {
            console.log("🔄 Suppression de la tierlist:", tierlistId);

            const response = await fetch(`/api/tierlists/${tierlistId}`, {
                method: "DELETE",
            });

            const data = await response.json();

            if (data.success) {
                console.log("✅ Tierlist supprimée");
                await loadTierlists(); // Recharger la liste
            } else {
                console.error("❌ Erreur lors de la suppression:", data.error);
                alert(`Erreur: ${data.error}`);
            }
        } catch (error) {
            console.error("❌ Erreur réseau lors de la suppression:", error);
            alert("Erreur réseau lors de la suppression");
        }
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString("fr-FR", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h1>Tierlist Maker</h1>
                    <p>Chargement...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1>Tierlist Maker</h1>
                <p>Créez et partagez vos tierlists</p>

                <button
                    className={styles.createButton}
                    onClick={() => setShowCreateModal(true)}
                >
                    ➕ Créer une nouvelle tierlist
                </button>
            </div>

            <div className={styles.tierlistsGrid}>
                {tierlists.length === 0 ? (
                    <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}>📋</div>
                        <h2>Aucune tierlist</h2>
                        <p>Créez votre première tierlist pour commencer</p>
                    </div>
                ) : (
                    tierlists.map((tierlist) => (
                        <div key={tierlist.id} className={styles.tierlistCard}>
                            <div className={styles.cardHeader}>
                                <h3
                                    className={styles.tierlistTitle}
                                    onClick={() => handleOpenTierlist(tierlist.share_code)}
                                >
                                    {tierlist.name}
                                </h3>
                                <button
                                    className={styles.deleteButton}
                                    onClick={() => handleDeleteTierlist(tierlist.id, tierlist.name)}
                                    title="Supprimer cette tierlist"
                                >
                                    🗑️
                                </button>
                            </div>

                            {tierlist.description && (
                                <p className={styles.tierlistDescription}>
                                    {tierlist.description}
                                </p>
                            )}

                            <div className={styles.tierlistMeta}>
                                <span className={styles.shareCode}>
                                    Code: {tierlist.share_code}
                                </span>
                                <span className={styles.date}>
                                    {formatDate(tierlist.updated_at)}
                                </span>
                            </div>

                            <div className={styles.cardActions}>
                                <button
                                    className={styles.openButton}
                                    onClick={() => handleOpenTierlist(tierlist.share_code)}
                                >
                                    📝 Ouvrir
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {showCreateModal && (
                <div className={styles.modal}>
                    <div className={styles.modalContent}>
                        <div className={styles.modalHeader}>
                            <h2>Créer une nouvelle tierlist</h2>
                            <button
                                className={styles.closeButton}
                                onClick={() => setShowCreateModal(false)}
                                disabled={createLoading}
                            >
                                ✕
                            </button>
                        </div>

                        <div className={styles.modalBody}>
                            <div className={styles.field}>
                                <label>Nom de la tierlist *</label>
                                <input
                                    type="text"
                                    value={newTierlistName}
                                    onChange={(e) => setNewTierlistName(e.target.value)}
                                    placeholder="Nom de votre tierlist"
                                    required
                                    disabled={createLoading}
                                />
                            </div>

                            <div className={styles.field}>
                                <label>Description (optionnelle)</label>
                                <textarea
                                    value={newTierlistDescription}
                                    onChange={(e) => setNewTierlistDescription(e.target.value)}
                                    placeholder="Description de votre tierlist"
                                    rows="3"
                                    disabled={createLoading}
                                />
                            </div>

                            <div className={styles.field}>
                                <label className={styles.checkboxLabel}>
                                    <input
                                        type="checkbox"
                                        checked={newTierlistIsPublic}
                                        onChange={(e) => setNewTierlistIsPublic(e.target.checked)}
                                        disabled={createLoading}
                                    />
                                    Tierlist publique (visible dans le hub)
                                </label>
                                <small className={styles.fieldHelp}>
                                    Les tierlists privées ne sont accessibles que par lien de partage
                                </small>
                            </div>
                        </div>

                        <div className={styles.modalFooter}>
                            <button
                                className={styles.cancelButton}
                                onClick={() => setShowCreateModal(false)}
                                disabled={createLoading}
                            >
                                Annuler
                            </button>
                            <button
                                className={styles.saveButton}
                                onClick={handleCreateTierlist}
                                disabled={!newTierlistName.trim() || createLoading}
                            >
                                {createLoading ? "Création..." : "Créer"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
