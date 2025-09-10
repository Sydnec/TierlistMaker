const { Server } = require('socket.io');

// Module gérant la logique WebSocket séparément pour pouvoir tout réécrire proprement.
// Exporte une fonction initialize(io, db) qui branche les events sur l'instance io fournie
// et retourne quelques helpers (notifyHubNewTierlist, reloadTierlistState).

let tierlistRooms = new Map(); // Map<tierlistId, roomState>
let ioRef = null;
let dbRef = null;
// Map pour garantir une seule connexion par client
let clientSockets = new Map(); // Map<clientId, socketId>

function getTierlistRoom(tierlistId) {
  if (!tierlistRooms.has(tierlistId)) {
    tierlistRooms.set(tierlistId, {
      items: [],
      tierAssignments: {},
      tiers: [],
      tierOrders: {},
      connectedUsers: 0,
      lastModified: Date.now(),
    });
  }
  return tierlistRooms.get(tierlistId);
}

async function loadTierlistStateFromDB(tierlistId) {
  if (!dbRef) return;
  try {
    console.time(`WS: chargement state ${tierlistId}`);
    const state = await dbRef.getFullState(tierlistId);
    const room = getTierlistRoom(tierlistId);
    const currentConnectedUsers = room.connectedUsers;
    Object.assign(room, { ...state, connectedUsers: currentConnectedUsers });
    console.timeEnd(`WS: chargement state ${tierlistId}`);
  } catch (err) {
    console.error('WS: erreur loadTierlistStateFromDB', err);
  }
}

async function reloadTierlistState(tierlistId) {
  await loadTierlistStateFromDB(tierlistId);
  return getTierlistRoom(tierlistId);
}

function notifyHubNewTierlist(tierlist) {
  if (!ioRef) return;
  console.log('WS: notify new tierlist to hub', tierlist.name || tierlist.id);
  ioRef.to('global-hub').emit('new-tierlist', tierlist);
}

function initialize(io, db) {
  ioRef = io;
  dbRef = db;

  io.on('connection', (socket) => {
    // Extraire clientId envoyé depuis le client (auth) pour garantir 1 connexion par navigateur
    const clientId = (socket.handshake && (socket.handshake.auth && socket.handshake.auth.clientId)) || (socket.handshake && socket.handshake.query && socket.handshake.query.clientId) || null;
    if (clientId) {
      const prevSocketId = clientSockets.get(clientId);
      if (prevSocketId && prevSocketId !== socket.id) {
        const prevSocket = ioRef.sockets.sockets.get(prevSocketId);
        if (prevSocket) {
          console.log(`WS: déconnexion de l'ancienne socket ${prevSocketId} pour client ${clientId}`);
          try { prevSocket.disconnect(true); } catch (e) { /* ignore */ }
        }
      }
      clientSockets.set(clientId, socket.id);
      socket.clientId = clientId;
    }

    console.log(`WS: utilisateur connecté ${socket.id}` + (clientId ? ` (clientId=${clientId})` : ''));

    socket.on('join-hub', () => {
      socket.join('global-hub');
      console.log(`WS: ${socket.id} joined global-hub`);
    });

    socket.on('leave-hub', () => {
      socket.leave('global-hub');
      console.log(`WS: ${socket.id} left global-hub`);
    });

    socket.on('join-tierlist', async (tierlistId) => {
      socket.tierlistId = tierlistId;
      socket.join(`tierlist-${tierlistId}`);

      const room = getTierlistRoom(tierlistId);
      // Recalculer le nombre d'utilisateurs à partir de la room réelle
      try {
        const socketsSet = await ioRef.in(`tierlist-${tierlistId}`).allSockets();
        room.connectedUsers = socketsSet ? socketsSet.size : 0;
      } catch (err) {
        // Fallback si allSockets non disponible
        room.connectedUsers = (room.connectedUsers || 0) + 1;
      }

      if (!room.items || room.items.length === 0) {
        await loadTierlistStateFromDB(tierlistId);
      }

      console.log(`WS: ${socket.id} joined tierlist ${tierlistId} (${room.connectedUsers})`);

      socket.emit('initial-state', room);
      io.to(`tierlist-${tierlistId}`).emit('users-count', room.connectedUsers);
    });

    socket.on('request-sync', ({ tierlistId }) => {
      if (!socket.tierlistId) return;
      const room = getTierlistRoom(tierlistId || socket.tierlistId);
      socket.emit('full-sync', room);
    });

    socket.on('item-add', async (payload) => {
      try {
        if (!socket.tierlistId) return;
        const room = getTierlistRoom(socket.tierlistId);
        const itemData = payload || {};
        if (itemData.title && !itemData.name) itemData.name = itemData.title;

        const cleaned = {
          id: itemData.id,
          tierlist_id: socket.tierlistId,
          name: itemData.name,
          image: itemData.image || null,
          description: itemData.description || null,
          created_at: itemData.created_at || new Date().toISOString(),
          updated_at: itemData.updated_at || new Date().toISOString(),
        };

        const exists = room.items.some(i => (i.id && cleaned.id && i.id === cleaned.id) || (i.name === cleaned.name && i.image === cleaned.image));
        if (!exists) {
          if (!cleaned.id) cleaned.id = `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          if (dbRef && dbRef.addItem) await dbRef.addItem(cleaned);
          room.items.push(cleaned);
          room.lastModified = Date.now();
          io.to(`tierlist-${socket.tierlistId}`).emit('item-added', cleaned);
        }
      } catch (err) {
        console.error('WS item-add error', err);
      }
    });

    socket.on('item-move', async (data) => {
      try {
        if (!socket.tierlistId) return;
        const { itemId, tierId } = data;
        const room = getTierlistRoom(socket.tierlistId);
        if (tierId === 'unranked') {
          if (dbRef && dbRef.removeItemFromTier) await dbRef.removeItemFromTier(itemId);
          delete room.tierAssignments[itemId];
        } else {
          room.tierAssignments[itemId] = tierId;
        }
        room.lastModified = Date.now();
        io.to(`tierlist-${socket.tierlistId}`).emit('item-moved', data);
      } catch (err) { console.error('WS item-move error', err); }
    });

    socket.on('item-delete', async (payload) => {
      try {
        if (!socket.tierlistId) return;
        const itemId = typeof payload === 'object' ? payload.itemId : payload;
        const room = getTierlistRoom(socket.tierlistId);
        if (dbRef && dbRef.deleteItem) await dbRef.deleteItem(itemId);
        room.items = room.items.filter(i => i.id !== itemId);
        delete room.tierAssignments[itemId];
        room.lastModified = Date.now();
        io.to(`tierlist-${socket.tierlistId}`).emit('item-deleted', itemId);
      } catch (err) { console.error('WS item-delete error', err); }
    });

    socket.on('item-update', async (updated) => {
      try {
        if (!socket.tierlistId) return;
        const room = getTierlistRoom(socket.tierlistId);
        if (dbRef && dbRef.updateItem) await dbRef.updateItem(updated.id, updated);
        const idx = room.items.findIndex(i => i.id === updated.id);
        if (idx !== -1) { room.items[idx] = { ...room.items[idx], ...updated }; room.lastModified = Date.now(); }
        io.to(`tierlist-${socket.tierlistId}`).emit('item-updated', updated);
      } catch (err) { console.error('WS item-update error', err); }
    });

    socket.on('tiers-update', async (payload) => {
      try {
        if (!socket.tierlistId) return;
        const newTiers = Array.isArray(payload) ? payload : (payload.tiers || []);
        const room = getTierlistRoom(socket.tierlistId);
        if (dbRef && dbRef.updateTiers) {
          const tiersWithId = newTiers.map(t => ({ ...t, tierlist_id: socket.tierlistId }));
          await dbRef.updateTiers(tiersWithId);
        }
        room.tiers = newTiers;
        room.lastModified = Date.now();
        io.to(`tierlist-${socket.tierlistId}`).emit('tiers-updated', newTiers);
      } catch (err) { console.error('WS tiers-update error', err); }
    });

    socket.on('bulk-import', async (payload) => {
      try {
        if (!socket.tierlistId) return;
        const items = Array.isArray(payload) ? payload : (payload.items || []);
        const room = getTierlistRoom(socket.tierlistId);
        if (dbRef && dbRef.addItem) {
          for (const it of items) {
            const cleaned = { ...it, tierlist_id: socket.tierlistId };
            if (!cleaned.id) cleaned.id = `item-${Date.now()}-${Math.random().toString(36).substr(2,9)}`;
            await dbRef.addItem(cleaned);
            room.items.push(cleaned);
          }
        } else {
          room.items.push(...items);
        }
        room.lastModified = Date.now();
        io.to(`tierlist-${socket.tierlistId}`).emit('bulk-imported', items);
      } catch (err) { console.error('WS bulk-import error', err); }
    });

    socket.on('request-sync', ({ tierlistId }) => {
      const room = getTierlistRoom(tierlistId || socket.tierlistId);
      socket.emit('full-sync', room);
    });

    socket.on('disconnect', async () => {
      // Nettoyage mapping clientId -> socketId si présent
      if (socket.clientId) {
        const mapped = clientSockets.get(socket.clientId);
        if (mapped === socket.id) clientSockets.delete(socket.clientId);
      }

      if (socket.tierlistId) {
        const room = getTierlistRoom(socket.tierlistId);
        try {
          const socketsSet = await ioRef.in(`tierlist-${socket.tierlistId}`).allSockets();
          room.connectedUsers = socketsSet ? socketsSet.size : 0;
        } catch (err) {
          // Fallback: décrémenter
          room.connectedUsers = Math.max(0, (room.connectedUsers || 1) - 1);
        }

        io.to(`tierlist-${socket.tierlistId}`).emit('users-count', room.connectedUsers);
        console.log(`WS: ${socket.id} disconnected from ${socket.tierlistId} (${room.connectedUsers})`);
      } else {
        console.log(`WS: ${socket.id} disconnected`);
      }
    });
  });

  return { notifyHubNewTierlist, reloadTierlistState };
}

module.exports = { initialize };
