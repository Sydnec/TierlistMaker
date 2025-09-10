"use client";

import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

// Fonctions de persistance localStorage
const saveToLocalStorage = (state) => {
  try {
    localStorage.setItem("tierlist-maker-state", JSON.stringify(state));
  } catch (error) {
    console.error("Erreur sauvegarde localStorage:", error);
  }
};

const loadFromLocalStorage = () => {
  try {
    const saved = localStorage.getItem("tierlist-maker-state");
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error("Erreur chargement localStorage:", error);
  }
  return {
    items: [],
    tierAssignments: {},
    tiers: [],
    tierOrders: {},
  };
};

// Clé localStorage pour l'identifiant client unique
const CLIENT_ID_KEY = 'tierlist-maker-client-id';

function getOrCreateClientId() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      // Utiliser crypto.randomUUID si disponible, sinon fallback
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        id = crypto.randomUUID();
      } else {
        id = `cid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      localStorage.setItem(CLIENT_ID_KEY, id);
      console.log('Generated new clientId for WS:', id);
    }
    return id;
  } catch (err) {
    console.error('Erreur getOrCreateClientId:', err);
    return null;
  }
}

export function useCollaborativeState(tierlistId) {
  const [mounted, setMounted] = useState(false);
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState(0);
  const [collaborativeState, setCollaborativeState] = useState({
    items: [],
    tierAssignments: {},
    tiers: [],
    tierOrders: {},
  });

  const stateRef = useRef(collaborativeState);
  const listenersRef = useRef({});
  const tierlistIdRef = useRef(tierlistId);

  // Charge l'état depuis localStorage au montage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const localState = loadFromLocalStorage();
      setCollaborativeState(localState);
    }
  }, []);

  // Sauvegarde automatique dans localStorage à chaque changement d'état
  useEffect(() => {
    if (mounted && typeof window !== "undefined") {
      saveToLocalStorage(collaborativeState);
    }
  }, [collaborativeState, mounted]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    stateRef.current = collaborativeState;
  }, [collaborativeState]);

  // Gérer les changements de tierlistId
  useEffect(() => {
    tierlistIdRef.current = tierlistId;

    // Si on est déjà connecté et qu'on change de tierlist, rejoindre la nouvelle
    if (socket && isConnected && tierlistId) {
      console.log(`Changement de tierlist vers: ${tierlistId}`);
      socket.emit("join-tierlist", tierlistId);
    }
  }, [tierlistId, socket, isConnected]);

  useEffect(() => {
    // Ne se connecte que côté client après montage
    if (!mounted) return;

    console.log("Tentative de connexion Socket.io...");

    // Récupérer / créer un clientId stable par navigateur
    const clientId = getOrCreateClientId();

    // Initialise la connexion Socket.io
    const socketInstance = io({
      autoConnect: true,
      transports: ["websocket", "polling"],
      // Fournir clientId pour garantir 1 connexion par navigateur
      auth: { clientId },
      timeout: 20000,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      maxReconnectionAttempts: 5,
    });

    socketInstance.on("connect", () => {
      console.log("Connecté au serveur collaboratif");
      setIsConnected(true);

      // Rejoindre la tierlist spécifique si un ID est fourni
      if (tierlistIdRef.current) {
        console.log(`Rejoint la tierlist: ${tierlistIdRef.current}`);
        socketInstance.emit("join-tierlist", tierlistIdRef.current);
      }
    });

    socketInstance.on("disconnect", (reason) => {
      console.log("Déconnecté du serveur collaboratif:", reason);
      setIsConnected(false);
    });

    socketInstance.on("connect_error", (error) => {
      console.error("Erreur de connexion Socket.io:", error);
      setIsConnected(false);
    });

    // Réception de l'état initial
    socketInstance.on("initial-state", (state) => {
      console.log("État initial reçu:", state);
      setCollaborativeState({
        items: state.items || [],
        tierAssignments: state.tierAssignments || {},
        tiers: state.tiers || [],
        tierOrders: state.tierOrders || {},
      });
    });

    // Réception de l'état spécifique à la tierlist
    socketInstance.on("tierlist-state", (state) => {
      console.log("État de la tierlist reçu:", state);
      setCollaborativeState({
        items: state.items || [],
        tierAssignments: state.tierAssignments || {},
        tiers: state.tiers || [],
        tierOrders: state.tierOrders || {},
      });
    });

    // Nombre d'utilisateurs connectés
    socketInstance.on("users-count", (count) => {
      setConnectedUsers(count);
    });

    // Item ajouté par un autre utilisateur
    socketInstance.on("item-added", (item) => {
      console.log("Item ajouté par un autre utilisateur:", item.name);
      setCollaborativeState((prev) => ({
        ...prev,
        items: [...prev.items, item],
      }));

      // Notifie les listeners
      if (listenersRef.current.onItemAdded) {
        listenersRef.current.onItemAdded(item);
      }
    });

    // Item déplacé par un autre utilisateur
    socketInstance.on("item-moved", (data) => {
      console.log("Item déplacé par un autre utilisateur:", data);
      const { itemId, tierId, oldTier } = data;

      setCollaborativeState((prev) => {
        const newTierAssignments = { ...prev.tierAssignments };

        if (tierId === "unranked") {
          delete newTierAssignments[itemId];
        } else {
          newTierAssignments[itemId] = tierId;
        }

        const newTierOrders = { ...prev.tierOrders };

        // Retire l'item de tous les autres tiers
        Object.keys(newTierOrders).forEach((tier) => {
          if (tier !== tierId) {
            const index = newTierOrders[tier]?.indexOf(itemId);
            if (index !== -1) {
              newTierOrders[tier] = [...newTierOrders[tier]];
              newTierOrders[tier].splice(index, 1);
            }
          }
        });

        // Ajoute à la fin du nouveau tier
        if (tierId !== "unranked") {
          if (!newTierOrders[tierId]) {
            newTierOrders[tierId] = [];
          } else {
            newTierOrders[tierId] = [...newTierOrders[tierId]];
          }

          const currentIndex = newTierOrders[tierId].indexOf(itemId);
          if (currentIndex !== -1) {
            newTierOrders[tierId].splice(currentIndex, 1);
          }

          // Ajouter à la fin
          newTierOrders[tierId].push(itemId);
        }

        return {
          ...prev,
          tierAssignments: newTierAssignments,
          tierOrders: newTierOrders,
        };
      });

      // Notifie les listeners
      if (listenersRef.current.onItemMoved) {
        listenersRef.current.onItemMoved({ itemId, newTier: tierId, oldTier });
      }
    });

    // Tiers mis à jour par un autre utilisateur
    socketInstance.on("tiers-updated", (tiers) => {
      console.log("Tiers mis à jour par un autre utilisateur");
      setCollaborativeState((prev) => ({
        ...prev,
        tiers,
      }));

      if (listenersRef.current.onTiersUpdated) {
        listenersRef.current.onTiersUpdated(tiers);
      }
    });

    // Import en lot par un autre utilisateur
    socketInstance.on("bulk-imported", (items) => {
      console.log(`Import en lot reçu: ${items.length} items`);
      setCollaborativeState((prev) => ({
        ...prev,
        items: [...prev.items, ...items],
      }));

      if (listenersRef.current.onBulkImported) {
        listenersRef.current.onBulkImported(items);
      }
    });

    // Item supprimé par un autre utilisateur
    socketInstance.on("item-deleted", (itemId) => {
      console.log("Item supprimé par un autre utilisateur:", itemId);
      setCollaborativeState((prev) => {
        const newItems = prev.items.filter((item) => item.id !== itemId);
        const newTierAssignments = { ...prev.tierAssignments };
        delete newTierAssignments[itemId];

        const newTierOrders = { ...prev.tierOrders };
        Object.keys(newTierOrders).forEach((tierId) => {
          if (newTierOrders[tierId]) {
            newTierOrders[tierId] = newTierOrders[tierId].filter(
              (id) => id !== itemId
            );
          }
        });

        return {
          ...prev,
          items: newItems,
          tierAssignments: newTierAssignments,
          tierOrders: newTierOrders,
        };
      });

      if (listenersRef.current.onItemDeleted) {
        listenersRef.current.onItemDeleted(itemId);
      }
    });

    // Item mis à jour par un autre utilisateur (images enrichies)
    socketInstance.on("item-updated", (updatedItem) => {
      console.log(
        "Item mis à jour par un autre utilisateur:",
        updatedItem.name
      );
      setCollaborativeState((prev) => {
        const newItems = prev.items.map((item) => {
          if (
            (item.id && updatedItem.id && item.id === updatedItem.id) ||
            (item.mal_id &&
              updatedItem.mal_id &&
              item.mal_id === updatedItem.mal_id)
          ) {
            return { ...item, ...updatedItem };
          }
          return item;
        });

        return {
          ...prev,
          items: newItems,
        };
      });

      if (listenersRef.current.onItemUpdated) {
        listenersRef.current.onItemUpdated(updatedItem);
      }
    });

    // Synchronisation complète
    socketInstance.on("full-sync", (state) => {
      console.log("Synchronisation complète reçue");
      setCollaborativeState({
        items: state.items || [],
        tierAssignments: state.tierAssignments || {},
        tiers: state.tiers || [],
        tierOrders: state.tierOrders || {},
      });
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [mounted]);

  // Fonctions pour émettre des événements
  const emitItemAdd = (item) => {
    if (socket && tierlistIdRef.current) {
      socket.emit("item-add", { ...item, tierlistId: tierlistIdRef.current });
    }
  };

  const emitItemMove = (itemId, tierId, oldTier) => {
    if (socket && tierlistIdRef.current) {
      socket.emit("item-move", {
        itemId,
        tierId,
        oldTier,
        tierlistId: tierlistIdRef.current
      });
    }
  };

  const emitTiersUpdate = (tiers) => {
    if (socket && tierlistIdRef.current) {
      socket.emit("tiers-update", {
        tiers,
        tierlistId: tierlistIdRef.current
      });
    }
  };

  const emitBulkImport = (items) => {
    if (socket && tierlistIdRef.current) {
      socket.emit("bulk-import", {
        items,
        tierlistId: tierlistIdRef.current
      });
    }
  };

  const emitItemDelete = (itemId) => {
    console.log("🔥 Émission événement item-delete:", itemId);
    if (socket && tierlistIdRef.current) {
      socket.emit("item-delete", {
        itemId,
        tierlistId: tierlistIdRef.current
      });
      console.log("✅ Événement item-delete émis");
    } else {
      console.error("❌ Socket non connecté pour la suppression");
    }
  };

  const emitItemUpdate = (updatedItem) => {
    console.log("🔄 Émission événement item-update:", updatedItem.name);
    if (socket && tierlistIdRef.current) {
      socket.emit("item-update", {
        ...updatedItem,
        tierlistId: tierlistIdRef.current
      });
      console.log("✅ Événement item-update émis");
    } else {
      console.error("❌ Socket non connecté pour la mise à jour");
    }
  };

  const requestSync = () => {
    if (socket && tierlistIdRef.current) {
      socket.emit("request-sync", { tierlistId: tierlistIdRef.current });
    }
  };

  // Gestion des listeners
  const setEventListeners = (listeners) => {
    listenersRef.current = listeners;
  };

  return {
    isConnected,
    connectedUsers,
    collaborativeState,
    emitItemAdd,
    emitItemMove,
    emitItemDelete,
    emitItemUpdate,
    emitTiersUpdate,
    emitBulkImport,
    requestSync,
    setEventListeners,
  };
}
