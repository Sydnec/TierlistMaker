import styles from "./ItemCard.module.css";

export default function ItemCard({
  item,
  onDragStart,
  onDragEnd,
  onDelete,
  tier = null,
  isPreview = false,
  isPreviewPanel = false,
  isAncienEmplacement = false,
  isAncienEmplacementVisible = true,
}) {
  // Ne plus utiliser d'état local isDragging - on se base sur les props
  const handleDragStart = (e) => {
    if (isPreview) {
      e.preventDefault();
      return;
    }

    // Configuration du drag
    e.dataTransfer.setData("text/plain", item.id);
    e.dataTransfer.effectAllowed = "move";

    // Créer une image complètement transparente pour supprimer l'image qui suit la souris
    const emptyDiv = document.createElement('div');
    emptyDiv.style.width = '1px';
    emptyDiv.style.height = '1px';
    emptyDiv.style.backgroundColor = 'transparent';
    emptyDiv.style.position = 'absolute';
    emptyDiv.style.top = '-1000px';
    emptyDiv.style.left = '-1000px';
    document.body.appendChild(emptyDiv);

    // Utiliser cette div invisible comme image de drag
    e.dataTransfer.setDragImage(emptyDiv, 0, 0);

    // Nettoyer la div après un court délai
    setTimeout(() => {
      if (document.body.contains(emptyDiv)) {
        document.body.removeChild(emptyDiv);
      }
    }, 0);

    if (onDragStart) onDragStart(item);
  };

  const handleDragEnd = (e) => {
    if (onDragEnd) onDragEnd(item);
  };

  const handleDelete = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDelete) onDelete(item.id);
  };

  // Déterminer les classes CSS selon l'état
  const getCardClasses = () => {
    let classes = [styles.card];

    if (tier && styles[`tier-${tier}`]) {
      classes.push(styles[`tier-${tier}`]);
    }

    if (isPreview) {
      classes.push(styles.preview);
    }

    if (isPreviewPanel) {
      classes.push(styles.previewPanel);
    }

    // Gestion de l'AncienEmplacement - ne plus dépendre de isDragging local
    if (isAncienEmplacement) {
      if (isAncienEmplacementVisible) {
        classes.push(styles.ancienEmplacementVisible);
      } else {
        classes.push(styles.ancienEmplacementInvisible);
      }
    }

    return classes.join(' ');
  };

  return (
    <div
      className={getCardClasses()}
      draggable={isPreview ? "false" : "true"}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      title={item.name}
    >
      <div className={styles.imageContainer}>
        <img
          src={item.image ? (item.image.startsWith('/') ? item.image : `/${item.image}`) : "/placeholder-item.svg"}
          alt={item.name}
          className={styles.image}
          loading="lazy"
        />
        {!isPreview && !isPreviewPanel && onDelete && (
          <button
            className={styles.deleteButton}
            onClick={handleDelete}
            title="Supprimer cet élément"
            type="button"
          >
            ×
          </button>
        )}
      </div>

      <div className={styles.overlay}>
        <div className={styles.title}>{item.name}</div>
        {item.year && <div className={styles.year}>({item.year})</div>}
      </div>
    </div>
  );
}
