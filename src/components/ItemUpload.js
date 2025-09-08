"use client";

import { useState, useRef } from "react";
import styles from "./ItemUpload.module.css";

export default function ItemUpload({ onItemsAdded, existingItems = [] }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
  const [pendingItems, setPendingItems] = useState([]);
  const [duplicateItems, setDuplicateItems] = useState([]);
  const fileInputRef = useRef(null);

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
    
    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length > 0) {
      processImages(imageFiles);
    }
  };

  const handleFileInput = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      processImages(files);
    }
  };

  const processImages = (files) => {
    const items = files.map(file => {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      const imagePath = `images/${file.name}`;
      const imageUrl = URL.createObjectURL(file);
      
      return {
        id: `temp-${Date.now()}-${Math.random()}`,
        name: nameWithoutExt,
        image: imagePath,
        description: "",
        file: file, // Fichier original pour l'upload
        imageUrl: imageUrl, // URL pour l'aperçu
        imageKey: Date.now(), // Clé unique pour forcer le re-rendu
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    });

    // Vérifier les doublons
    const duplicates = checkForDuplicates(items);
    
    if (duplicates.length > 0) {
      setDuplicateItems(duplicates);
      setShowDuplicatesModal(true);
    } else {
      setPendingItems(items);
      setShowModal(true);
    }
  };

  const checkForDuplicates = (newItems) => {
    const duplicates = [];
    
    newItems.forEach(newItem => {
      // Vérifier les doublons par nom
      const nameExists = existingItems.some(existing => 
        existing.name.toLowerCase() === newItem.name.toLowerCase()
      );
      
      // Vérifier les doublons par nom d'image
      const imageExists = existingItems.some(existing => 
        existing.image && existing.image === newItem.image
      );
      
      if (nameExists || imageExists) {
        duplicates.push({
          ...newItem,
          duplicateType: nameExists && imageExists ? 'both' : nameExists ? 'name' : 'image',
          existingItem: existingItems.find(existing => 
            existing.name.toLowerCase() === newItem.name.toLowerCase() || 
            (existing.image && existing.image === newItem.image)
          )
        });
      }
    });
    
    return duplicates;
  };

  const handleDuplicatesConfirm = () => {
    setPendingItems(duplicateItems);
    setShowDuplicatesModal(false);
    setShowModal(true);
  };

  const handleDuplicatesCancel = () => {
    // Nettoyer les URLs créées pour éviter les fuites mémoire
    duplicateItems.forEach(item => {
      if (item.imageUrl) {
        URL.revokeObjectURL(item.imageUrl);
      }
    });
    
    setDuplicateItems([]);
    setShowDuplicatesModal(false);
  };

  const updateDuplicateItem = (index, field, value) => {
    const updated = [...duplicateItems];
    updated[index] = { ...updated[index], [field]: value };
    setDuplicateItems(updated);
  };

  const removeDuplicateItem = (index) => {
    const itemToRemove = duplicateItems[index];
    // Nettoyer l'URL de l'image
    if (itemToRemove.imageUrl) {
      URL.revokeObjectURL(itemToRemove.imageUrl);
    }
    
    const updated = duplicateItems.filter((_, i) => i !== index);
    setDuplicateItems(updated);
    
    // Si plus de doublons, fermer la modal
    if (updated.length === 0) {
      setShowDuplicatesModal(false);
    }
  };

  const handleClickUpload = () => {
    fileInputRef.current?.click();
  };

  const updatePendingItem = (index, field, value) => {
    const updated = [...pendingItems];
    updated[index] = { ...updated[index], [field]: value };
    setPendingItems(updated);
  };

  const removePendingItem = (index) => {
    const updated = pendingItems.filter((_, i) => i !== index);
    setPendingItems(updated);
  };

  const addEmptyItem = () => {
    const newItem = {
      id: `temp-${Date.now()}-${Math.random()}`,
      name: "",
      image: null,
      description: "",
      file: null,
      imageKey: Date.now(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    setPendingItems([...pendingItems, newItem]);
  };

  const replaceItemImage = (index, file) => {
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
    const imagePath = `images/${file.name}`;
    
    // Révoquer l'ancienne URL si elle existe
    const oldItem = pendingItems[index];
    if (oldItem.file && oldItem.imageUrl) {
      URL.revokeObjectURL(oldItem.imageUrl);
    }

    // Créer une nouvelle URL pour le nouveau fichier
    const imageUrl = URL.createObjectURL(file);
    
    const updated = [...pendingItems];
    updated[index] = {
      ...updated[index],
      file: file,
      image: imagePath,
      imageUrl: imageUrl,
      imageKey: Date.now() // Nouvelle clé pour forcer le re-rendu
    };

    // Optionnellement, mettre à jour le nom si il était vide
    if (!updated[index].name.trim()) {
      updated[index].name = nameWithoutExt;
    }

    setPendingItems(updated);
  };

  const handleImageReplace = (index) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      if (e.target.files[0]) {
        replaceItemImage(index, e.target.files[0]);
      }
    };
    input.click();
  };

  const handleSave = async () => {
    try {
      const formData = new FormData();
      
      // Prépare les données pour l'envoi
      const itemsToSave = pendingItems.map((item, index) => {
        if (item.file) {
          formData.append(`file-${index}`, item.file);
        }
        
        return {
          name: item.name || 'Sans nom',
          image: item.image,
          description: item.description || '',
          created_at: item.created_at,
          updated_at: new Date().toISOString()
        };
      });

      formData.append('items', JSON.stringify(itemsToSave));

      const response = await fetch('/api/items/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        onItemsAdded(result.items);
        
        // Nettoyer les URLs créées pour éviter les fuites mémoire
        pendingItems.forEach(item => {
          if (item.imageUrl) {
            URL.revokeObjectURL(item.imageUrl);
          }
        });
        
        setShowModal(false);
        setPendingItems([]);
      } else {
        console.error('Erreur lors de l\'upload:', response.statusText);
      }
    } catch (error) {
      console.error('Erreur lors de l\'upload:', error);
    }
  };

  const handleCancel = () => {
    // Nettoyer les URLs créées pour éviter les fuites mémoire
    pendingItems.forEach(item => {
      if (item.imageUrl) {
        URL.revokeObjectURL(item.imageUrl);
      }
    });
    
    setShowModal(false);
    setPendingItems([]);
  };

  return (
    <>
      <div className={styles.uploadZone}>
        <div
          className={`${styles.dropZone} ${isDragOver ? styles.dragOver : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleClickUpload}
        >
          <div className={styles.uploadContent}>
            <div className={styles.uploadIcon}>📁</div>
            <div className={styles.uploadText}>
              <p>Cliquez ou glissez des images ici</p>
              <p className={styles.uploadSubtext}>
                PNG, JPG, GIF jusqu'à 10MB
              </p>
            </div>
          </div>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileInput}
          multiple
          accept="image/*"
          style={{ display: 'none' }}
        />
      </div>

      {showModal && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>Ajouter des éléments</h2>
              <button 
                className={styles.closeButton}
                onClick={handleCancel}
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              {pendingItems.map((item, index) => (
                <div key={item.id} className={styles.itemForm}>
                  <div className={styles.itemHeader}>
                    <span className={styles.itemNumber}>Item #{index + 1}</span>
                    <button 
                      className={styles.removeItemButton}
                      onClick={() => removePendingItem(index)}
                      title="Supprimer cet élément"
                    >
                      ✕
                    </button>
                  </div>

                  <div className={styles.itemContent}>
                    <div className={styles.itemPreview}>
                      <div>
                        {item.file && item.imageUrl && (
                          <img 
                            key={item.imageKey} // Utilisez la clé pour forcer le re-rendu
                            src={item.imageUrl} 
                            alt="Preview"
                            className={styles.imagePreview}
                          />
                        )}
                        {!item.file && (
                          <div className={styles.noImage}>
                            🖼️ Pas d'image
                          </div>
                        )}
                      </div>
                      
                      <button 
                        className={styles.replaceImageButton}
                        onClick={() => handleImageReplace(index)}
                        title="Remplacer l'image"
                      >
                        📁 Changer
                      </button>
                    </div>

                    <div className={styles.itemFields}>
                      <div className={styles.field}>
                        <label>Nom *</label>
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => updatePendingItem(index, 'name', e.target.value)}
                          placeholder="Nom de l'élément"
                          required
                        />
                      </div>

                      <div className={styles.field}>
                        <label>Description</label>
                        <textarea
                          value={item.description}
                          onChange={(e) => updatePendingItem(index, 'description', e.target.value)}
                          placeholder="Description optionnelle"
                          rows="3"
                        />
                      </div>

                      {item.image && (
                        <div className={styles.field}>
                          <label>Chemin image (non éditable)</label>
                          <input
                            type="text"
                            value={item.image}
                            readOnly
                            placeholder="images/filename.jpg"
                            className={styles.readOnlyField}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              <div className={styles.addItemSection}>
                <button 
                  className={styles.addItemButton}
                  onClick={addEmptyItem}
                  type="button"
                >
                  ➕ Ajouter un élément
                </button>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button 
                className={styles.cancelButton}
                onClick={handleCancel}
              >
                Annuler
              </button>
              <button 
                className={styles.saveButton}
                onClick={handleSave}
                disabled={pendingItems.some(item => !item.name.trim())}
              >
                Enregistrer ({pendingItems.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {showDuplicatesModal && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>⚠️ Doublons détectés</h2>
              <button 
                className={styles.closeButton}
                onClick={handleDuplicatesCancel}
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              <p className={styles.duplicateWarning}>
                Les éléments suivants semblent déjà exister. Voulez-vous continuer ?
              </p>

              {duplicateItems.map((item, index) => (
                <div key={item.id} className={styles.duplicateItem}>
                  <div className={styles.duplicateHeader}>
                    <span className={styles.duplicateType}>
                      {item.duplicateType === 'both' && '🔴 Nom et image identiques'}
                      {item.duplicateType === 'name' && '🟡 Nom identique'}
                      {item.duplicateType === 'image' && '🟠 Image identique'}
                    </span>
                    <button 
                      className={styles.removeDuplicateButton}
                      onClick={() => removeDuplicateItem(index)}
                      title="Supprimer ce doublon"
                    >
                      ✕
                    </button>
                  </div>

                  <div className={styles.duplicateComparison}>
                    <div className={styles.newItem}>
                      <h4>Nouvel élément</h4>
                      <div className={styles.itemContent}>
                        <div className={styles.itemPreview}>
                          <div>
                            {item.file && item.imageUrl && (
                              <img 
                                src={item.imageUrl} 
                                alt="Nouveau"
                                className={styles.imagePreview}
                              />
                            )}
                          </div>
                        </div>
                        <div className={styles.itemFields}>
                          <div className={styles.field}>
                            <label>Nom</label>
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) => updateDuplicateItem(index, 'name', e.target.value)}
                              placeholder="Nom de l'élément"
                            />
                          </div>
                          <div className={styles.field}>
                            <label>Description</label>
                            <textarea
                              value={item.description}
                              onChange={(e) => updateDuplicateItem(index, 'description', e.target.value)}
                              placeholder="Description optionnelle"
                              rows="2"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className={styles.existingItem}>
                      <h4>Élément existant</h4>
                      <div className={styles.existingInfo}>
                        <p><strong>Nom:</strong> {item.existingItem.name}</p>
                        <p><strong>Description:</strong> {item.existingItem.description || 'Aucune'}</p>
                        {item.existingItem.image && (
                          <div className={styles.existingImage}>
                            <img src={`/${item.existingItem.image}`} alt="Existant" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.modalFooter}>
              <button 
                className={styles.cancelButton}
                onClick={handleDuplicatesCancel}
              >
                Annuler
              </button>
              <button 
                className={styles.continueButton}
                onClick={handleDuplicatesConfirm}
              >
                Continuer quand même
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
