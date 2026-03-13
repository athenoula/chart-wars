// ─── Chart Wars — Multiplayer Module ─────────────────────────────────────────
// Handles Firebase room management, presence, and real-time sync for online play.

const Multiplayer = {
    _db: null,
    _roomRef: null,
    _listeners: [],
    _presenceRef: null,

    // ── Initialise ───────────────────────────────────────────────────────────
    init() {
        Multiplayer._db = window.FirebaseDB;
        if (!Multiplayer._db) {
            console.warn("Multiplayer: Firebase not available");
            return false;
        }
        return true;
    },

    isAvailable() {
        return !!window.FirebaseDB;
    },

    // ── Room Code Generation ─────────────────────────────────────────────────
    _generateRoomCode() {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/1/O/0 confusion
        let code = "";
        for (let i = 0; i < 4; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
        return code;
    },

    // ── Create Room (Host) ───────────────────────────────────────────────────
    async createRoom(settings) {
        if (!Multiplayer._db) return null;

        const hostId = Multiplayer._getOrCreateId("chartWarsHostId");
        let roomCode;
        let attempts = 0;

        // Generate unique room code
        do {
            roomCode = Multiplayer._generateRoomCode();
            const snap = await Multiplayer._db.ref(`rooms/${roomCode}`).once("value");
            if (!snap.exists()) break;
            attempts++;
        } while (attempts < 10);

        if (attempts >= 10) {
            console.error("Failed to generate unique room code");
            return null;
        }

        const roomData = {
            hostId: hostId,
            hostConnected: true,
            status: "lobby",
            mode: settings.mode || "same-room",
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            expiresAt: null,
            settings: {
                totalQuestions: settings.totalQuestions || 10,
                decades: settings.decades || ["1950","1960","1970","1980","1990","2000","2010","2020"],
                timerSeconds: settings.timerSeconds || 30
            },
            currentQuestion: 0,
            totalQuestions: settings.totalQuestions || 10
        };

        Multiplayer._roomRef = Multiplayer._db.ref(`rooms/${roomCode}`);
        await Multiplayer._roomRef.set(roomData);

        // Set up host presence
        Multiplayer._setupPresence(roomCode, hostId, true);

        // Clean up old rooms from this host
        Multiplayer._cleanupOldRooms(hostId, roomCode);

        return { roomCode, hostId };
    },

    // ── Join Room (Player) ───────────────────────────────────────────────────
    async joinRoom(roomCode, playerName) {
        if (!Multiplayer._db) return null;

        roomCode = roomCode.toUpperCase().trim();
        const roomRef = Multiplayer._db.ref(`rooms/${roomCode}`);
        const snap = await roomRef.once("value");

        if (!snap.exists()) return { error: "Room not found" };

        const room = snap.val();
        if (room.status !== "lobby" && room.status !== "playing" && room.status !== "answering") {
            return { error: "Game already finished" };
        }

        const playerId = Multiplayer._getOrCreateId("chartWarsPlayerId");
        const playerRef = roomRef.child(`players/${playerId}`);

        await playerRef.set({
            name: playerName,
            score: 0,
            connected: true,
            joinedAt: firebase.database.ServerValue.TIMESTAMP
        });

        Multiplayer._roomRef = roomRef;
        Multiplayer._setupPresence(roomCode, playerId, false);

        // Store for reconnection
        sessionStorage.setItem("chartWarsRoomCode", roomCode);

        return { roomCode, playerId, hostId: room.hostId };
    },

    // ── Leave Room ───────────────────────────────────────────────────────────
    async leaveRoom(roomCode, playerId) {
        if (!Multiplayer._db) return;
        await Multiplayer._db.ref(`rooms/${roomCode}/players/${playerId}`).remove();
        Multiplayer._cleanup();
    },

    // ── Presence Management ──────────────────────────────────────────────────
    _setupPresence(roomCode, id, isHost) {
        const connRef = Multiplayer._db.ref(".info/connected");
        const path = isHost
            ? `rooms/${roomCode}/hostConnected`
            : `rooms/${roomCode}/players/${id}/connected`;

        Multiplayer._presenceRef = Multiplayer._db.ref(path);

        connRef.on("value", (snap) => {
            if (snap.val() === true) {
                Multiplayer._presenceRef.onDisconnect().set(false);
                Multiplayer._presenceRef.set(true);
            }
        });
    },

    // ── Listen to Room State ─────────────────────────────────────────────────
    listenToRoom(roomCode, callbacks) {
        if (!Multiplayer._db) return;

        const roomRef = Multiplayer._db.ref(`rooms/${roomCode}`);
        Multiplayer._roomRef = roomRef;

        // Status changes
        if (callbacks.onStatus) {
            const ref = roomRef.child("status");
            ref.on("value", snap => callbacks.onStatus(snap.val()));
            Multiplayer._listeners.push({ ref, event: "value" });
        }

        // Player list changes
        if (callbacks.onPlayers) {
            const ref = roomRef.child("players");
            ref.on("value", snap => callbacks.onPlayers(snap.val() || {}));
            Multiplayer._listeners.push({ ref, event: "value" });
        }

        // Current track changes
        if (callbacks.onTrack) {
            const ref = roomRef.child("currentTrack");
            ref.on("value", snap => callbacks.onTrack(snap.val()));
            Multiplayer._listeners.push({ ref, event: "value" });
        }

        // Timer changes
        if (callbacks.onTimer) {
            const ref = roomRef.child("timerEnd");
            ref.on("value", snap => callbacks.onTimer(snap.val()));
            Multiplayer._listeners.push({ ref, event: "value" });
        }

        // Question number changes
        if (callbacks.onQuestion) {
            const ref = roomRef.child("currentQuestion");
            ref.on("value", snap => callbacks.onQuestion(snap.val()));
            Multiplayer._listeners.push({ ref, event: "value" });
        }

        // Host connection status
        if (callbacks.onHostConnection) {
            const ref = roomRef.child("hostConnected");
            ref.on("value", snap => callbacks.onHostConnection(snap.val()));
            Multiplayer._listeners.push({ ref, event: "value" });
        }

        // Settings (for mode, totalQuestions etc)
        if (callbacks.onSettings) {
            const ref = roomRef.child("settings");
            ref.on("value", snap => callbacks.onSettings(snap.val()));
            Multiplayer._listeners.push({ ref, event: "value" });
        }

        // Mode
        if (callbacks.onMode) {
            const ref = roomRef.child("mode");
            ref.on("value", snap => callbacks.onMode(snap.val()));
            Multiplayer._listeners.push({ ref, event: "value" });
        }

        // Total questions
        if (callbacks.onTotalQuestions) {
            const ref = roomRef.child("totalQuestions");
            ref.on("value", snap => callbacks.onTotalQuestions(snap.val()));
            Multiplayer._listeners.push({ ref, event: "value" });
        }
    },

    // ── Listen to Answers (Host) ─────────────────────────────────────────────
    listenToAnswers(roomCode, questionNum, callback) {
        if (!Multiplayer._db) return;
        const ref = Multiplayer._db.ref(`rooms/${roomCode}/answers/${questionNum}`);
        ref.on("value", snap => callback(snap.val() || {}));
        Multiplayer._listeners.push({ ref, event: "value" });
    },

    // ── Listen to Results (Player) ───────────────────────────────────────────
    listenToResults(roomCode, questionNum, callback) {
        if (!Multiplayer._db) return;
        const ref = Multiplayer._db.ref(`rooms/${roomCode}/results/${questionNum}`);
        ref.on("value", snap => callback(snap.val()));
        Multiplayer._listeners.push({ ref, event: "value" });
    },

    // ── Listen to Standings ──────────────────────────────────────────────────
    listenToStandings(roomCode, callback) {
        if (!Multiplayer._db) return;
        const ref = Multiplayer._db.ref(`rooms/${roomCode}/standings`);
        ref.on("value", snap => callback(snap.val() || {}));
        Multiplayer._listeners.push({ ref, event: "value" });
    },

    // ── Host Actions ─────────────────────────────────────────────────────────
    async updateStatus(roomCode, status) {
        await Multiplayer._db.ref(`rooms/${roomCode}/status`).set(status);
    },

    async writeCurrentTrack(roomCode, track, mode) {
        const data = {
            title: track.title,
            artist: track.artist,
            year: track.year,
            albumArt: track.albumArt
        };
        // Only send previewUrl in remote mode
        if (mode === "remote") {
            data.previewUrl = track.previewUrl;
        }
        await Multiplayer._db.ref(`rooms/${roomCode}/currentTrack`).set(data);
    },

    async setTimerEnd(roomCode, timerEnd) {
        await Multiplayer._db.ref(`rooms/${roomCode}/timerEnd`).set(timerEnd);
    },

    async setCurrentQuestion(roomCode, num) {
        await Multiplayer._db.ref(`rooms/${roomCode}/currentQuestion`).set(num);
    },

    async publishResults(roomCode, questionNum, results) {
        await Multiplayer._db.ref(`rooms/${roomCode}/results/${questionNum}`).set(results);
    },

    async writeStandings(roomCode, standings) {
        await Multiplayer._db.ref(`rooms/${roomCode}/standings`).set(standings);
    },

    async setExpiresAt(roomCode) {
        await Multiplayer._db.ref(`rooms/${roomCode}/expiresAt`)
            .set(Date.now() + 3600000); // 1 hour
    },

    // ── Player Actions ───────────────────────────────────────────────────────
    async submitAnswer(roomCode, questionNum, playerId, answer) {
        await Multiplayer._db.ref(`rooms/${roomCode}/answers/${questionNum}/${playerId}`).set({
            artist: answer.artist || "",
            title: answer.title || "",
            year: answer.year || "",
            locked: true,
            lockedAt: firebase.database.ServerValue.TIMESTAMP
        });
    },

    // ── Get Room Data (one-time read) ────────────────────────────────────────
    async getRoom(roomCode) {
        if (!Multiplayer._db) return null;
        const snap = await Multiplayer._db.ref(`rooms/${roomCode}`).once("value");
        return snap.exists() ? snap.val() : null;
    },

    async getPlayers(roomCode) {
        if (!Multiplayer._db) return {};
        const snap = await Multiplayer._db.ref(`rooms/${roomCode}/players`).once("value");
        return snap.val() || {};
    },

    async getAnswers(roomCode, questionNum) {
        if (!Multiplayer._db) return {};
        const snap = await Multiplayer._db.ref(`rooms/${roomCode}/answers/${questionNum}`).once("value");
        return snap.val() || {};
    },

    // ── ID Management ────────────────────────────────────────────────────────
    _getOrCreateId(key) {
        let id = sessionStorage.getItem(key);
        if (!id) {
            id = "id_" + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
            sessionStorage.setItem(key, id);
        }
        return id;
    },

    // ── Cleanup ──────────────────────────────────────────────────────────────
    _cleanup() {
        Multiplayer._listeners.forEach(({ ref, event }) => ref.off(event));
        Multiplayer._listeners = [];
        Multiplayer._roomRef = null;
    },

    async _cleanupOldRooms(hostId, currentCode) {
        // Remove expired rooms from this host (best-effort)
        try {
            const snap = await Multiplayer._db.ref("rooms")
                .orderByChild("hostId").equalTo(hostId).once("value");
            const rooms = snap.val();
            if (!rooms) return;
            for (const [code, room] of Object.entries(rooms)) {
                if (code === currentCode) continue;
                if (room.expiresAt && room.expiresAt < Date.now()) {
                    await Multiplayer._db.ref(`rooms/${code}`).remove();
                    console.log(`🗑 Cleaned up expired room ${code}`);
                }
            }
        } catch (e) {
            console.warn("Room cleanup failed (non-critical)", e);
        }
    },

    // ── Contest System ───────────────────────────────────────────────────────

    // Write to top-level permanent developer log (all modes)
    async writeContestLog(contestData) {
        if (!Multiplayer._db) return;
        await Multiplayer._db.ref(`contestLog/${contestData.id}`).set({
            ...contestData,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    },

    // Update an existing log entry (e.g. when resolved)
    async updateContestLog(contestId, updates) {
        if (!Multiplayer._db) return;
        await Multiplayer._db.ref(`contestLog/${contestId}`).update(updates);
    },

    // Write to room-scoped pending queue (remote multiplayer)
    async writeRoomContest(roomCode, contestData) {
        if (!Multiplayer._db) return;
        await Multiplayer._db.ref(`rooms/${roomCode}/contests/${contestData.id}`).set(contestData);
    },

    // Host listens for all contests in room (real-time)
    listenToContests(roomCode, callback) {
        if (!Multiplayer._db) return;
        const ref = Multiplayer._db.ref(`rooms/${roomCode}/contests`);
        ref.on("value", snap => callback(snap.val() || {}));
        Multiplayer._listeners.push({ ref, event: "value" });
    },

    // Listen for a single contest's status (player-side resolution feedback)
    listenToContestStatus(roomCode, contestId, callback) {
        if (!Multiplayer._db) return;
        const ref = Multiplayer._db.ref(`rooms/${roomCode}/contests/${contestId}/status`);
        ref.on("value", snap => { if (snap.val()) callback(snap.val()); });
        Multiplayer._listeners.push({ ref, event: "value" });
    },

    // Host resolves a contest — updates room + standings + developer log
    async resolveContest(roomCode, contestId, status, pointsAwarded, teamName, updatedStandings) {
        if (!Multiplayer._db) return;
        await Multiplayer._db.ref(`rooms/${roomCode}/contests/${contestId}`).update({ status, pointsAwarded });
        if (status === "approved" && pointsAwarded > 0 && updatedStandings) {
            await Multiplayer._db.ref(`rooms/${roomCode}/standings`).update(updatedStandings);
        }
        await Multiplayer.updateContestLog(contestId, { status, pointsAwarded });
    },

    // ── Global Survival Leaderboard ──────────────────────────────────────────
    async saveSurvivalScore(entry) {
        if (!Multiplayer._db) return;
        await Multiplayer._db.ref("survivalLeaderboard").push({
            name: entry.name,
            score: entry.score,
            rounds: entry.rounds,
            date: entry.date
        });
    },

    async getSurvivalScores() {
        if (!Multiplayer._db) return [];
        const snap = await Multiplayer._db.ref("survivalLeaderboard").orderByChild("score").limitToLast(10).once("value");
        const entries = [];
        snap.forEach(child => entries.push(child.val()));
        entries.sort((a, b) => b.score - a.score);
        return entries;
    },

    // ── Destroy (on page unload) ─────────────────────────────────────────────
    destroy() {
        Multiplayer._cleanup();
        if (Multiplayer._presenceRef) {
            Multiplayer._presenceRef.off();
            Multiplayer._presenceRef = null;
        }
    }
};
