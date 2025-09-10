"use client";

import { useState, useEffect, useRef } from "react";
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
    const [createLoading, setCreateLoading] = useState(false);

    // Socket.io state
    const socketRef = useRef(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        loadTierlists();
        setupSocket();

        return () => {
            const s = socketRef.current;
            if (s) {
                console.log("🔌 Déconnexion Socket.io hub");
                s.emit("leave-hub");
                s.disconnect();
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

            // Ajouter la nouvelle tierlist à la liste (toutes les tierlists sont publiques désormais)
            setTierlists(prevTierlists => {
                const exists = prevTierlists.some(existing => existing.id === tierlist.id);
                if (exists) return prevTierlists;
                return [tierlist, ...prevTierlists];
            });
        });

        socketRef.current = newSocket;
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
                }),
            });

            const data = await response.json();

            if (data.success) {
                console.log("✅ Tierlist créée:", data.tierlist.id);
                setShowCreateModal(false);
                setNewTierlistName("");
                setNewTierlistDescription("");

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
                                {/* Suppression désactivée — aucune action disponible */}
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

                            {/* Les tierlists sont désormais publiques par défaut — pas d'option de confidentialité */}
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
