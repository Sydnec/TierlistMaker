"use client";

import { useState, useEffect } from "react";
import TierList from "../components/TierList";
import ItemUpload from "../components/ItemUpload";
import CollaborativeStatus from "../components/CollaborativeStatus";
import { useCollaborativeState } from "../hooks/useCollaborativeState";
import styles from "./page.module.css";

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [allItems, setAllItems] = useState([]);
  const [tierAssignments, setTierAssignments] = useState(new Map());
  const [customTiers, setCustomTiers] = useState(null);
  const [tierOrders, setTierOrders] = useState(new Map());

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
  } = useCollaborativeState();

  useEffect(() => {
    setMounted(true);

    // Charger les items depuis la base de données
    const loadItemsFromDatabase = async () => {
      try {
        console.log('🔄 Chargement des items depuis la BDD...');
        const response = await fetch('/api/items');
        const data = await response.json();

        if (data.success && data.items) {
          console.log(`✅ ${data.items.length} items chargés depuis la BDD`);
          setAllItems(data.items);
        } else {
          console.error('❌ Erreur lors du chargement des items:', data.error);
        }
      } catch (error) {
        console.error('❌ Erreur réseau lors du chargement des items:', error);
      }
    };

    loadItemsFromDatabase();
  }, []);

  // Synchronise l'état local avec l'état collaboratif
  useEffect(() => {
    if (collaborativeState.items.length > 0) {
      setAllItems(collaborativeState.items);
    }

    if (Object.keys(collaborativeState.tierAssignments).length > 0) {
      const newAssignments = new Map();
      Object.entries(collaborativeState.tierAssignments).forEach(
        ([itemId, tierId]) => {
          newAssignments.set(itemId, tierId); // garder l'ID en string
        }
      );
      setTierAssignments(newAssignments);
    }

    if (collaborativeState.tiers.length > 0) {
      setCustomTiers(collaborativeState.tiers);
    }

    if (Object.keys(collaborativeState.tierOrders).length > 0) {
      const newOrders = new Map();
      Object.entries(collaborativeState.tierOrders).forEach(
        ([tierId, order]) => {
          newOrders.set(tierId, order);
        }
      );
      setTierOrders(newOrders);
    }
  }, [collaborativeState]);

  // Configure les listeners pour les événements collaboratifs
  useEffect(() => {
    setEventListeners({
      onItemAdded: (item) => {
        console.log("📡 Réception ajout collaboratif:", item.name);
        // Ajouter l'item à la liste locale s'il n'y est pas déjà
        setAllItems(prevItems => {
          const exists = prevItems.some(existingItem => existingItem.id === item.id);
          if (!exists) {
            console.log("✅ Ajout de l'item collaboratif à la liste locale");
            return [...prevItems, item];
          } else {
            console.log("⚠️ Item déjà présent dans la liste locale");
            return prevItems;
          }
        });
      },
      onItemMoved: (data) => {
        console.log("Réception déplacement collaboratif:", data);
      },
      onTiersUpdated: (tiers) => {
        console.log("Réception mise à jour tiers collaborative");
      },
      onBulkImported: (items) => {
        console.log("📡 Réception import collaboratif:", items.length);
        // Ajouter tous les items importés
        setAllItems(prevItems => {
          const newItems = items.filter(item => 
            !prevItems.some(existingItem => existingItem.id === item.id)
          );
          if (newItems.length > 0) {
            console.log(`✅ Ajout de ${newItems.length} nouveaux items via import collaboratif`);
            return [...prevItems, ...newItems];
          }
          return prevItems;
        });
      },
    });
  }, [setEventListeners]);

  const handleTierChange = (itemId, tierId, position = 0) => {
    console.log(
      `Item ${itemId} moved to tier ${tierId} at position ${position}`
    );

    // Met à jour localement d'abord
    const newAssignments = new Map(tierAssignments);
    newAssignments.set(itemId, tierId);
    setTierAssignments(newAssignments);

    // Émet l'événement collaboratif
    emitItemMove(itemId, tierId, position);
  };

  const handleTierAssignmentsChange = (newAssignments) => {
    setTierAssignments(newAssignments);
  };

  const handleTiersChange = (newTiers) => {
    setCustomTiers(newTiers);
    // Émet l'événement collaboratif
    emitTiersUpdate(newTiers);
    console.log("Tiers updated:", newTiers);
  };

  const handleTierOrdersChange = (newOrders) => {
    setTierOrders(newOrders);
  };

  const handleItemDelete = (item) => {
    console.log("🗑️ handleItemDelete appelée pour:", item.name);
    console.log("📋 Item object complet:", JSON.stringify(item, null, 2));
    console.log(
      "🔑 ID utilisé pour suppression:",
      item.id,
      "type:",
      typeof item.id
    );

    // Cette fonction ne gère que la suppression complète (items déjà non classés)
    // Le déclassement est maintenant géré par TierList.handleItemUnrank
    console.log("🗑️ Suppression complète de l'item");

    // Supprime localement d'abord
    const newItems = allItems.filter(existingItem => existingItem.id !== item.id);

    // Met à jour les affectations de tiers (au cas où)
    const newAssignments = new Map(tierAssignments);
    newAssignments.delete(item.id);

    // Met à jour les ordres de tiers (au cas où)
    const newOrders = new Map(tierOrders);
    newOrders.forEach((order, tierId) => {
      const index = order.indexOf(item.id);
      if (index !== -1) {
        const updatedOrder = [...order];
        updatedOrder.splice(index, 1);
        newOrders.set(tierId, updatedOrder);
      }
    });

    console.log("📊 Mise à jour de l'état local (suppression complète)...");
    setAllItems(newItems);
    setTierAssignments(newAssignments);
    setTierOrders(newOrders);

    // Émet l'événement collaboratif
    console.log("📡 Émission de l'événement collaboratif (suppression)...");
    emitItemDelete(item.id);
    console.log("✅ Suppression complète terminée");
  };

  const handleItemsAdded = (newItems) => {
    console.log("🆕 Nouveaux items ajoutés:", newItems);
    
    // Ajoute les nouveaux items à la liste existante
    const updatedItems = [...allItems, ...newItems];
    setAllItems(updatedItems);
    
    // Les nouveaux items sont automatiquement dans "unranked"
    // Pas besoin de modifier tierAssignments car ils y seront par défaut
    
    // Émettre les événements collaboratifs pour chaque nouvel item
    newItems.forEach(item => {
      console.log("📡 Émission de l'événement collaboratif pour:", item.name);
      emitItemAdd(item);
    });
    
    console.log("📊 État local mis à jour avec", newItems.length, "nouveaux items");
  };

  return (
    <div className={styles.page}>
      {mounted && (
        <CollaborativeStatus
          isConnected={isConnected}
          connectedUsers={connectedUsers}
        />
      )}

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
      />
    </div>
  );
}
