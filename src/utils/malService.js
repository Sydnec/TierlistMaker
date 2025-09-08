// Service pour interagir avec l'API MyItemList (Jikan API)
// Documentation: https://docs.api.jikan.moe/

const JIKAN_BASE_URL = "https://api.jikan.moe/v4";

// Délai entre les requêtes pour respecter les limites de l'API
const API_DELAY = 1000; // 1 seconde entre les requêtes

let lastRequestTime = 0;

// Helper pour respecter les limites de taux
const waitForRateLimit = async () => {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < API_DELAY) {
    const waitTime = API_DELAY - timeSinceLastRequest;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  lastRequestTime = Date.now();
};

export class MALService {
  // Recherche d'items par titre
  static async searchItem(query, limit = 10) {
    if (!query.trim()) return [];

    try {
      await waitForRateLimit();

      const response = await fetch(
        `${JIKAN_BASE_URL}/item?q=${encodeURIComponent(
          query
        )}&limit=${limit}&order_by=popularity&sort=asc`
      );

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      // Prioriser les titres anglais dans les résultats de recherche
      return (data.data || []).map(item => ({
        ...item,
        title: item.title_english || item.title
      }));
    } catch (error) {
      console.error("Erreur lors de la recherche d'items:", error);
      return [];
    }
  }

  // Récupère les détails d'un item spécifique
  static async getItemDetails(itemId) {
    try {
      await waitForRateLimit();

      const response = await fetch(`${JIKAN_BASE_URL}/item/${itemId}`);

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      // Prioriser le titre anglais dans les détails
      if (data.data) {
        data.data.title = data.data.title_english || data.data.title;
      }
      return data.data;
    } catch (error) {
      console.error(
        "Erreur lors de la récupération des détails de l'item:",
        error
      );
      return null;
    }
  }
}
