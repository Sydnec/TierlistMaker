import styles from "./ItemCard.module.css";

export default function ItemCard({
  item,
  onDragStart,
  onDragEnd,
  onDelete,
  tier = null,
  isPreview = false,
  isPreviewPanel = false,
}) {
  const handleDragStart = (e) => {
    if (isPreview) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/plain", item.id);
    e.dataTransfer.effectAllowed = "move";
    if (onDragStart) onDragStart(item);
  };

  const handleDragEnd = (e) => {
    if (onDragEnd) onDragEnd(item);
  };

  const handleDelete = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDelete) onDelete(item);
  };

  return (
    <div
      className={`${styles.card} ${tier ? styles[`tier-${tier}`] : ""} ${isPreview ? styles.preview : ""
        } ${isPreviewPanel ? styles.previewPanel : ""}`}
      draggable={!isPreview}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      title={item.name}
    >
      <div className={styles.imageContainer}>
        <img
          src={item.image || "/placeholder-item.svg"}
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
