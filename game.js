// ─── Chart Wars — Game Logic & State Management ─────────────────────────────
// Controls screen flow, audio playback, answer collection, and scoring integration.

const Game = {
    HISTORY_KEY: "chartWarsPlayedTracks",

    state: {
        screen: "title",
        teams: [],
        tracks: [],
        usedTracks: new Set(),
        currentTrack: null,
        currentQuestion: 0,
        totalQuestions: 10,
        currentTeamIndex: 0,
        roundAnswers: {},   // { teamName: {artist, title, year} }
        scores: {},         // { teamName: totalScore }
        roundScores: [],    // History for stats
        audio: new Audio(),
        mode: "teams",      // "teams", "solo", or "survival"
        lives: 3,
        maxLives: 3,
        skippedCount: 0,
        isPlaying: false,
        replayUsed: false,
        clipInterval: null, // Track the progress interval so we can clear it
        decades: new Set(["1950","1960","1970","1980","1990","2000","2010","2020"]),
        multiplayer: {
            active: false,
            roomCode: null,
            hostId: null,
            mode: "same-room",  // "same-room" or "remote"
            timerSeconds: 30,
            players: {},        // { playerId: {name, score, connected} }
            answeredCount: 0,
            timerInterval: null
        }
    },

    // ── Initialise ──────────────────────────────────────────────────────────────
    init() {
        Game.bindEvents();
        Game.loadTracks();
    },

    // ── Event Binding ───────────────────────────────────────────────────────────
    bindEvents() {
        // Title Screen
        document.getElementById("btn-new-game").addEventListener("click", () => Game.showScreen("setup"));

        // Leaderboard
        document.getElementById("btn-leaderboard").addEventListener("click", () => {
            // Reset to solo tab
            document.querySelectorAll(".leaderboard-tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelector('.leaderboard-tab-btn[data-lb="solo"]').classList.add("active");
            Leaderboard.render("leaderboard-content");
            Game._bindLeaderboardTabs();
            Game.showScreen("leaderboard");
        });
        document.getElementById("btn-leaderboard-back").addEventListener("click", () => {
            Game.showScreen("title");
        });

        // Setup Screen
        document.getElementById("btn-add-player").addEventListener("click", Game.addPlayerInput);

        document.querySelectorAll(".mode-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
                e.target.classList.add("active");
                Game.state.mode = e.target.dataset.mode;
                Game.updateSetupForMode();
            });
        });

        document.querySelectorAll(".decade-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.target.classList.toggle("active");
                const decade = e.target.dataset.decade;
                if (Game.state.decades.has(decade)) {
                    Game.state.decades.delete(decade);
                } else {
                    Game.state.decades.add(decade);
                }
                Game.updateDecadeCount();
            });
        });

        document.getElementById("question-slider").addEventListener("input", (e) => {
            document.getElementById("question-count-val").textContent = e.target.value;
            Game.state.totalQuestions = parseInt(e.target.value);
        });

        document.getElementById("btn-start-game").addEventListener("click", Game.startGame);

        // Play Screen
        document.getElementById("btn-play-clip").addEventListener("click", Game.playClip);
        document.getElementById("btn-ready-answer").addEventListener("click", () => {
            // Stop audio if still playing
            Game.state.audio.pause();
            Game.state.audio.currentTime = 0;
            if (Game.state.clipInterval) {
                clearInterval(Game.state.clipInterval);
                Game.state.clipInterval = null;
            }
            Game.state.currentTeamIndex = 0;
            Game.showScreen("answer");
            Game.prepareAnswerScreen();
        });
        document.getElementById("btn-replay-clip").addEventListener("click", Game.replayClip);
        document.getElementById("btn-skip-track").addEventListener("click", Game.skipTrack);

        // Answer Screen
        document.getElementById("btn-lock-in").addEventListener("click", Game.lockInAnswers);

        // Wait Screen
        document.getElementById("btn-next-team").addEventListener("click", Game.nextTeam);

        // Reveal Screen
        document.getElementById("btn-next-question").addEventListener("click", Game.nextQuestion);

        // Scoreboard
        document.getElementById("btn-continue-game").addEventListener("click", () => {
            if (Game.state.currentQuestion >= Game.state.totalQuestions) {
                Game.showScreen("final");
                Game.showFinalResults();
            } else {
                Game.showScreen("play");
                Game.preparePlayScreen();
            }
        });

        // Final
        document.getElementById("btn-play-again").addEventListener("click", () => {
            Game.resetGame();
            Game.showScreen("title");
        });

        // ── Multiplayer Buttons ──────────────────────────────────────────────
        Game._bindMultiplayerEvents();
    },

    _bindMultiplayerEvents() {
        // Hide multiplayer buttons if Firebase unavailable
        if (!Multiplayer.isAvailable()) {
            const hostBtn = document.getElementById("btn-host-game");
            const joinBtn = document.getElementById("btn-join-game");
            if (hostBtn) hostBtn.style.display = "none";
            if (joinBtn) joinBtn.style.display = "none";
            return;
        }

        Multiplayer.init();

        // Host Game button
        document.getElementById("btn-host-game").addEventListener("click", () => {
            Game._initHostDecades();
            Game.showScreen("host-setup");
        });

        // Join Game button (shows join screen on same page)
        document.getElementById("btn-join-game").addEventListener("click", () => {
            Game.showScreen("join");
        });

        // Host setup: back button
        document.getElementById("btn-host-back").addEventListener("click", () => {
            Game.showScreen("title");
        });

        // Host setup: mode toggle (same-room / remote)
        document.querySelectorAll(".host-mode-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                document.querySelectorAll(".host-mode-btn").forEach(b => b.classList.remove("active"));
                e.target.classList.add("active");
                Game.state.multiplayer.mode = e.target.dataset.hostMode;
            });
        });

        // Host setup: decade toggles
        document.querySelectorAll(".host-decade-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.target.classList.toggle("active");
                const decade = e.target.dataset.decade;
                if (Game.state.decades.has(decade)) {
                    Game.state.decades.delete(decade);
                } else {
                    Game.state.decades.add(decade);
                }
                Game._updateHostDecadeCount();
            });
        });

        // Host setup: question slider
        document.getElementById("host-question-slider").addEventListener("input", (e) => {
            document.getElementById("host-question-count-val").textContent = e.target.value;
            Game.state.totalQuestions = parseInt(e.target.value);
        });

        // Host setup: timer buttons
        document.querySelectorAll(".timer-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                document.querySelectorAll(".timer-btn").forEach(b => b.classList.remove("active"));
                e.target.classList.add("active");
                Game.state.multiplayer.timerSeconds = parseInt(e.target.dataset.timer);
                document.getElementById("host-timer-val").textContent = e.target.dataset.timer + "s";
            });
        });

        // Create Room button
        document.getElementById("btn-create-room").addEventListener("click", Game._createRoom);

        // Lobby: start game
        document.getElementById("btn-start-online").addEventListener("click", Game._startOnlineGame);

        // Lobby: cancel
        document.getElementById("btn-lobby-back").addEventListener("click", () => {
            Multiplayer.destroy();
            Game.state.multiplayer.active = false;
            Game.showScreen("title");
        });

        // Join screen: join button
        document.getElementById("btn-join-room").addEventListener("click", Game._joinRoom);

        // Join screen: back
        document.getElementById("btn-join-back").addEventListener("click", () => {
            Game.showScreen("title");
        });

        // Multiplayer reveal button (host)
        document.getElementById("btn-mp-reveal").addEventListener("click", () => {
            Game._mpCollectAndReveal();
        });
    },

    // ── Host Decade Count ────────────────────────────────────────────────────
    _initHostDecades() {
        Game.state.decades = new Set(["1950","1960","1970","1980","1990","2000","2010","2020"]);
        document.querySelectorAll(".host-decade-btn").forEach(b => b.classList.add("active"));
        Game._updateHostDecadeCount();
    },

    _updateHostDecadeCount() {
        const count = Game.state.tracks.filter(t => {
            const decade = String(Math.floor(t.year / 10) * 10);
            return Game.state.decades.has(decade);
        }).length;
        const el = document.getElementById("host-decade-track-count");
        if (el) el.textContent = `(${count} tracks)`;
    },

    // ── Create Room ──────────────────────────────────────────────────────────
    async _createRoom() {
        if (Game.state.decades.size === 0) {
            alert("Select at least one decade!");
            return;
        }

        const settings = {
            totalQuestions: Game.state.totalQuestions,
            decades: [...Game.state.decades],
            timerSeconds: Game.state.multiplayer.timerSeconds,
            mode: Game.state.multiplayer.mode
        };

        const result = await Multiplayer.createRoom(settings);
        if (!result) {
            alert("Failed to create room. Check your Firebase configuration.");
            return;
        }

        Game.state.multiplayer.active = true;
        Game.state.multiplayer.roomCode = result.roomCode;
        Game.state.multiplayer.hostId = result.hostId;

        // Show lobby
        Game._showLobby(result.roomCode);
    },

    // ── Show Lobby ───────────────────────────────────────────────────────────
    _showLobby(roomCode) {
        document.getElementById("lobby-room-code").textContent = roomCode;

        // Generate QR code
        const qrContainer = document.getElementById("lobby-qr");
        qrContainer.innerHTML = "";
        const joinUrl = `${window.location.origin}${window.location.pathname.replace(/index\.html$/, "")}player.html?room=${roomCode}`;
        document.getElementById("lobby-url").textContent = joinUrl;

        if (typeof qrcode !== "undefined") {
            const qr = qrcode(0, "M");
            qr.addData(joinUrl);
            qr.make();
            qrContainer.innerHTML = qr.createSvgTag(5);
        }

        // Listen for players
        Multiplayer.listenToRoom(roomCode, {
            onPlayers: (players) => {
                Game.state.multiplayer.players = players;
                Game._renderLobbyPlayers(players);
            }
        });

        Game.showScreen("lobby");
    },

    _renderLobbyPlayers(players) {
        const list = document.getElementById("lobby-player-list");
        const countEl = document.getElementById("lobby-player-count");
        const startBtn = document.getElementById("btn-start-online");

        const entries = Object.entries(players);
        countEl.textContent = entries.length;

        list.innerHTML = "";
        entries.forEach(([pid, p]) => {
            const li = document.createElement("li");
            li.innerHTML = `
                <span class="player-status-dot ${p.connected ? 'connected' : 'disconnected'}"></span>
                ${Game._escapeHtml(p.name)}
            `;
            list.appendChild(li);
        });

        if (entries.length > 0) {
            startBtn.disabled = false;
            startBtn.textContent = "Start Game";
        } else {
            startBtn.disabled = true;
            startBtn.textContent = "Waiting for players...";
        }
    },

    // ── Start Online Game ────────────────────────────────────────────────────
    async _startOnlineGame() {
        const mp = Game.state.multiplayer;
        const players = mp.players;

        // Set up teams from players
        Game.state.teams = Object.entries(players).map(([pid, p]) => p.name);
        Game.state.scores = {};
        Object.entries(players).forEach(([pid, p]) => {
            Game.state.scores[p.name] = 0;
        });
        Game.state.usedTracks.clear();
        Game.state.currentQuestion = 0;
        Game.state.roundScores = [];
        Game.state.roundAnswers = {};
        Game.state.skippedCount = 0;
        Game.state.mode = "teams"; // multiplayer always uses teams mode

        await Multiplayer.updateStatus(mp.roomCode, "playing");

        Game.showScreen("play");
        Game._mpPreparePlayScreen();
    },

    // ── Multiplayer: Prepare Play Screen ─────────────────────────────────────
    async _mpPreparePlayScreen() {
        Game.state.roundAnswers = {};
        Game.state.multiplayer.answeredCount = 0;

        let available = Game.filterTracks();
        if (available.length === 0) {
            Game._clearHistory();
            available = Game.filterTracks();
        }
        if (available.length === 0) {
            await Multiplayer.updateStatus(Game.state.multiplayer.roomCode, "final");
            Game.state.totalQuestions = Game.state.currentQuestion;
            Game.showScreen("final");
            Game.showFinalResults();
            return;
        }

        Game.state.currentTrack = available[Math.floor(Math.random() * available.length)];
        const trackKey = Game.state.currentTrack.title + "|" + Game.state.currentTrack.artist;
        Game.state.usedTracks.add(trackKey);
        Game._addToHistory(trackKey);
        Game.state.currentQuestion++;
        Game.state.replayUsed = false;

        document.getElementById("current-q-num").textContent = Game.state.currentQuestion;
        document.getElementById("total-q-num").textContent = Game.state.totalQuestions;

        // Reset UI
        document.getElementById("btn-play-clip").style.display = "flex";
        document.getElementById("play-controls").style.display = "none";
        document.getElementById("audio-error").style.display = "none";
        document.getElementById("audio-progress").innerHTML = "";
        document.getElementById("btn-play-clip").classList.remove("playing");
        document.getElementById("volume-indicator").textContent = "🔇";
        document.getElementById("mp-answer-status").style.display = "none";

        // Hide pass-and-play controls, show multiplayer status
        document.getElementById("btn-ready-answer").style.display = "none";
        document.getElementById("btn-replay-clip").style.display = "none";
        document.getElementById("btn-skip-track").style.display = "none";

        Game.state.audio.pause();
        Game.state.audio.currentTime = 0;
        if (Game.state.clipInterval) {
            clearInterval(Game.state.clipInterval);
            Game.state.clipInterval = null;
        }

        // Write track to Firebase
        await Multiplayer.writeCurrentTrack(
            Game.state.multiplayer.roomCode,
            Game.state.currentTrack,
            Game.state.multiplayer.mode
        );
        await Multiplayer.setCurrentQuestion(Game.state.multiplayer.roomCode, Game.state.currentQuestion);
        await Multiplayer.updateStatus(Game.state.multiplayer.roomCode, "playing");
    },

    // ── Multiplayer: After clip plays, transition to answering ────────────────
    _mpStartAnswering() {
        const mp = Game.state.multiplayer;
        const playerCount = Object.keys(mp.players).length;

        // Show answer status
        document.getElementById("mp-answer-status").style.display = "block";
        document.getElementById("mp-answered-count").textContent = "0";
        document.getElementById("mp-player-total").textContent = playerCount;

        // Set timer
        const timerEnd = Date.now() + (mp.timerSeconds * 1000);
        Multiplayer.setTimerEnd(mp.roomCode, timerEnd);
        Multiplayer.updateStatus(mp.roomCode, "answering");

        // Show timer countdown
        const timerEl = document.getElementById("mp-answer-timer");
        timerEl.style.display = "block";
        if (mp.timerInterval) clearInterval(mp.timerInterval);
        mp.timerInterval = setInterval(() => {
            const remaining = Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000));
            timerEl.textContent = `${remaining}s remaining`;
            if (remaining <= 0) {
                clearInterval(mp.timerInterval);
                mp.timerInterval = null;
                timerEl.textContent = "Time's up!";
                Game._mpCollectAndReveal();
            }
        }, 250);

        // Listen for answers
        Multiplayer.listenToAnswers(mp.roomCode, Game.state.currentQuestion, (answers) => {
            const locked = Object.values(answers).filter(a => a.locked).length;
            Game.state.multiplayer.answeredCount = locked;
            document.getElementById("mp-answered-count").textContent = locked;

            // Auto-reveal when all answered
            if (locked >= playerCount) {
                if (mp.timerInterval) {
                    clearInterval(mp.timerInterval);
                    mp.timerInterval = null;
                }
                timerEl.textContent = "All answered!";
            }
        });
    },

    // ── Multiplayer: Collect answers and reveal ──────────────────────────────
    async _mpCollectAndReveal() {
        const mp = Game.state.multiplayer;
        if (mp.timerInterval) {
            clearInterval(mp.timerInterval);
            mp.timerInterval = null;
        }

        // Read answers from Firebase
        const answers = await Multiplayer.getAnswers(mp.roomCode, Game.state.currentQuestion);

        // Build round answers and calculate scores
        const track = Game.state.currentTrack;
        const resultsContainer = document.getElementById("team-results-container");
        resultsContainer.innerHTML = "";
        const roundStats = { question: Game.state.currentQuestion, teams: [] };
        const firebaseResults = {
            correctAnswer: {
                title: track.title,
                artist: track.artist,
                year: track.year,
                albumArt: track.albumArt
            }
        };
        const standings = {};

        Object.entries(mp.players).forEach(([pid, player]) => {
            const guesses = answers[pid] || { artist: "", title: "", year: "" };
            const score = Scoring.calculateRoundScore(track, guesses);

            // Update local scores
            if (!Game.state.scores[player.name]) Game.state.scores[player.name] = 0;
            Game.state.scores[player.name] += score.total;

            roundStats.teams.push({ name: player.name, score: score.total });

            // Build result card
            const card = document.createElement("div");
            card.className = "team-result-card";
            card.innerHTML = `
                <h4 class="cyan">${Game._escapeHtml(player.name)}</h4>
                ${Game._scoreRow("Artist", guesses.artist, score.artist)}
                ${Game._scoreRow("Title", guesses.title, score.title)}
                ${Game._scoreRow("Year", guesses.year, score.year)}
                <div class="score-row score-total-row">
                    <span>Round Total</span>
                    <span class="round-total ${score.total >= 6 ? 'text-green' : score.total > 0 ? 'text-amber' : 'text-red'}">${score.total} pts</span>
                </div>
            `;
            resultsContainer.appendChild(card);

            // Firebase results for players to read
            firebaseResults[pid] = {
                artist: score.artist,
                title: score.title,
                year: score.year,
                total: score.total
            };

            standings[pid] = {
                name: player.name,
                score: Game.state.scores[player.name]
            };
        });

        Game.state.roundScores.push(roundStats);

        // Track Info
        document.getElementById("reveal-art").src = track.albumArt;
        document.getElementById("reveal-title").textContent = track.title;
        document.getElementById("reveal-artist").textContent = track.artist;
        document.getElementById("reveal-year").textContent = track.year;

        // Update teams array for score rendering
        Game.state.teams = Object.values(mp.players).map(p => p.name);

        // Running Score
        Game._renderScoreList("running-score-list");

        // Publish to Firebase
        await Multiplayer.publishResults(mp.roomCode, Game.state.currentQuestion, firebaseResults);
        await Multiplayer.writeStandings(mp.roomCode, standings);
        await Multiplayer.updateStatus(mp.roomCode, "reveal");

        Game.showScreen("reveal");
    },

    // ── Join Room (from host index.html) ─────────────────────────────────────
    async _joinRoom() {
        const code = document.getElementById("inp-room-code").value.toUpperCase().trim();
        const name = document.getElementById("inp-player-name").value.trim();
        const errorEl = document.getElementById("join-error");

        if (!code || code.length !== 4) {
            errorEl.textContent = "Enter a 4-character room code.";
            errorEl.style.display = "block";
            return;
        }
        if (!name) {
            errorEl.textContent = "Enter your name.";
            errorEl.style.display = "block";
            return;
        }

        errorEl.style.display = "none";

        // Redirect to player.html
        const playerUrl = `player.html?room=${code}&name=${encodeURIComponent(name)}`;
        window.location.href = playerUrl;
    },

    // ── Load Tracks ─────────────────────────────────────────────────────────────
    async loadTracks() {
        try {
            const res = await fetch("data/tracks.json");
            const allTracks = await res.json();
            Game.state.tracks = allTracks.filter(t => t.previewUrl);
            const skipped = allTracks.length - Game.state.tracks.length;
            console.log(`📀 Loaded ${Game.state.tracks.length} tracks${skipped ? ` (${skipped} skipped — no preview)` : ""}`);
            Game.updateDecadeCount();
        } catch (e) {
            console.error("Failed to load tracks", e);
            alert("Error loading tracks.json. Make sure you're running a local server (e.g. npx serve).");
        }
    },

    // ── Decade Count Display ──────────────────────────────────────────────────
    updateDecadeCount() {
        const count = Game.state.tracks.filter(t => {
            const decade = String(Math.floor(t.year / 10) * 10);
            return Game.state.decades.has(decade);
        }).length;
        const el = document.getElementById("decade-track-count");
        if (el) el.textContent = `(${count} tracks)`;
    },

    // ── Screen Management ───────────────────────────────────────────────────────
    showScreen(screenId) {
        document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
        document.getElementById(`screen-${screenId}`).classList.add("active");
        Game.state.screen = screenId;
        window.scrollTo(0, 0);
    },

    // ── Setup Helpers ───────────────────────────────────────────────────────────
    addPlayerInput() {
        const container = document.getElementById("player-inputs");
        if (container.children.length >= 8) return;
        const input = document.createElement("input");
        input.type = "text";
        input.className = "neon-input";
        input.placeholder = `Team ${container.children.length + 1}`;
        input.value = `Team ${container.children.length + 1}`;
        container.appendChild(input);
    },

    // ── Toggle Setup UI for Solo/Teams ──────────────────────────────────────────
    updateSetupForMode() {
        const container = document.getElementById("player-inputs");
        const addBtn = document.getElementById("btn-add-player");
        const label = container.parentElement.querySelector("label");
        const questionGroup = document.getElementById("question-count-group");

        if (Game.state.mode === "solo" || Game.state.mode === "survival") {
            container.innerHTML = '<input type="text" class="neon-input" placeholder="Your Name" value="">';
            addBtn.style.display = "none";
            label.textContent = "Your Name";
            questionGroup.style.display = Game.state.mode === "survival" ? "none" : "";
        } else {
            container.innerHTML = `
                <input type="text" class="neon-input" placeholder="Team 1" value="Team 1">
                <input type="text" class="neon-input" placeholder="Team 2" value="Team 2">
            `;
            addBtn.style.display = "";
            label.textContent = "Players / Teams";
            questionGroup.style.display = "";
        }
    },

    // ── Game Start ──────────────────────────────────────────────────────────────
    startGame() {
        const inputs = document.querySelectorAll("#player-inputs input");
        Game.state.teams = Array.from(inputs).map(i => i.value.trim()).filter(v => v);

        if (Game.state.teams.length === 0) {
            if (Game.state.mode === "solo" || Game.state.mode === "survival") {
                Game.state.teams = ["Player"];
            } else {
                alert("Add at least one player or team!");
                return;
            }
        }

        if (Game.state.decades.size === 0) {
            alert("Select at least one decade!");
            return;
        }

        // Reset all game state
        Game.state.scores = {};
        Game.state.teams.forEach(t => Game.state.scores[t] = 0);
        Game.state.usedTracks.clear();
        Game.state.currentQuestion = 0;
        Game.state.roundScores = [];
        Game.state.roundAnswers = {};
        Game.state.skippedCount = 0;

        // Survival mode: init lives, no question limit
        if (Game.state.mode === "survival") {
            Game.state.lives = 3;
            Game.state.totalQuestions = 9999;
        }

        Game.showScreen("play");
        Game.preparePlayScreen();
    },

    // ── Reset Game (for Play Again) ─────────────────────────────────────────────
    resetGame() {
        // Clean up multiplayer
        if (Game.state.multiplayer.active) {
            Multiplayer.destroy();
        }
        if (Game.state.multiplayer.timerInterval) {
            clearInterval(Game.state.multiplayer.timerInterval);
        }
        Game.state.multiplayer = {
            active: false, roomCode: null, hostId: null,
            mode: "same-room", timerSeconds: 30,
            players: {}, answeredCount: 0, timerInterval: null
        };

        // Restore pass-and-play controls visibility
        const playControls = document.getElementById("play-controls");
        if (playControls) playControls.style.display = "";
        const readyBtn = document.getElementById("btn-ready-answer");
        const replayBtn = document.getElementById("btn-replay-clip");
        const skipBtn = document.getElementById("btn-skip-track");
        if (readyBtn) readyBtn.style.display = "";
        if (replayBtn) replayBtn.style.display = "";
        if (skipBtn) skipBtn.style.display = "";
        const mpStatus = document.getElementById("mp-answer-status");
        if (mpStatus) mpStatus.style.display = "none";

        Game.state.teams = [];
        Game.state.scores = {};
        Game.state.usedTracks.clear();
        Game.state.currentQuestion = 0;
        Game.state.totalQuestions = 10;
        Game.state.currentTeamIndex = 0;
        Game.state.roundAnswers = {};
        Game.state.roundScores = [];
        Game.state.replayUsed = false;
        Game.state.mode = "teams";
        Game.state.skippedCount = 0;
        Game.state.lives = 3;
        Game.state.decades = new Set(["1950","1960","1970","1980","1990","2000","2010","2020"]);
        document.querySelectorAll(".decade-btn").forEach(b => b.classList.add("active"));
        Game.state.audio.pause();
        Game.state.audio.currentTime = 0;
        if (Game.state.clipInterval) {
            clearInterval(Game.state.clipInterval);
            Game.state.clipInterval = null;
        }
    },

    // ── Track History (cross-session dedup via localStorage) ────────────────────
    _loadHistory() {
        try {
            const raw = localStorage.getItem(Game.HISTORY_KEY);
            return raw ? new Set(JSON.parse(raw)) : new Set();
        } catch { return new Set(); }
    },

    _addToHistory(key) {
        const history = Game._loadHistory();
        history.add(key);
        localStorage.setItem(Game.HISTORY_KEY, JSON.stringify([...history]));
    },

    _clearHistory() {
        localStorage.removeItem(Game.HISTORY_KEY);
    },

    // ── Track Filtering ─────────────────────────────────────────────────────────
    filterTracks() {
        const history = Game._loadHistory();
        return Game.state.tracks.filter(t => {
            const key = t.title + "|" + t.artist;
            if (Game.state.usedTracks.has(key)) return false;
            if (history.has(key)) return false;
            const decade = String(Math.floor(t.year / 10) * 10);
            return Game.state.decades.has(decade);
        });
    },

    // ── Prepare Play Screen ─────────────────────────────────────────────────────
    preparePlayScreen() {
        // Clear stale round answers for this new question
        Game.state.roundAnswers = {};

        let available = Game.filterTracks();
        if (available.length === 0) {
            // All tracks in selected decades have been played — reset history and retry
            Game._clearHistory();
            available = Game.filterTracks();
        }
        if (available.length === 0) {
            alert("No more tracks available! Ending game early.");
            Game.state.totalQuestions = Game.state.currentQuestion;
            Game.showScreen("final");
            Game.showFinalResults();
            return;
        }

        Game.state.currentTrack = available[Math.floor(Math.random() * available.length)];
        const trackKey = Game.state.currentTrack.title + "|" + Game.state.currentTrack.artist;
        Game.state.usedTracks.add(trackKey);
        Game._addToHistory(trackKey);
        Game.state.currentQuestion++;
        Game.state.replayUsed = false;

        document.getElementById("current-q-num").textContent = Game.state.currentQuestion;
        document.getElementById("total-q-num").textContent = Game.state.totalQuestions;

        // Reset UI
        document.getElementById("btn-play-clip").style.display = "flex";
        document.getElementById("play-controls").style.display = "none";
        document.getElementById("audio-error").style.display = "none";
        document.getElementById("audio-progress").innerHTML = "";
        document.getElementById("btn-play-clip").classList.remove("playing");
        document.getElementById("volume-indicator").textContent = "🔇";

        // Update replay button text for mode
        const replayBtn = document.getElementById("btn-replay-clip");
        replayBtn.textContent = (Game.state.mode === "solo" || Game.state.mode === "survival") ? "Replay Clip (-1 pt)" : "Replay Clip (-1 pt all teams)";

        // Survival mode UI
        const livesEl = document.getElementById("survival-lives");
        const qCounterTotal = document.getElementById("q-counter-total");
        const qCounterPrefix = document.getElementById("q-counter-prefix");
        if (Game.state.mode === "survival") {
            livesEl.style.display = "flex";
            Game._renderLives("survival-lives");
            qCounterTotal.style.display = "none";
            qCounterPrefix.textContent = "Round";
        } else {
            livesEl.style.display = "none";
            qCounterTotal.style.display = "";
            qCounterPrefix.textContent = "Question";
        }

        Game.state.audio.pause();
        Game.state.audio.currentTime = 0;
        if (Game.state.clipInterval) {
            clearInterval(Game.state.clipInterval);
            Game.state.clipInterval = null;
        }
    },

    // ── Play Audio Clip ─────────────────────────────────────────────────────────
    playClip() {
        const track = Game.state.currentTrack;
        const btn = document.getElementById("btn-play-clip");
        const controls = document.getElementById("play-controls");
        const progress = document.getElementById("audio-progress");
        const error = document.getElementById("audio-error");
        const volIcon = document.getElementById("volume-indicator");

        btn.classList.add("playing");
        volIcon.textContent = "🔊";

        // Create progress bar fill
        progress.innerHTML = '<div class="progress-fill" style="width:0%"></div>';
        const fill = progress.querySelector(".progress-fill");

        // Show controls immediately so player can answer early
        controls.style.display = "block";

        Game.state.audio.src = track.previewUrl;

        // Auto-skip if audio fails (expired preview URL)
        const onAudioError = () => {
            Game.state.audio.removeEventListener("error", onAudioError);
            console.warn(`⚠ Audio failed for "${track.title}" — skipping`);
            btn.classList.remove("playing");
            if (Game.state.clipInterval) {
                clearInterval(Game.state.clipInterval);
                Game.state.clipInterval = null;
            }
            // Pick a different track and retry (up to 3 attempts)
            Game.state.audioRetries = (Game.state.audioRetries || 0) + 1;
            if (Game.state.audioRetries < 4) {
                const available = Game.filterTracks();
                if (available.length > 0) {
                    Game.state.currentTrack = available[Math.floor(Math.random() * available.length)];
                    const retryKey = Game.state.currentTrack.title + "|" + Game.state.currentTrack.artist;
                    Game.state.usedTracks.add(retryKey);
                    Game._addToHistory(retryKey);
                    Game.playClip();
                    return;
                }
            }
            // Give up after retries
            Game.state.audioRetries = 0;
            error.style.display = "block";
        };
        Game.state.audio.addEventListener("error", onAudioError, { once: true });
        Game.state.audioRetries = Game.state.audioRetries || 0;

        Game.state.audio.play().catch(() => {
            // play() rejection is handled by the error event above
        });

        const startTime = Date.now();
        const duration = 20000; // 20 seconds

        // Clear any previous interval
        if (Game.state.clipInterval) clearInterval(Game.state.clipInterval);

        Game.state.clipInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const pct = Math.min(100, (elapsed / duration) * 100);
            if (fill) fill.style.width = `${pct}%`;

            if (elapsed >= duration) {
                clearInterval(Game.state.clipInterval);
                Game.state.clipInterval = null;
                Game.state.audio.pause();
                Game.state.audio.currentTime = 0;
                btn.classList.remove("playing");
                volIcon.textContent = "🔇";

                // In multiplayer: auto-transition to answering phase
                if (Game.state.multiplayer.active) {
                    Game._mpStartAnswering();
                } else {
                    controls.style.display = "block";
                }
            }
        }, 100);
    },

    // ── Replay Clip (–1 pt penalty to ALL teams) ────────────────────────────────
    replayClip() {
        if (Game.state.replayUsed) return;
        Game.state.replayUsed = true;

        // Apply –1 penalty to every team (fair cost for the replay)
        Game.state.teams.forEach(team => {
            Game.state.scores[team] -= 1;
        });

        Game.playClip();
    },

    // ── Skip Track (no scoring, load next) ──────────────────────────────────────
    skipTrack() {
        Game.state.audio.pause();
        Game.state.audio.currentTime = 0;
        if (Game.state.clipInterval) {
            clearInterval(Game.state.clipInterval);
            Game.state.clipInterval = null;
        }

        // Undo the question increment from preparePlayScreen so this doesn't count
        Game.state.currentQuestion--;
        Game.state.skippedCount++;

        const available = Game.filterTracks();
        if (available.length === 0) {
            alert("No more tracks available! Ending game.");
            Game.state.totalQuestions = Game.state.currentQuestion;
            Game.showScreen("final");
            Game.showFinalResults();
            return;
        }

        Game.showScreen("play");
        Game.preparePlayScreen();
    },

    // ── Prepare Answer Screen ───────────────────────────────────────────────────
    prepareAnswerScreen() {
        const team = Game.state.teams[Game.state.currentTeamIndex];
        const header = document.getElementById("answer-team-name");
        const subtext = document.querySelector("#screen-answer .subtext");

        // Survival lives on answer screen
        const livesAnswer = document.getElementById("survival-lives-answer");
        if (Game.state.mode === "survival") {
            livesAnswer.style.display = "flex";
            Game._renderLives("survival-lives-answer");
        } else {
            livesAnswer.style.display = "none";
        }

        if (Game.state.mode === "solo" || Game.state.mode === "survival") {
            header.textContent = "Enter your answers";
            subtext.style.display = "none";
        } else {
            header.textContent = `${team} — enter your answers`;
            subtext.style.display = "";
        }

        document.getElementById("inp-artist").value = "";
        document.getElementById("inp-title").value = "";
        document.getElementById("inp-year").value = "";
        setTimeout(() => document.getElementById("inp-artist").focus(), 100);
    },

    // ── Lock In Answers ─────────────────────────────────────────────────────────
    lockInAnswers() {
        const team = Game.state.teams[Game.state.currentTeamIndex];
        Game.state.roundAnswers[team] = {
            artist: document.getElementById("inp-artist").value,
            title: document.getElementById("inp-title").value,
            year: document.getElementById("inp-year").value
        };

        if (Game.state.currentTeamIndex < Game.state.teams.length - 1) {
            // More teams to answer
            document.getElementById("next-team-name").textContent = Game.state.teams[Game.state.currentTeamIndex + 1];
            Game.showScreen("wait");
        } else {
            // All teams have answered — reveal
            Game.calculateReveal();
        }
    },

    // ── Next Team (from wait screen) ────────────────────────────────────────────
    nextTeam() {
        Game.state.currentTeamIndex++;
        Game.showScreen("answer");
        Game.prepareAnswerScreen();
    },

    // ── Calculate & Show Reveal ─────────────────────────────────────────────────
    calculateReveal() {
        const track = Game.state.currentTrack;
        const resultsContainer = document.getElementById("team-results-container");
        resultsContainer.innerHTML = "";

        const roundStats = { question: Game.state.currentQuestion, teams: [] };
        let survivalPassed = true;

        Game.state.teams.forEach(team => {
            const guesses = Game.state.roundAnswers[team] || { artist: "", title: "", year: "" };
            const score = Scoring.calculateRoundScore(track, guesses);
            Game.state.scores[team] += score.total;

            roundStats.teams.push({ name: team, score: score.total });

            // Survival check: must get at least partial credit on artist OR title
            if (Game.state.mode === "survival") {
                if (score.artist.points === 0 && score.title.points === 0) {
                    survivalPassed = false;
                }
            }

            // Build result card with partial-match reasons
            const card = document.createElement("div");
            card.className = "team-result-card";
            card.innerHTML = `
                <h4 class="cyan">${team}</h4>
                ${Game._scoreRow("Artist", guesses.artist, score.artist)}
                ${Game._scoreRow("Title", guesses.title, score.title)}
                ${Game._scoreRow("Year", guesses.year, score.year)}
                <div class="score-row score-total-row">
                    <span>Round Total</span>
                    <span class="round-total ${score.total >= 6 ? 'text-green' : score.total > 0 ? 'text-amber' : 'text-red'}">${score.total} pts</span>
                </div>
            `;
            resultsContainer.appendChild(card);
        });

        Game.state.roundScores.push(roundStats);

        // Track Info
        document.getElementById("reveal-art").src = track.albumArt;
        document.getElementById("reveal-title").textContent = track.title;
        document.getElementById("reveal-artist").textContent = track.artist;
        document.getElementById("reveal-year").textContent = track.year;

        // Survival mode: update lives and show result
        const survivalResultEl = document.getElementById("survival-result");
        if (Game.state.mode === "survival") {
            survivalResultEl.style.display = "block";
            if (!survivalPassed) {
                Game.state.lives--;
            }
            Game._renderSurvivalResult(survivalPassed);
            Game._renderLives("survival-lives-reveal");
        } else {
            survivalResultEl.style.display = "none";
        }

        // Running Score
        Game._renderScoreList("running-score-list");

        // Update next button text
        const nextBtn = document.getElementById("btn-next-question");
        if (Game.state.mode === "survival" && Game.state.lives <= 0) {
            nextBtn.textContent = "Game Over";
        } else {
            nextBtn.textContent = "Next Question";
        }

        Game.showScreen("reveal");
    },

    // ── Helper: Build a score row with reason tooltip ────────────────────────────
    _scoreRow(label, guess, result) {
        const reasonHtml = result.reason
            ? `<span class="score-reason">(${result.reason})</span>`
            : "";
        return `
            <div class="score-row">
                <span>${label}: ${Game._escapeHtml(guess || "—")} ${reasonHtml}</span>
                <span><span class="score-dot ${result.status}"></span>${result.points} pts</span>
            </div>
        `;
    },

    // ── Helper: Escape HTML to prevent XSS from user input ───────────────────────
    _escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    },

    // ── Helper: Render a sorted score list into a <ul> ───────────────────────────
    _renderScoreList(elementId) {
        const list = document.getElementById(elementId);
        list.innerHTML = "";
        const sortedTeams = [...Game.state.teams].sort((a, b) => Game.state.scores[b] - Game.state.scores[a]);
        sortedTeams.forEach((t, i) => {
            const li = document.createElement("li");
            if (i === 0) li.classList.add("leader");
            li.innerHTML = `<span>${i + 1}. ${Game._escapeHtml(t)}</span><span>${Game.state.scores[t]} pts</span>`;
            list.appendChild(li);
        });
    },

    // ── Next Question (Scoreboard) ──────────────────────────────────────────────
    nextQuestion() {
        // Multiplayer: go straight to next question or final
        if (Game.state.multiplayer.active) {
            if (Game.state.currentQuestion >= Game.state.totalQuestions) {
                Multiplayer.updateStatus(Game.state.multiplayer.roomCode, "final");
                Multiplayer.setExpiresAt(Game.state.multiplayer.roomCode);
                Game.showScreen("final");
                Game.showFinalResults();
            } else {
                Game.showScreen("play");
                Game._mpPreparePlayScreen();
            }
            return;
        }

        if (Game.state.mode === "survival") {
            if (Game.state.lives <= 0) {
                Game.showScreen("final");
                Game.showFinalResults();
            } else {
                Game.showScreen("play");
                Game.preparePlayScreen();
            }
            return;
        }

        if (Game.state.mode === "solo") {
            // Solo: skip intermediate scoreboard
            if (Game.state.currentQuestion >= Game.state.totalQuestions) {
                Game.showScreen("final");
                Game.showFinalResults();
            } else {
                Game.showScreen("play");
                Game.preparePlayScreen();
            }
            return;
        }

        Game.showScreen("scoreboard");
        Game._renderScoreList("scoreboard-list");

        const btn = document.getElementById("btn-continue-game");
        btn.textContent = Game.state.currentQuestion >= Game.state.totalQuestions ? "Final Results" : "Next Question";
    },

    // ── Final Results ───────────────────────────────────────────────────────────
    showFinalResults() {
        Game._renderScoreList("final-scoreboard-list");

        // Fun Stats
        const statsDiv = document.getElementById("fun-stats-content");
        const totalRounds = Game.state.roundScores.length;
        const maxPossible = totalRounds * 8; // 8 pts max per round
        const allScores = Object.values(Game.state.scores);
        const highestScore = Math.max(...allScores);
        const winner = Game.state.teams.find(t => Game.state.scores[t] === highestScore);

        if (Game.state.mode === "survival") {
            const playerName = Game.state.teams[0];
            const score = Game.state.scores[playerName] || 0;
            statsDiv.innerHTML = `
                <p>Rounds survived: ${totalRounds}</p>
                <p>Total score: ${score} pts</p>
                <p>Tracks heard: ${Game.state.usedTracks.size}</p>
                ${Game.state.skippedCount > 0 ? `<p>Tracks skipped: ${Game.state.skippedCount}</p>` : ""}
            `;
            if (totalRounds > 0) {
                Leaderboard.saveEntry({
                    name: playerName,
                    score: score,
                    rounds: totalRounds,
                    date: new Date().toISOString()
                }, Leaderboard.SURVIVAL_KEY);
                const saved = document.createElement("p");
                saved.className = "cyan";
                saved.textContent = "Score saved to survival leaderboard!";
                statsDiv.appendChild(saved);
            }
        } else {
            statsDiv.innerHTML = `
                <p>Rounds played: ${totalRounds}</p>
                <p>Tracks heard: ${Game.state.usedTracks.size}</p>
                <p>Max possible score: ${maxPossible}</p>
                ${Game.state.skippedCount > 0 ? `<p>Tracks skipped: ${Game.state.skippedCount}</p>` : ""}
                ${Game.state.teams.length > 1 ? `<p>Winner: ${Game._escapeHtml(winner)} with ${highestScore} pts!</p>` : ""}
            `;

            // Save to leaderboard in solo mode
            if (Game.state.mode === "solo" && totalRounds > 0) {
                const playerName = Game.state.teams[0];
                const score = Game.state.scores[playerName] || 0;
                const pct = maxPossible > 0 ? Math.round((score / maxPossible) * 1000) / 10 : 0;
                Leaderboard.saveEntry({
                    name: playerName,
                    score: score,
                    maxPossible: maxPossible,
                    date: new Date().toISOString(),
                    percentage: pct
                });
                const saved = document.createElement("p");
                saved.className = "cyan";
                saved.textContent = "Score saved to leaderboard!";
                statsDiv.appendChild(saved);
            }
        }
    },

    // ── Survival Helpers ──────────────────────────────────────────────────────
    _renderLives(containerId) {
        const container = document.getElementById(containerId);
        let html = "";
        for (let i = 0; i < Game.state.maxLives; i++) {
            const cls = i < Game.state.lives ? "active" : "lost";
            html += `<span class="life-heart ${cls}">&#9829;</span>`;
        }
        container.innerHTML = html;
    },

    _renderSurvivalResult(survived) {
        const container = document.getElementById("survival-result");
        const textEl = document.getElementById("survival-result-text");
        container.className = "survival-result";

        if (Game.state.lives <= 0) {
            container.classList.add("game-over");
            textEl.textContent = "GAME OVER";
        } else if (!survived) {
            container.classList.add("life-lost");
            textEl.textContent = `Life lost! ${Game.state.lives} ${Game.state.lives === 1 ? "life" : "lives"} remaining`;
        } else {
            container.classList.add("survived");
            textEl.textContent = "You survived!";
        }
    },

    _bindLeaderboardTabs() {
        document.querySelectorAll(".leaderboard-tab-btn").forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener("click", (e) => {
                document.querySelectorAll(".leaderboard-tab-btn").forEach(b => b.classList.remove("active"));
                e.target.classList.add("active");
                const tab = e.target.dataset.lb;
                const key = tab === "survival" ? Leaderboard.SURVIVAL_KEY : Leaderboard.STORAGE_KEY;
                Leaderboard.render("leaderboard-content", key);
            });
        });
    },
};

// ── Playlist Export Wrappers (called from HTML onclick) ──────────────────────
function exportSpotify() {
    const tracks = Game.state.tracks.filter(t => Game.state.usedTracks.has(t.title + "|" + t.artist));
    const winner = Game._getWinner();
    Playlist.exportToSpotify(tracks, `Chart Wars — ${winner}`);
}

function exportApple() {
    const tracks = Game.state.tracks.filter(t => Game.state.usedTracks.has(t.title + "|" + t.artist));
    Playlist.exportToAppleMusic(tracks);
}

function exportYoutube() {
    const tracks = Game.state.tracks.filter(t => Game.state.usedTracks.has(t.title + "|" + t.artist));
    Playlist.exportToYouTube(tracks);
}

function copyTrackList() {
    const tracks = Game.state.tracks.filter(t => Game.state.usedTracks.has(t.title + "|" + t.artist));
    Playlist.copyTrackList(tracks, "spotify");
}

// Helper for playlist naming
Game._getWinner = function () {
    const allScores = Object.entries(Game.state.scores);
    if (allScores.length === 0) return "Game";
    allScores.sort((a, b) => b[1] - a[1]);
    return allScores[0][0];
};

// ── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", Game.init);
