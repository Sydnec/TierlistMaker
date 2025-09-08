import { useState, useCallback, useEffect } from "react";
import ItemCard from "./ItemCard";
import styles from "./TierList.module.css";

const DEFAULT_TIERS = [
  { id: "S", name: "S - Légendaire", color: "#ff6b6b" },
  { id: "A", name: "A - Excellent", color: "#ff9f43" },
  { id: "B", name: "B - Très bon", color: "#feca57" },
  { id: "C", name: "C - Bon", color: "#55efc4" },
  { id: "D", name: "D - Moyen", color: "#00b894" },
];

const TIER_COLORS = [
  "#ff6b6b", // rouge
  "#ff9f43", // orange
  "#feca57", // jaune
  "#55efc4", // vert clair
  "#00b894", // vert
  "#00bfff", // bleu clair
  "#0984e3", // bleu
  "#6c5ce7", // violet
  "#a29bfe", // violet clair
];

export default function TierList({
  items = [],
  onTierChange,
  onItemDelete,
  customTiers = null,
  onTierAssignmentsChange,
  onTiersChange,
  onTierOrdersChange,
  tierAssignments: propTierAssignments = null,
  tierOrders: propTierOrders = null,
}) {
  const [tiers, setTiers] = useState(customTiers || DEFAULT_TIERS);
  const [tierAssignments, setTierAssignments] = useState(
    propTierAssignments || new Map()
  );
  const [tierOrders, setTierOrders] = useState(propTierOrders || new Map());
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverPosition, setDragOverPosition] = useState(null);
  const [editingTier, setEditingTier] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);

  // Synchronise avec les props collaboratives
  useEffect(() => {
    if (propTierAssignments) {
      setTierAssignments(propTierAssignments);
    }
  }, [propTierAssignments]);

  useEffect(() => {
    if (propTierOrders) {
      setTierOrders(propTierOrders);
    }
  }, [propTierOrders]);

  useEffect(() => {
    if (customTiers) {
      setTiers(customTiers);
    }
  }, [customTiers]);

  // Notifie les changements d'assignation
  const updateTierAssignments = (newAssignments) => {
    setTierAssignments(newAssignments);
    if (onTierAssignmentsChange) {
      onTierAssignmentsChange(newAssignments);
    }
  };

  // Notifie les changements de tiers
  const updateTiers = (newTiers) => {
    setTiers(newTiers);
    if (onTiersChange) {
      onTiersChange(newTiers);
    }
  };

  // Notifie les changements d'ordre
  const updateTierOrders = (newOrders) => {
    setTierOrders(newOrders);
    if (onTierOrdersChange) {
      onTierOrdersChange(newOrders);
    }
  };

  // Organise les items par tier avec ordre personnalisé et espace de drop
  const organizeItemsByTier = useCallback(() => {
    const organized = {};

    // Initialise tous les tiers
    tiers.forEach((tier) => {
      organized[tier.id] = [];
    });

    // Ajoute une section pour les items non classés
    organized["unranked"] = [];

    // Distribue les items
    items.forEach((item) => {
      const tier = tierAssignments.get(item.id) || "unranked";
      organized[tier].push(item);
    });

    // Trie les items non-classés par ordre alphabétique
    if (organized["unranked"] && organized["unranked"].length > 0) {
      organized["unranked"].sort((a, b) => {
        const nameA = (a.name || "").toLowerCase();
        const nameB = (b.name || "").toLowerCase();
        return nameA.localeCompare(nameB);
      });
    }

    // Applique l'ordre personnalisé pour chaque tier (SAUF pour unranked qui est trié alphabétiquement)
    Object.keys(organized).forEach((tierId) => {
      // Ignore les items non-classés car ils sont déjà triés alphabétiquement
      if (tierId === "unranked") return;

      const tierOrder = tierOrders.get(tierId);
      if (tierOrder && tierOrder.length > 0) {
        // Trie selon l'ordre personnalisé, puis ajoute les nouveaux items à la fin
        const orderedItems = [];
        const remainingItems = [...organized[tierId]];

        // Ajoute d'abord les items dans l'ordre défini
        tierOrder.forEach((itemId) => {
          const itemIndex = remainingItems.findIndex((a) => a.id === itemId);
          if (itemIndex !== -1) {
            orderedItems.push(remainingItems[itemIndex]);
            remainingItems.splice(itemIndex, 1);
          }
        });

        // Ajoute les items restants (nouveaux) à la fin
        orderedItems.push(...remainingItems);
        organized[tierId] = orderedItems;
      }

      // Ajoute un placeholder pour l'espace de drop si nécessaire
      if (
        draggedItem &&
        dragOverPosition &&
        dragOverPosition.tierId === tierId
      ) {
        const targetIndex = organized[tierId].findIndex(
          (a) => a.id === dragOverPosition.targetItemId
        );
        if (targetIndex !== -1) {
          const insertIndex = dragOverPosition.insertBefore
            ? targetIndex
            : targetIndex + 1;
          // Crée un placeholder pour l'espace de drop
          const placeholder = {
            id: "__DROP_PLACEHOLDER__",
            isPlaceholder: true,
            draggedItem: draggedItem,
          };
          organized[tierId].splice(insertIndex, 0, placeholder);
        }
      } else if (
        draggedItem &&
        dragOverPosition &&
        dragOverPosition.tierId === tierId &&
        organized[tierId].length === 0
      ) {
        // Tier vide, ajoute le placeholder
        const placeholder = {
          id: "__DROP_PLACEHOLDER__",
          isPlaceholder: true,
          draggedItem: draggedItem,
        };
        organized[tierId] = [placeholder];
      }
    });

    return organized;
  }, [
    items,
    tierAssignments,
    tierOrders,
    tiers,
    draggedItem,
    dragOverPosition,
  ]);

  const handleDragStart = (item) => {
    setDraggedItem(item);
    setDragOverPosition(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverPosition(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  // Gestion du survol pour insertion entre les items
  const handleDragOverItem = (e, targetItem, tierId) => {
    e.preventDefault();
    e.stopPropagation();

    if (
      !draggedItem ||
      draggedItem.id === targetItem.id ||
      targetItem.isPlaceholder
    )
      return;

    const rect = e.currentTarget.getBoundingClientRect();
    const midPoint = rect.left + rect.width / 2;
    const insertBefore = e.clientX < midPoint;

    setDragOverPosition({
      tierId,
      targetItemId: targetItem.id,
      insertBefore,
    });
  };

  // Gestion du survol sur un tier vide
  const handleDragOverEmptyTier = (e, tierId) => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedItem) return;

    setDragOverPosition({
      tierId,
      targetItemId: null,
      insertBefore: true,
    });
  };

  const handleDrop = (e, tierId) => {
    e.preventDefault();
    if (!draggedItem) return;

    const newAssignments = new Map(tierAssignments);
    const currentTier = tierAssignments.get(draggedItem.id) || "unranked";

    // Assigner à un nouveau tier
    if (tierId === "unranked") {
      newAssignments.delete(draggedItem.id);
    } else {
      newAssignments.set(draggedItem.id, tierId);
    }

    // Gérer le réarrangement dans le même tier ou nouveau tier
    const newTierOrders = new Map(tierOrders);

    // Si on a une position spécifique (dragOverPosition), on l'utilise
    if (
      dragOverPosition &&
      dragOverPosition.tierId === tierId &&
      dragOverPosition.targetItemId
    ) {
      // Utiliser la même logique que l'affichage pour calculer les positions
      const currentOrganized = organizeItemsWithPlaceholderAndDragRemoved();
      const tierItems = currentOrganized[tierId] || [];

      // Filtrer le placeholder pour avoir la vraie liste
      const realItems = tierItems.filter((a) => !a.isPlaceholder);
      const targetIndex = realItems.findIndex(
        (a) => a.id === dragOverPosition.targetItemId
      );

      if (targetIndex !== -1) {
        // Créer le nouvel ordre pour ce tier
        const newOrder = [...realItems.map((a) => a.id)];

        // Insérer l'item à la nouvelle position
        const insertIndex = dragOverPosition.insertBefore
          ? targetIndex
          : targetIndex + 1;

        newOrder.splice(insertIndex, 0, draggedItem.id);
        newTierOrders.set(tierId, newOrder);
      }
    } else if (currentTier !== tierId) {
      // Si on change de tier sans position spécifique, ajouter à la fin
      const currentOrganized = organizeItemsWithoutPlaceholder();
      const tierItems = currentOrganized[tierId] || [];
      // Retirer l'item en cours de drag s'il était dans ce tier
      const filteredItems = tierItems.filter((a) => a.id !== draggedItem.id);
      const newOrder = [...filteredItems.map((a) => a.id), draggedItem.id];
      newTierOrders.set(tierId, newOrder);
    }

    // Nettoyer l'ordre de l'ancien tier si l'item en sort
    if (currentTier !== tierId && currentTier !== "unranked") {
      const oldOrder = newTierOrders.get(currentTier) || [];
      const cleanedOrder = oldOrder.filter((id) => id !== draggedItem.id);
      newTierOrders.set(currentTier, cleanedOrder);
    }

    updateTierAssignments(newAssignments);
    setTierOrders(newTierOrders);

    // Notifier les changements d'ordre s'il y a un callback
    if (onTierOrdersChange) {
      onTierOrdersChange(newTierOrders);
    }

    // Calcule la position finale dans le tier avant de réinitialiser
    let finalPosition = 0;
    if (dragOverPosition && dragOverPosition.targetItemId) {
      const finalOrder = newTierOrders.get(tierId) || [];
      finalPosition = finalOrder.indexOf(draggedItem.id);
    } else {
      const finalOrder = newTierOrders.get(tierId) || [];
      finalPosition = Math.max(0, finalOrder.indexOf(draggedItem.id));
    }

    setDragOverPosition(null);
    setDraggedItem(null); // Réinitialiser draggedItem pour éviter que l'item reste invisible

    // Toujours émettre l'événement collaboratif
    if (onTierChange) {
      onTierChange(draggedItem.id, tierId, finalPosition);
    }
  };

  // Fonction helper pour organiser avec retrait de l'item en cours de drag (comme dans l'affichage)
  const organizeItemsWithPlaceholderAndDragRemoved = () => {
    const organized = {};

    tiers.forEach((tier) => {
      organized[tier.id] = [];
    });
    organized["unranked"] = [];

    items.forEach((item) => {
      const tier = tierAssignments.get(item.id) || "unranked";
      organized[tier].push(item);
    });

    // Trie les animés non-classés par ordre alphabétique
    if (organized["unranked"] && organized["unranked"].length > 0) {
      organized["unranked"].sort((a, b) => {
        const titleA = (a.title || "").toLowerCase();
        const titleB = (b.title || "").toLowerCase();
        return titleA.localeCompare(titleB);
      });
    }

    Object.keys(organized).forEach((tierId) => {
      // Ignore les animés non-classés car ils sont déjà triés alphabétiquement
      if (tierId === "unranked") return;

      const tierOrder = tierOrders.get(tierId);
      if (tierOrder && tierOrder.length > 0) {
        const orderedItems = [];
        const remainingItems = [...organized[tierId]];

        tierOrder.forEach((itemId) => {
          const itemIndex = remainingItems.findIndex((a) => a.id === itemId);
          if (itemIndex !== -1) {
            orderedItems.push(remainingItems[itemIndex]);
            remainingItems.splice(itemIndex, 1);
          }
        });

        orderedItems.push(...remainingItems);
        organized[tierId] = orderedItems;
      }

      // Retirer l'item en cours de drag (comme dans l'affichage)
      if (draggedItem) {
        organized[tierId] = organized[tierId].filter(
          (item) => item.id !== draggedItem.id
        );
      }

      // Ajouter le placeholder si nécessaire (pour simuler l'affichage)
      if (
        draggedItem &&
        dragOverPosition &&
        dragOverPosition.tierId === tierId
      ) {
        const targetIndex = organized[tierId].findIndex(
          (a) => a.id === dragOverPosition.targetItemId
        );
        if (targetIndex !== -1) {
          const insertIndex = dragOverPosition.insertBefore
            ? targetIndex
            : targetIndex + 1;
          const placeholder = {
            id: "__DROP_PLACEHOLDER__",
            isPlaceholder: true,
            draggedItem: draggedItem,
          };
          organized[tierId].splice(insertIndex, 0, placeholder);
        }
      } else if (
        draggedItem &&
        dragOverPosition &&
        dragOverPosition.tierId === tierId &&
        organized[tierId].length === 0
      ) {
        const placeholder = {
          id: "__DROP_PLACEHOLDER__",
          isPlaceholder: true,
          draggedItem: draggedItem,
        };
        organized[tierId] = [placeholder];
      }
    });

    return organized;
  };

  // Fonction helper pour organiser sans placeholder (pour éviter les boucles infinies)
  const organizeItemsWithoutPlaceholder = () => {
    const organized = {};

    tiers.forEach((tier) => {
      organized[tier.id] = [];
    });
    organized["unranked"] = [];

    items.forEach((item) => {
      const tier = tierAssignments.get(item.id) || "unranked";
      organized[tier].push(item);
    });

    // Trie les animés non-classés par ordre alphabétique
    if (organized["unranked"] && organized["unranked"].length > 0) {
      organized["unranked"].sort((a, b) => {
        const titleA = (a.title || "").toLowerCase();
        const titleB = (b.title || "").toLowerCase();
        return titleA.localeCompare(titleB);
      });
    }

    Object.keys(organized).forEach((tierId) => {
      // Ignore les animés non-classés car ils sont déjà triés alphabétiquement
      if (tierId === "unranked") return;

      const tierOrder = tierOrders.get(tierId);
      if (tierOrder && tierOrder.length > 0) {
        const orderedItems = [];
        const remainingItems = [...organized[tierId]];

        tierOrder.forEach((itemId) => {
          const itemIndex = remainingItems.findIndex((a) => a.id === itemId);
          if (itemIndex !== -1) {
            orderedItems.push(remainingItems[itemIndex]);
            remainingItems.splice(itemIndex, 1);
          }
        });

        orderedItems.push(...remainingItems);
        organized[tierId] = orderedItems;
      }
    });

    return organized;
  };

  // Basculer le mode édition
  const toggleEditMode = () => {
    setEditMode(!editMode);
    setEditingTier(null); // Annule toute édition en cours
  };

  // Ajouter un nouveau tier
  const addTier = () => {
    if (!editMode) return;

    const newId = `T${Date.now()}`;
    const newTier = {
      id: newId,
      name: `Nouveau Tier`,
      color: TIER_COLORS[Math.floor(Math.random() * TIER_COLORS.length)],
    };
    const newTiers = [...tiers, newTier];
    updateTiers(newTiers);
    setEditingTier(newId);
  };

  // Supprimer un tier
  const deleteTier = (tierId) => {
    if (!editMode || tiers.length <= 1) return;

    const newTiers = tiers.filter((t) => t.id !== tierId);
    updateTiers(newTiers);

    // Déplacer les items de ce tier vers "unranked"
    const newAssignments = new Map(tierAssignments);
    for (const [itemId, assignedTier] of newAssignments.entries()) {
      if (assignedTier === tierId) {
        newAssignments.delete(itemId);
      }
    }
    updateTierAssignments(newAssignments);

    // Nettoyer l'ordre de ce tier
    const newTierOrders = new Map(tierOrders);
    newTierOrders.delete(tierId);
    setTierOrders(newTierOrders);
  };

  // Modifier le nom d'un tier
  const updateTierName = (tierId, newName) => {
    if (!editMode) return;

    const newTiers = tiers.map((tier) =>
      tier.id === tierId ? { ...tier, name: newName } : tier
    );
    updateTiers(newTiers);
    setEditingTier(null);
  };

  // Changer la couleur d'un tier
  const updateTierColor = (tierId, newColor) => {
    if (!editMode) return;

    const newTiers = tiers.map((tier) =>
      tier.id === tierId ? { ...tier, color: newColor } : tier
    );
    updateTiers(newTiers);
  };

  // Gérer le déclassement d'un item (équivalent à un drag vers "unranked")
  const handleItemUnrank = (item) => {
    const currentTier = tierAssignments.get(item.id);

    if (!currentTier) {
      // L'item est déjà non classé, on appelle la suppression complète
      if (onItemDelete) {
        onItemDelete(item);
      }
      return;
    }

    // Simuler exactement le même comportement qu'un drag & drop vers "unranked"
    const newAssignments = new Map(tierAssignments);
    newAssignments.delete(item.id);

    const newTierOrders = new Map(tierOrders);

    // Nettoyer l'ordre de l'ancien tier
    if (currentTier !== "unranked") {
      const oldOrder = newTierOrders.get(currentTier) || [];
      const cleanedOrder = oldOrder.filter((id) => id !== item.id);
      newTierOrders.set(currentTier, cleanedOrder);
    }

    updateTierAssignments(newAssignments);
    updateTierOrders(newTierOrders);

    // Notifier les changements d'ordre
    if (onTierOrdersChange) {
      onTierOrdersChange(newTierOrders);
    }

    // Calculer la position finale dans "unranked" (à la fin)
    const unrankedItems = organizedItems.unranked || [];
    const finalPosition = unrankedItems.length;

    // Émettre l'événement collaboratif (comme dans handleDrop)
    if (onTierChange) {
      onTierChange(item.id, "unranked", finalPosition);
    }
  };

  const organizedItems = organizeItemsByTier();
  const firstUnrankedItem = organizedItems.unranked?.[0];

  return (
    <div className={styles.tierListContainer}>
      <div className={styles.tierList}>
        {/* Header avec bouton d'ajout et mode édition */}
        <div className={styles.tierHeader}>
          <h2>Tier List</h2>
          <div className={styles.headerControls}>
            <button
              onClick={toggleEditMode}
              className={`${styles.editModeButton} ${editMode ? styles.editModeActive : ""
                }`}
              title={
                editMode ? "Quitter le mode édition" : "Activer le mode édition"
              }
            >
              ✏️ {editMode ? "Terminer" : "Modifier"}
            </button>
            {editMode && (
              <button onClick={addTier} className={styles.addTierButton}>
                + Ajouter Tier
              </button>
            )}
          </div>
        </div>

        {/* Tiers configurables */}
        {tiers.map((tier) => (
          <div
            key={tier.id}
            className={styles.tierRow}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, tier.id)}
            data-tier={tier.id}
          >
            <div
              className={styles.tierLabel}
              style={{ backgroundColor: tier.color }}
            >
              {editingTier === tier.id && editMode ? (
                <input
                  type="text"
                  defaultValue={tier.name}
                  className={styles.tierNameInput}
                  onBlur={(e) => updateTierName(tier.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      updateTierName(tier.id, e.target.value);
                    }
                    if (e.key === "Escape") {
                      setEditingTier(null);
                    }
                  }}
                  autoFocus
                />
              ) : (
                <span
                  className={styles.tierName}
                  onClick={() => editMode && setEditingTier(tier.id)}
                  title={editMode ? "Cliquer pour modifier" : tier.name}
                  style={{ cursor: editMode ? "pointer" : "default" }}
                >
                  {tier.name}
                </span>
              )}

              <div className={styles.tierControls}>
                {editMode && (
                  <input
                    type="color"
                    value={tier.color}
                    onChange={(e) => updateTierColor(tier.id, e.target.value)}
                    className={styles.colorPicker}
                    title="Changer la couleur"
                  />
                )}
                <span className={styles.tierCount}>
                  {organizedItems[tier.id]?.length || 0}
                </span>
                {editMode && tiers.length > 1 && (
                  <button
                    onClick={() => deleteTier(tier.id)}
                    className={styles.deleteTierButton}
                    title="Supprimer ce tier"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            <div className={styles.tierContent}>
              {organizedItems[tier.id]?.length > 0 ? (
                organizedItems[tier.id].map((item, index) => (
                  <div
                    key={item.id}
                    className={`${styles.itemCardWrapper} ${item.isPlaceholder ? styles.placeholder : ""
                      } ${draggedItem?.id === item.id ? styles.dragging : ""}`}
                    onDragOver={(e) =>
                      !item.isPlaceholder &&
                      handleDragOverItem(e, item, tier.id)
                    }
                    onDrop={(e) => handleDrop(e, tier.id)}
                  >
                    {item.isPlaceholder ? (
                      <div className={styles.dropPlaceholder}>
                        <ItemCard
                          item={item.draggedItem}
                          tier={tier.id}
                          isPreview={true}
                        />
                      </div>
                    ) : (
                      <ItemCard
                        item={item}
                        tier={tier.id}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onDelete={handleItemUnrank}
                      />
                    )}
                  </div>
                ))
              ) : (
                <div
                  className={`${styles.emptyTier} ${!(draggedItem && dragOverPosition?.tierId === tier.id)
                    ? styles.hasPlaceholder
                    : ""
                    }`}
                  onDragOver={(e) => handleDragOverEmptyTier(e, tier.id)}
                  onDrop={(e) => handleDrop(e, tier.id)}
                >
                  {draggedItem && dragOverPosition?.tierId === tier.id ? (
                    <div className={styles.dropPlaceholder}>
                      <ItemCard
                        item={draggedItem}
                        tier={tier.id}
                        isPreview={true}
                      />
                    </div>
                  ) : (
                    "Glissez un item ici pour le classer"
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Section des items non classés */}
        <div
          className={`${styles.tierRow} ${styles.unrankedRow}`}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, "unranked")}
        >
          <div className={styles.tierLabel}>
            <span className={styles.tierName}>Non classés</span>
            <span className={styles.tierCount}>
              {organizedItems.unranked?.length || 0}
            </span>
          </div>

          <div className={styles.tierContent}>
            {organizedItems.unranked?.length > 0 ? (
              organizedItems.unranked.map((item, index) => (
                <div
                  key={item.id}
                  className={`${styles.itemCardWrapper} ${item.isPlaceholder ? styles.placeholder : ""
                    } ${draggedItem?.id === item.id ? styles.dragging : ""}`}
                  onDragOver={(e) =>
                    !item.isPlaceholder &&
                    handleDragOverItem(e, item, "unranked")
                  }
                  onDrop={(e) => handleDrop(e, "unranked")}
                >
                  {item.isPlaceholder ? (
                    <div className={styles.dropPlaceholder}>
                      <ItemCard item={item.draggedItem} isPreview={true} />
                    </div>
                  ) : (
                    <ItemCard
                      item={item}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onDelete={onItemDelete}
                    />
                  )}
                </div>
              ))
            ) : (
              <div
                className={`${styles.emptyTier} ${!(draggedItem && dragOverPosition?.tierId === "unranked")
                  ? styles.hasPlaceholder
                  : ""
                  }`}
                onDragOver={(e) => handleDragOverEmptyTier(e, "unranked")}
                onDrop={(e) => handleDrop(e, "unranked")}
              >
                {draggedItem && dragOverPosition?.tierId === "unranked" ? (
                  <div className={styles.dropPlaceholder}>
                    <ItemCard item={draggedItem} isPreview={true} />
                  </div>
                ) : (
                  "Vous n'avez aucun item à classer"
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Petit menu latéral fixe avec le premier item non classé */}
      {firstUnrankedItem && (
        <div
          className={`${styles.previewPanel} ${previewOpen ? styles.previewOpen : styles.previewClosed
            }`}
        >
          <button
            onClick={() => setPreviewOpen(!previewOpen)}
            className={styles.previewToggle}
            title={previewOpen ? "Fermer l'aperçu" : "Ouvrir l'aperçu"}
          >
            {previewOpen ? "›" : "‹"}
          </button>

          <div className={styles.previewContent}>
            <div className={styles.previewHeader}>
              <span className={styles.previewTitle}>
                {previewOpen ? "Prochain item à classer" : ""}
              </span>
              {previewOpen && (
                <span className={styles.previewCount}>
                  {organizedItems.unranked?.length} restants
                </span>
              )}
            </div>

            {previewOpen && (
              <div className={styles.previewItem}>
                <ItemCard
                  item={firstUnrankedItem}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDelete={onItemDelete}
                  isPreviewPanel={true}
                />
                {/* Ajout des infos de l'item */}
                <div className={styles.itemInfo}>
                  <h4 className={styles.itemTitle}>
                    {firstUnrankedItem.title || firstUnrankedItem.name}
                  </h4>
                  {firstUnrankedItem.year && (
                    <div className={styles.itemYear}>
                      ({firstUnrankedItem.year})
                    </div>
                  )}
                  {firstUnrankedItem.score && (
                    <div className={styles.itemScore}>
                      <strong>Score MAL :</strong> {firstUnrankedItem.score}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
