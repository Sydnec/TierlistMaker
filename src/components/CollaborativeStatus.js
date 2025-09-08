import { useState, useEffect } from "react";
import styles from "./CollaborativeStatus.module.css";

export default function CollaborativeStatus({ isConnected, connectedUsers }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Évite les problèmes d'hydratation en n'affichant rien côté serveur
  if (!mounted) {
    return null;
  }

  return (
    <div className={styles.status}>
      <div
        className={`${styles.indicator} ${
          isConnected ? styles.connected : styles.disconnected
        }`}
      />
      <span className={styles.userCount}>{connectedUsers}</span>
    </div>
  );
}
