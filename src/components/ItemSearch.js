"use client";

import { useState, useRef } from "react";
import { MALService } from "../utils/malService";
import styles from "./ItemSearch.module.css";

export default function ItemSearch({
  onItemAdd,
  onBulkImport,
  collection,
  emitItemUpdate,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);

  // État pour les notifications d'ajout d'item
  const [addNotification, setAddNotification] = useState(null);

  // Recherche d'items via l'API Jikan
  const searchItems = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      setSelectedIndex(0);
      return;
    }

    setIsSearching(true);

    try {
      const results = await MALService.searchItem(query, 25);
      setSearchResults(results);
      setSelectedIndex(0);
    } catch (error) {
      console.error("Erreur de recherche:", error);
      setSearchResults([]);
      setSelectedIndex(0);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);

    // Debounce la recherche
    clearTimeout(window.searchTimeout);
    window.searchTimeout = setTimeout(() => {
      searchItems(value);
    }, 500);
  };

  const handleAddItem = (item) => {
    if (onItemAdd) {
      // Normalise l'objet item pour correspondre au schéma SQL
      const normalizedItem = {
        ...item,
        title: item.title || item.title_english || item.title_japanese,
        title_english: item.title_english || null,
        title_original: item.title_original || item.title_japanese || null,
        image:
          item.images?.jpg?.image_url ||
          item.images?.jpg?.small_image_url ||
          item.images?.jpg?.large_image_url ||
          item.image ||
          "/placeholder-item.svg",
      };

      // Vérifier si l'item existe déjà dans la collection
      let notificationType = "success";
      let notificationMessage = "";

      if (collection) {
        const existingItem = collection.findItem(normalizedItem.title);
        if (existingItem) {
          notificationType = "warning";
          notificationMessage = `📝 "${normalizedItem.title}" est déjà dans votre liste`;
        } else {
          notificationMessage = `✅ "${normalizedItem.title}" ajouté avec succès !`;
        }
      } else {
        notificationMessage = `✅ "${normalizedItem.title}" ajouté avec succès !`;
      }

      // Afficher la notification
      setAddNotification({
        type: notificationType,
        message: notificationMessage,
        item: normalizedItem
      });

      // Masquer la notification après 4 secondes
      setTimeout(() => setAddNotification(null), 4000);

      // Ajouter l'item (même s'il existe déjà, la logique de fusion se fera ailleurs)
      onItemAdd(normalizedItem);
    }

    // Remet le champ de recherche à zéro
    setSearchTerm("");
    setSearchResults([]);
    setSelectedIndex(0);

    // Remet le focus sur le champ de recherche
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (searchResults.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) =>
          Math.min(prev + 1, searchResults.length - 1)
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (searchResults[selectedIndex]) {
          handleAddItem(searchResults[selectedIndex]);
        }
        break;
      case "Escape":
        setSearchResults([]);
        setSelectedIndex(0);
        break;
    }
  };

  // Parse le XML de MyItemList
  const parseMALXML = (xmlText) => {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "text/xml");

      // Vérifier s'il y a des erreurs de parsing
      const parseError = xmlDoc.querySelector("parsererror");
      if (parseError) {
        throw new Error("Fichier XML invalide");
      }

      const itemElements = xmlDoc.querySelectorAll("item");
      const items = [];

      itemElements.forEach((item) => {
        const status = item.querySelector("my_status")?.textContent;
        console.log("🔍 Processing item with status:", status);

        // Importer seulement les items "Completed" (status = 2 ou "Completed")
        if (status === "2" || status === "Completed") {
          const malId = item.querySelector("series_itemdb_id")?.textContent;
          const title = item.querySelector("series_title")?.textContent;
          const title_english = item.querySelector("series_title_english")?.textContent || null;
          const title_japanese = item.querySelector("series_title_japanese")?.textContent || null;
          const episodes = item.querySelector("series_episodes")?.textContent;
          const type = item.querySelector("series_type")?.textContent;
          const score = item.querySelector("my_score")?.textContent;

          console.log("✅ Found completed item:", {
            malId,
            title,
            title_english,
            title_japanese,
            episodes,
            type,
            score,
          });

          if (malId && title) {
            console.log("🔍 Raw malId value:", malId, "type:", typeof malId);

            const parsedMalId = parseInt(malId);
            console.log(
              "🔍 Parsed malId:",
              parsedMalId,
              "isNaN:",
              isNaN(parsedMalId)
            );

            // Only proceed if we have a valid mal_id
            if (!isNaN(parsedMalId)) {
              const itemData = {
                mal_id: parsedMalId,
                id: parsedMalId, // Use mal_id as id
                title: title,
                title_english: title_english,
                title_original: title_japanese,
                episodes: episodes ? parseInt(episodes) : null,
                type: type || "Unknown",
                score: score ? parseFloat(score) : null,
                image: "/placeholder-item.svg", // Simplified for now
              };

              console.log("📦 Created item object:", itemData);
              items.push(itemData);
            } else {
              console.warn(
                "⚠️ Skipping item with invalid mal_id:",
                malId,
                "for title:",
                title
              );
            }
          }
        }
      });

      return items;
    } catch (error) {
      console.error("Erreur parsing XML:", error);
      throw new Error("Impossible de parser le fichier XML");
    }
  };

  // Gestion des fichiers
  const handleFileSelect = (file) => {
    if (!file) return;

    if (file.type !== "text/xml" && !file.name.endsWith(".xml")) {
      setImportStatus("❌ Veuillez sélectionner un fichier XML");
      return;
    }

    setIsImporting(true);
    setImportStatus("Lecture du fichier XML...");

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const xmlContent = e.target.result;
        const parsedItems = parseMALXML(xmlContent);

        if (parsedItems.length === 0) {
          setImportStatus("❌ Aucun item completed trouvé dans le XML");
          return;
        }

        setImportStatus(`Importation de ${parsedItems.length} items...`);

        if (collection && onBulkImport) {
          onBulkImport(parsedItems);
          setImportStatus(
            `✅ ${parsedItems.length} items importés avec succès !`
          );

          // Enrichir automatiquement avec les images MAL
          enrichItemsWithImages(parsedItems);
        }
      } catch (error) {
        console.error("Erreur d'import XML:", error);
        setImportStatus(`❌ ${error.message}`);
      } finally {
        setIsImporting(false);
        setTimeout(() => setImportStatus(""), 5000);
      }
    };

    reader.onerror = () => {
      setImportStatus("❌ Erreur lors de la lecture du fichier");
      setIsImporting(false);
    };

    reader.readAsText(file);
  };

  // Gestion du drag and drop
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  // Enrichissement des items avec les images MAL
  const enrichItemsWithImages = async (items) => {
    setImportStatus("🔄 Récupération des images depuis MyItemList...");
    let processed = 0;

    // Traitement par petits lots pour éviter la surcharge
    const batchSize = 5;
    const enrichedItems = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);

      const batchPromises = batch.map(async (item, batchIndex) => {
        try {
          // Délai progressif pour respecter les limites de l'API
          await new Promise((resolve) =>
            setTimeout(resolve, batchIndex * 1500)
          );

          const itemDetails = await MALService.getItemDetails(item.mal_id);

          if (itemDetails && itemDetails.images?.jpg?.image_url) {
            const enrichedItem = {
              ...item,
              image: itemDetails.images.jpg.image_url,
              year: itemDetails.aired?.prop?.from?.year || item.year,
              genres: itemDetails.genres?.map((g) => g.name) || [],
              synopsis: itemDetails.synopsis || null,
            };

            console.log(`✅ Image récupérée pour: ${item.title}`);

            // Émettre la mise à jour pour sauvegarder l'image en base
            if (emitItemUpdate) {
              emitItemUpdate(enrichedItem);
            }

            return enrichedItem;
          } else {
            console.log(`⚠️ Pas d'image trouvée pour: ${item.title}`);
            return item; // Retourne l'item original si pas d'image
          }
        } catch (error) {
          console.error(`❌ Erreur image pour ${item.title}:`, error);
          return item; // Retourne l'item original en cas d'erreur
        }
      });

      const batchResults = await Promise.all(batchPromises);
      enrichedItems.push(...batchResults);
      processed += batch.length;

      setImportStatus(`🔄 Images: ${processed}/${items.length} traitées`);
    }

    // Ne pas re-importer, les mises à jour individuelles sont suffisantes
    // Les images seront maintenant persistées en base via emitItemUpdate

    setImportStatus("✅ Import terminé avec images !");
    setTimeout(() => setImportStatus(""), 3000);
  };

  return (
    <div className={styles.searchContainer}>
      {/* Barres de recherche côte à côte */}
      <div className={styles.searchBars}>
        <div className={styles.searchSection}>
          <h3>🔍 Rechercher un item</h3>
          <div className={styles.searchBox}>
            <input
              type="text"
              placeholder="Tapez le nom d'un item..."
              value={searchTerm}
              onChange={handleSearchChange}
              onKeyDown={handleKeyDown}
              ref={searchInputRef}
              className={styles.searchInput}
            />

            {/* Résultats de recherche en menu déroulant */}
            {searchResults.length > 0 && (
              <div className={styles.results}>
                <div className={styles.resultsList}>
                  {searchResults.map((item, index) => (
                    <div
                      key={item.mal_id}
                      className={`${styles.resultItem} ${index === selectedIndex ? styles.selected : ""
                        }`}
                      onClick={() => handleAddItem(item)}
                    >
                      <img
                        src={
                          item.images?.jpg?.small_image_url ||
                          "/placeholder-item.svg"
                        }
                        alt={item.title}
                        className={styles.resultImage}
                      />
                      <div className={styles.resultInfo}>
                        <h4>{item.title}</h4>
                        {item.year && (
                          <span className={styles.year}>({item.year})</span>
                        )}
                        <div className={styles.metadata}>
                          {item.type && (
                            <span className={styles.type}>{item.type}</span>
                          )}
                          {item.episodes && (
                            <span className={styles.episodes}>
                              {item.episodes} ép.
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Notification d'ajout d'item */}
          {addNotification && (
            <div
              className={`${styles.addNotification} ${addNotification.type === "warning" ? styles.warning : styles.success
                }`}
            >
              <div className={styles.notificationContent}>
                <div className={styles.notificationMessage}>
                  {addNotification.message}
                </div>
                {addNotification.item.image && addNotification.item.image !== "/placeholder-item.svg" && (
                  <img
                    src={addNotification.item.image}
                    alt={addNotification.item.title}
                    className={styles.notificationImage}
                  />
                )}
              </div>
              <button
                className={styles.notificationClose}
                onClick={() => setAddNotification(null)}
                title="Fermer"
              >
                ×
              </button>
            </div>
          )}
        </div>

        <div className={styles.importSection}>
          <h3>📋 Import MyItemList</h3>

          <div
            className={`${styles.dropZone} ${isDragOver ? styles.dragOver : ""
              } ${isImporting ? styles.importing : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleBrowseClick}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileInputChange}
              accept=".xml"
              style={{ display: "none" }}
            />

            <div className={styles.dropZoneContent}>
              <div className={styles.dropZoneIcon}>📁</div>
              <div className={styles.dropZoneText}>
                <strong>Glissez un fichier XML</strong> ou cliquez pour
                parcourir
              </div>
              <div className={styles.dropZoneInstructions}>
                <a
                  href="https://myitemlist.net/panel.php?go=export"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  Exporter depuis MAL
                </a>
              </div>
            </div>
          </div>

          {importStatus && (
            <div
              className={`${styles.status} ${importStatus.includes("❌") ? styles.error : styles.success
                }`}
            >
              {importStatus}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
