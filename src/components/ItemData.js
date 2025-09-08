// Structure de données pour un item unifié
// Regroupe toutes les saisons d'un item en une seule entité

export class ItemData {
  constructor(data) {
    this.id = data.id || data.mal_id;
    // Champs principaux selon la base SQL
    this.title = data.title;
    this.title_english = data.title_english || null;
    this.title_original = data.title_original || data.title_japanese || null;
    // Pour compatibilité, on garde le titre anglais prioritaire pour baseTitle
    this.baseTitle = this.extractBaseTitle(this.title_english || this.title || this.title_original);
    this.image =
      data.image ||
      data.images?.jpg?.image_url ||
      data.images?.jpg?.small_image_url ||
      data.images?.jpg?.large_image_url ||
      data.image_url ||
      "/placeholder-item.svg";
    this.year = data.year || this.extractYear(data.aired);
    this.genres = data.genres || [];
    this.synopsis = data.synopsis;
    this.score = data.score;
    this.status = data.status;
    this.type = data.type;
  }

  // Extrait le titre de base en supprimant les indicateurs de saison
  extractBaseTitle(title) {
    if (!title) return "";

    // Supprime les patterns courants de saison
    const seasonPatterns = [
      / Season \d+$/i,
      / S\d+$/i,
      / \d+(nd|rd|th) Season$/i,
      / Part \d+$/i,
      / Cour \d+$/i,
      / \d+$/,
      /: Season \d+$/i,
      /: Part \d+$/i,
      / \((Season |Part )?\d+\)$/i,
    ];

    let baseTitle = title.trim();
    for (const pattern of seasonPatterns) {
      baseTitle = baseTitle.replace(pattern, "").trim();
    }

    return baseTitle || title;
  }

  // Extrait l'année de diffusion
  extractYear(aired) {
    if (aired?.from) {
      return new Date(aired.from).getFullYear();
    }
    return null;
  }

  // Fusion deux items (différentes saisons) en un seul
  static mergeItems(item1, item2) {
    // Garde l'item avec l'année la plus ancienne comme principal
    const mainItem = item1.year <= item2.year ? item1 : item2;
    const otherItem = item1.year <= item2.year ? item2 : item1;

    // Met à jour les titres si nécessaire
    if (!mainItem.title_english && otherItem.title_english) {
      mainItem.title_english = otherItem.title_english;
    }

    // Préserve la meilleure image disponible
    if (!mainItem.image || mainItem.image === "/placeholder-item.svg") {
      if (otherItem.image && otherItem.image !== "/placeholder-item.svg") {
        mainItem.image = otherItem.image;
      }
    }

    return mainItem;
  }
}

// Classe pour gérer une collection d'items uniques
export class ItemCollection {
  constructor() {
    this.items = new Map(); // Map par baseTitle pour un accès rapide
  }

  // Ajoute un item à la collection (gère automatiquement les doublons)
  addItem(itemData) {
    // Si c'est déjà un ItemData, on ne le recrée pas
    const item =
      itemData instanceof ItemData ? itemData : new ItemData(itemData);
    const baseTitle = item.baseTitle.toLowerCase();

    if (this.items.has(baseTitle)) {
      // Merge avec l'item existant
      const existingItem = this.items.get(baseTitle);
      const mergedItem = ItemData.mergeItems(existingItem, item);
      this.items.set(baseTitle, mergedItem);
    } else {
      this.items.set(baseTitle, item);
    }

    return this.items.get(baseTitle);
  }

  // Récupère tous les items uniques
  getAllItems() {
    return Array.from(this.items.values());
  }

  // Recherche un item par titre
  findItem(title) {
    const baseTitle = new ItemData({ title })
      .extractBaseTitle(title)
      .toLowerCase();
    return this.items.get(baseTitle);
  }
}
