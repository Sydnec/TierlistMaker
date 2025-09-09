"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import TierList from "../../../components/TierList";
import ItemUpload from "../../../components/ItemUpload";
import CollaborativeStatus from "../../../components/CollaborativeStatus";
import { useCollaborativeState } from "../../../hooks/useCollaborativeState";
import styles from "./page.module.css";

export default function TierlistPage() {
    const router = useRouter();
    const params = useParams();
    const shareCode = params.id; // Maintenant c'est un share code, pas un ID

    const [mounted, setMounted] = useState(false);
    const [tierlist, setTierlist] = useState(null);
    const [loading, setLoading] = useState(true);
    const [allItems, setAllItems] = useState([]);
    const [tierAssignments, setTierAssignments] = useState(new Map());
    const [customTiers, setCustomTiers] = useState(null);
    const [tierOrders, setTierOrders] = useState(new Map());

    // États pour les fonctionnalités de partage
    const [showShareModal, setShowShareModal] = useState(false);
    const [showCopyModal, setShowCopyModal] = useState(false);
    const [copyName, setCopyName] = useState("");
    const [copyLoading, setCopyLoading] = useState(false);

    // L'ID réel de la tierlist (résolu depuis le share code)
    const [tierlistId, setTierlistId] = useState(null);

    // État collaboratif
    const {
        isConnected,
        connectedUsers,
        collaborativeState,
        emitItemAdd,
        emitItemMove,
        emitItemDelete,
        emitItemUpdate,
        emitTiersUpdate,
        setEventListeners,
    } = useCollaborativeState(tierlistId);

    useEffect(() => {
        setMounted(true);
        loadTierlist();
    }, [shareCode]);

    const loadTierlist = async () => {
        if (!shareCode) return;

        try {
            setLoading(true);
            console.time('Load tierlist total');
            console.log('🔄 Résolution du share code:', shareCode);

            // D'abord, résoudre le share code pour obtenir l'ID de la tierlist
            console.time('Share code resolution');
            const shareResponse = await fetch(`/api/share/${shareCode}`);
            const shareData = await shareResponse.json();
            console.timeEnd('Share code resolution');

            if (!shareData.success) {
                console.error('❌ Share code invalide:', shareData.error);
                router.push('/');
                return;
            }

            const resolvedTierlistId = shareData.tierlistId;
            setTierlistId(resolvedTierlistId);

            console.log('✅ Share code résolu vers tierlist ID:', resolvedTierlistId);

            // Maintenant charger TOUTES les données de la tierlist en une seule requête optimisée
            console.time('Full tierlist data');
            const fullResponse = await fetch(`/api/tierlists/${resolvedTierlistId}/full`);
            const fullData = await fullResponse.json();
            console.timeEnd('Full tierlist data');

            if (!fullData.success) {
                console.error('❌ Tierlist non trouvée:', fullData.error);
                router.push('/');
                return;
            }

            // Mettre à jour tous les états en une seule fois
            setTierlist(fullData.tierlist);
            setCopyName(`Copie de ${fullData.tierlist.name}`);

            const { items, tiers, tierAssignments, tierOrders } = fullData.data;

            setAllItems(items);
            console.log(`✅ ${items.length} items chargés pour la tierlist`);

            setCustomTiers(tiers);
            console.log(`✅ ${tiers.length} tiers chargés pour la tierlist`);

            // Convertir les assignments en Map
            const assignmentsMap = new Map();
            Object.entries(tierAssignments).forEach(([itemId, tierId]) => {
                assignmentsMap.set(itemId, tierId);
            });
            setTierAssignments(assignmentsMap);
            console.log(`✅ ${Object.keys(tierAssignments).length} assignments chargés`);

            // Convertir les ordres en Map
            const ordersMap = new Map();
            Object.entries(tierOrders).forEach(([tierId, itemIds]) => {
                ordersMap.set(tierId, itemIds);
            });
            setTierOrders(ordersMap);
            console.log(`✅ ${Object.keys(tierOrders).length} tier orders chargés`);

            console.timeEnd('Load tierlist total');
            console.log('🚀 Chargement complet terminé en mode optimisé !');
        } catch (error) {
            console.error('❌ Erreur lors du chargement de la tierlist:', error);
        } finally {
            setLoading(false);
        }
    };

    // Configuration des listeners collaboratifs
    useEffect(() => {
        if (!mounted) return;

        console.log("🔧 Configuration des listeners collaboratifs");
        const listeners = {
            onItemAdded: (item) => {
                console.log("📡 Event collaboratif reçu: item ajouté", item);
                setAllItems(prevItems => {
                    const exists = prevItems.some(existing => existing.id === item.id);
                    if (exists) return prevItems;
                    return [...prevItems, item];
                });
            },

            onItemMoved: ({ itemId, newTier, oldTier }) => {
                console.log("📡 Event collaboratif reçu: item déplacé", { itemId, newTier, oldTier });
                setTierAssignments(prevAssignments => {
                    const newAssignments = new Map(prevAssignments);
                    if (newTier === 'unranked') {
                        newAssignments.delete(itemId);
                    } else {
                        newAssignments.set(itemId, newTier);
                    }
                    return newAssignments;
                });
            },

            onItemDeleted: (itemId) => {
                console.log("📡 Event collaboratif reçu: item supprimé", itemId);
                setAllItems(prevItems => prevItems.filter(item => item.id !== itemId));
                setTierAssignments(prevAssignments => {
                    const newAssignments = new Map(prevAssignments);
                    newAssignments.delete(itemId);
                    return newAssignments;
                });
            },

            onItemUpdated: (updatedItem) => {
                console.log("📡 Event collaboratif reçu: item mis à jour", updatedItem);
                setAllItems(prevItems =>
                    prevItems.map(item =>
                        item.id === updatedItem.id ? { ...item, ...updatedItem } : item
                    )
                );
            },

            onTiersUpdated: (newTiers) => {
                console.log("📡 Event collaboratif reçu: tiers mis à jour", newTiers);
                setCustomTiers(newTiers);
            },
        };

        setEventListeners(listeners);
    }, [mounted, setEventListeners]);

    // Fonctions de gestion (similaires à l'ancienne page.js)
    const handleTierChange = async (itemId, newTier, position) => {
        // Calculer l'ancien tier avant modification
        const oldTier = tierAssignments.get(itemId) || 'unranked';

        // Mettre à jour l'état local des assignments
        setTierAssignments(prevAssignments => {
            const newAssignments = new Map(prevAssignments);
            if (newTier === 'unranked') {
                newAssignments.delete(itemId);
            } else {
                newAssignments.set(itemId, newTier);
            }
            return newAssignments;
        });

        // Émettre l'événement collaboratif avec l'ancien tier calculé
        emitItemMove(itemId, newTier, oldTier);

        try {
            const response = await fetch('/api/tier-assignments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    item_id: itemId,
                    old_tier_id: oldTier === 'unranked' ? null : oldTier,
                    tier_id: newTier === 'unranked' ? null : newTier,
                    position: position // Inclure la position dans la requête
                }),
            });

            if (!response.ok) {
                console.error('❌ Erreur sauvegarde assignment:', response.statusText);
            }
        } catch (error) {
            console.error('❌ Erreur réseau sauvegarde assignment:', error);
        }
    };

    const handleTierAssignmentsChange = (newAssignments) => {
        setTierAssignments(newAssignments);
    };

    const handleTiersChange = async (newTiers) => {
        setCustomTiers(newTiers);
        emitTiersUpdate(newTiers);

        try {
            const response = await fetch('/api/tiers', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tiers: newTiers, tierlist_id: tierlistId }),
            });

            if (!response.ok) {
                console.error('❌ Erreur sauvegarde tiers:', response.statusText);
            }
        } catch (error) {
            console.error('❌ Erreur réseau sauvegarde tiers:', error);
        }
    };

    const handleTierOrdersChange = async (tierId, newOrder) => {
        // Mettre à jour l'état local
        setTierOrders(prevOrders => {
            const newOrders = new Map(prevOrders);
            newOrders.set(tierId, newOrder);
            return newOrders;
        });

        try {
            const response = await fetch('/api/tier-orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tier_id: tierId,
                    item_order: newOrder,
                }),
            });

            if (!response.ok) {
                console.error('❌ Erreur sauvegarde ordre:', response.statusText);
            }
        } catch (error) {
            console.error('❌ Erreur réseau sauvegarde ordre:', error);
        }
    };

    const handleItemDelete = async (itemId) => {
        try {
            const response = await fetch(`/api/items/${itemId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                setAllItems(prevItems => prevItems.filter(item => item.id !== itemId));
                setTierAssignments(prevAssignments => {
                    const newAssignments = new Map(prevAssignments);
                    newAssignments.delete(itemId);
                    return newAssignments;
                });
                emitItemDelete(itemId);
            }
        } catch (error) {
            console.error("❌ Erreur réseau lors de la suppression:", error);
        }
    };

    const handleItemsAdded = (newItems) => {
        const updatedItems = [...allItems, ...newItems];
        setAllItems(updatedItems);

        newItems.forEach(item => {
            emitItemAdd(item);
        });
    };

    // Fonction de partage unifiée
    const handleShare = async () => {
        // S'assurer qu'on est côté client
        if (typeof window === 'undefined') return;

        // L'URL actuelle utilise déjà le share code
        const shareUrl = window.location.href;

        try {
            // Vérifier si navigator.clipboard est disponible
            if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(shareUrl);
            } else {
                // Fallback pour navigateurs non-sécurisés ou sans API Clipboard
                const tempInput = document.createElement('input');
                tempInput.value = shareUrl;
                document.body.appendChild(tempInput);
                tempInput.select();
                document.execCommand('copy');
                document.body.removeChild(tempInput);
            }

            // Notification discrète sans popup
            console.log("✅ Lien copié:", shareUrl);

            // Notification temporaire
            const notification = document.createElement('div');
            notification.textContent = '📋 Lien copié dans le presse-papier !';
            notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #28a745;
        color: white;
        padding: 10px 20px;
        border-radius: 5px;
        z-index: 1000;
        font-size: 14px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      `;
            document.body.appendChild(notification);

            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 3000);

        } catch (error) {
            console.error("❌ Erreur presse-papier:", error);
            // Fallback final
            const tempInput = document.createElement('input');
            tempInput.value = shareUrl;
            document.body.appendChild(tempInput);
            tempInput.select();
            document.execCommand('copy');
            document.body.removeChild(tempInput);

            // Notification de fallback
            const notification = document.createElement('div');
            notification.textContent = '📋 Lien copié !';
            notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #007bff;
        color: white;
        padding: 10px 20px;
        border-radius: 5px;
        z-index: 1000;
        font-size: 14px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      `;
            document.body.appendChild(notification);

            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 3000);
        }
    };

    const handleDuplicateTierlist = async () => {
        if (!copyName.trim()) {
            alert("Le nom est requis pour la copie");
            return;
        }

        try {
            setCopyLoading(true);
            const response = await fetch(`/api/tierlists/${tierlistId}/duplicate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: copyName.trim() }),
            });

            const data = await response.json();

            if (data.success) {
                setShowCopyModal(false);
                setCopyName("");
                // Rediriger vers le share code de la nouvelle tierlist
                router.push(`/tierlist/${data.tierlist.share_code}`);
            } else {
                alert(`Erreur: ${data.error}`);
            }
        } catch (error) {
            console.error("❌ Erreur lors de la duplication:", error);
            alert("Erreur lors de la duplication");
        } finally {
            setCopyLoading(false);
        }
    };

    if (loading || !mounted) {
        return (
            <div className={styles.loading}>
                <div className={styles.spinner}></div>
                <p>Chargement de la tierlist...</p>
            </div>
        );
    }

    if (!tierlist) {
        return (
            <div className={styles.error}>
                <h2>Tierlist non trouvée</h2>
                <button onClick={() => router.push('/')}>Retour à l'accueil</button>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div className={styles.titleSection}>
                    <button
                        className={styles.backButton}
                        onClick={() => router.push('/')}
                    >
                        ← Retour
                    </button>
                    <h1>{tierlist.name}</h1>
                    {tierlist.description && (
                        <p className={styles.description}>{tierlist.description}</p>
                    )}
                </div>

                <div className={styles.actions}>
                    <button
                        className={styles.actionButton}
                        onClick={handleShare}
                        title="Copier le lien de partage"
                    >
                        � Partager
                    </button>
                    <button
                        className={styles.actionButton}
                        onClick={() => setShowCopyModal(true)}
                        title="Dupliquer cette tierlist"
                    >
                        📑 Dupliquer
                    </button>
                </div>
            </div>

            <CollaborativeStatus
                isConnected={isConnected}
                connectedUsers={connectedUsers}
            />

            <TierList
                items={allItems}
                onTierChange={handleTierChange}
                onTierAssignmentsChange={handleTierAssignmentsChange}
                onTiersChange={handleTiersChange}
                onTierOrdersChange={handleTierOrdersChange}
                customTiers={customTiers}
                tierAssignments={tierAssignments}
                tierOrders={tierOrders}
                onItemDelete={handleItemDelete}
            />

            <ItemUpload
                onItemsAdded={handleItemsAdded}
                existingItems={allItems}
                tierlistId={tierlistId}
            />

            {/* Modal de duplication */}
            {showCopyModal && (
                <div className={styles.modal}>
                    <div className={styles.modalContent}>
                        <div className={styles.modalHeader}>
                            <h2>Dupliquer la tierlist</h2>
                            <button
                                className={styles.closeButton}
                                onClick={() => setShowCopyModal(false)}
                                disabled={copyLoading}
                            >
                                ✕
                            </button>
                        </div>

                        <div className={styles.modalBody}>
                            <div className={styles.field}>
                                <label>Nom de la copie *</label>
                                <input
                                    type="text"
                                    value={copyName}
                                    onChange={(e) => setCopyName(e.target.value)}
                                    placeholder="Nom de la copie"
                                    required
                                    disabled={copyLoading}
                                />
                            </div>
                        </div>

                        <div className={styles.modalFooter}>
                            <button
                                className={styles.cancelButton}
                                onClick={() => setShowCopyModal(false)}
                                disabled={copyLoading}
                            >
                                Annuler
                            </button>
                            <button
                                className={styles.saveButton}
                                onClick={handleDuplicateTierlist}
                                disabled={!copyName.trim() || copyLoading}
                            >
                                {copyLoading ? "Duplication..." : "Dupliquer"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
