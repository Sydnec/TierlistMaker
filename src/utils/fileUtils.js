/**
 * Utilitaires pour la gestion des fichiers et noms de fichiers
 */

/**
 * Nettoie un nom de fichier en supprimant les caractères problématiques
 * @param {string} filename - Le nom de fichier à nettoyer
 * @returns {string} - Le nom de fichier nettoyé
 */
export function cleanFileName(filename) {
    if (!filename) return '';

    return filename
        // Remplacer les espaces par des underscores
        .replace(/ /g, '_')
        // Supprimer les caractères spéciaux dangereux
        .replace(/[<>:"/\\|?*]/g, '')
        // Supprimer les points multiples consécutifs
        .replace(/\.+/g, '.')
        // Supprimer les underscores multiples consécutifs
        .replace(/_+/g, '_')
        // Supprimer les underscores en début et fin
        .replace(/^_+|_+$/g, '');
}

/**
 * Extrait le nom sans extension d'un fichier
 * @param {string} filename - Le nom de fichier
 * @returns {string} - Le nom sans extension
 */
export function getFileNameWithoutExtension(filename) {
    if (!filename) return '';
    return cleanFileName(filename.replace(/\.[^/.]+$/, ''));
}

/**
 * Génère un chemin d'image nettoyé
 * @param {string} filename - Le nom de fichier original
 * @returns {string} - Le chemin relatif nettoyé (ex: "images/mon_fichier.png")
 */
export function generateImagePath(filename) {
    if (!filename) return '';
    const cleanName = cleanFileName(filename);
    return `images/${cleanName}`;
}
