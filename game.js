// ─── Chart Wars — Game Logic & State Management ─────────────────────────────
// Controls screen flow, audio playback, answer collection, and scoring integration.

const DIFFICULTY_INFO = {
    1: { name: "Party", subtitle: "#1 Hits Only", desc: "Only songs that hit #1 on the Billboard Hot 100. The biggest songs ever." },
    2: { name: "Easy", subtitle: "Top 10 Hits", desc: "All songs that reached the Billboard Top 10. You've definitely heard these." },
    3: { name: "Medium", subtitle: "Top 20 Hits", desc: "Songs that reached the Top 20. Popular but not always household names." },
    4: { name: "Hard", subtitle: "Top 40 Hits", desc: "The full Top 40. Includes some deep cuts from the charts." },
    5: { name: "Nerd", subtitle: "Positions 21\u201340 Only", desc: "Only songs that peaked between #21 and #40. No easy ones here." }
};

const Game = {
    state: {
        screen: "title",
        teams: [],
        tracks: [],
        usedTracks: new Set(),
        currentTrack: null,
        currentQuestion: 0,
        totalQuestions: 10,
        difficulty: 2,
        currentTeamIndex: 0,
        roundAnswers: {},   // { teamName: {artist, title, year} }
        scores: {},         // { teamName: totalScore }
        roundScores: [],    // History for stats
        audio: new Audio(),
        mode: "teams",      // "teams" or "solo"
        skippedCount: 0,
        isPlaying: false,
        replayUsed: false,
        clipInterval: null  // Track the progress interval so we can clear it
    },

    // ── Initialise ──────────────────────────────────────────────────────────────
    init() {
        Game.bindEvents();
        Game.loadTracks();
        Game.initDifficultyTooltips();
    },

    // ── Difficulty Tooltips ───────────────────────────────────────────────────
    initDifficultyTooltips() {
        document.querySelectorAll(".diff-btn").forEach(btn => {
            const tier = parseInt(btn.dataset.tier);
            const info = DIFFICULTY_INFO[tier];
            if (!info) return;

            const wrapper = document.createElement("div");
            wrapper.className = "diff-btn-wrapper";
            btn.parentNode.insertBefore(wrapper, btn);
            wrapper.appendChild(btn);

            const tooltip = document.createElement("div");
            tooltip.className = "diff-tooltip";
            tooltip.innerHTML = `
                <strong>${info.name}</strong>
                <span class="diff-tooltip-subtitle">${info.subtitle}</span>
                <span class="diff-tooltip-desc">${info.desc}</span>
            `;
            wrapper.appendChild(tooltip);
            btn.removeAttribute("title");

            // Mobile tap support
            btn.addEventListener("touchstart", (e) => {
                e.preventDefault();
                document.querySelectorAll(".diff-tooltip").forEach(t => t.classList.remove("visible"));
                tooltip.classList.toggle("visible");
                // Also trigger the selection
                document.querySelectorAll(".diff-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                Game.state.difficulty = tier;
            });
        });

        document.addEventListener("touchstart", (e) => {
            if (!e.target.closest(".diff-btn-wrapper")) {
                document.querySelectorAll(".diff-tooltip").forEach(t => t.classList.remove("visible"));
            }
        });
    },

    // ── Event Binding ───────────────────────────────────────────────────────────
    bindEvents() {
        // Title Screen
        document.getElementById("btn-new-game").addEventListener("click", () => Game.showScreen("setup"));

        // Leaderboard
        document.getElementById("btn-leaderboard").addEventListener("click", () => {
            Leaderboard.render("leaderboard-content");
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

        document.querySelectorAll(".diff-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                document.querySelectorAll(".diff-btn").forEach(b => b.classList.remove("active"));
                e.target.classList.add("active");
                Game.state.difficulty = parseInt(e.target.dataset.tier);
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
    },

    // ── Load Tracks ─────────────────────────────────────────────────────────────
    async loadTracks() {
        try {
            const res = await fetch("data/tracks.json");
            const allTracks = await res.json();
            Game.state.tracks = allTracks.filter(t => t.previewUrl);
            const skipped = allTracks.length - Game.state.tracks.length;
            console.log(`📀 Loaded ${Game.state.tracks.length} tracks${skipped ? ` (${skipped} skipped — no preview)` : ""}`);
        } catch (e) {
            console.error("Failed to load tracks", e);
            alert("Error loading tracks.json. Make sure you're running a local server (e.g. npx serve).");
        }
    },

    // ── Screen Management ───────────────────────────────────────────────────────
    showScreen(screenId) {
        document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
        document.getElementById(`screen-${screenId}`).classList.add("active");
        Game.state.screen = screenId;
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

        if (Game.state.mode === "solo") {
            container.innerHTML = '<input type="text" class="neon-input" placeholder="Your Name" value="">';
            addBtn.style.display = "none";
            label.textContent = "Your Name";
        } else {
            container.innerHTML = `
                <input type="text" class="neon-input" placeholder="Team 1" value="Team 1">
                <input type="text" class="neon-input" placeholder="Team 2" value="Team 2">
            `;
            addBtn.style.display = "";
            label.textContent = "Players / Teams";
        }
    },

    // ── Game Start ──────────────────────────────────────────────────────────────
    startGame() {
        const inputs = document.querySelectorAll("#player-inputs input");
        Game.state.teams = Array.from(inputs).map(i => i.value.trim()).filter(v => v);

        if (Game.state.teams.length === 0) {
            if (Game.state.mode === "solo") {
                Game.state.teams = ["Player"];
            } else {
                alert("Add at least one player or team!");
                return;
            }
        }

        // Reset all game state
        Game.state.scores = {};
        Game.state.teams.forEach(t => Game.state.scores[t] = 0);
        Game.state.usedTracks.clear();
        Game.state.currentQuestion = 0;
        Game.state.roundScores = [];
        Game.state.roundAnswers = {};
        Game.state.skippedCount = 0;

        Game.showScreen("play");
        Game.preparePlayScreen();
    },

    // ── Reset Game (for Play Again) ─────────────────────────────────────────────
    resetGame() {
        Game.state.teams = [];
        Game.state.scores = {};
        Game.state.usedTracks.clear();
        Game.state.currentQuestion = 0;
        Game.state.totalQuestions = 10;
        Game.state.difficulty = 2;
        Game.state.currentTeamIndex = 0;
        Game.state.roundAnswers = {};
        Game.state.roundScores = [];
        Game.state.replayUsed = false;
        Game.state.mode = "teams";
        Game.state.skippedCount = 0;
        Game.state.audio.pause();
        Game.state.audio.currentTime = 0;
        if (Game.state.clipInterval) {
            clearInterval(Game.state.clipInterval);
            Game.state.clipInterval = null;
        }
    },

    // ── Track Filtering by Difficulty ────────────────────────────────────────────
    filterTracks() {
        const tier = Game.state.difficulty;
        return Game.state.tracks.filter(t => {
            if (Game.state.usedTracks.has(t.title + "|" + t.artist)) return false;
            if (tier === 1) return t.peakPosition === 1;
            if (tier === 2) return t.peakPosition <= 10;
            if (tier === 3) return t.peakPosition <= 20;
            if (tier === 4) return t.peakPosition <= 40;
            if (tier === 5) return t.peakPosition > 20 && t.peakPosition <= 40;
            return false;
        });
    },

    // ── Prepare Play Screen ─────────────────────────────────────────────────────
    preparePlayScreen() {
        // Clear stale round answers for this new question
        Game.state.roundAnswers = {};

        const available = Game.filterTracks();
        if (available.length === 0) {
            alert("No more tracks available for this difficulty! Ending game early.");
            Game.state.totalQuestions = Game.state.currentQuestion;
            Game.showScreen("final");
            Game.showFinalResults();
            return;
        }

        Game.state.currentTrack = available[Math.floor(Math.random() * available.length)];
        Game.state.usedTracks.add(Game.state.currentTrack.title + "|" + Game.state.currentTrack.artist);
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
        replayBtn.textContent = Game.state.mode === "solo" ? "Replay Clip (-1 pt)" : "Replay Clip (-1 pt all teams)";

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
        Game.state.audio.play().catch(() => {
            error.style.display = "block";
            btn.classList.remove("playing");
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
                controls.style.display = "block";
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

        if (Game.state.mode === "solo") {
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

        Game.state.teams.forEach(team => {
            const guesses = Game.state.roundAnswers[team] || { artist: "", title: "", year: "" };
            const score = Scoring.calculateRoundScore(track, guesses);
            Game.state.scores[team] += score.total;

            roundStats.teams.push({ name: team, score: score.total });

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
        document.getElementById("reveal-peak").textContent = `Peak: #${track.peakPosition}`;
        document.getElementById("reveal-fact").textContent = track.funFact || "";

        // Running Score
        Game._renderScoreList("running-score-list");

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
                difficulty: Game.state.difficulty,
                date: new Date().toISOString(),
                percentage: pct
            });
            const saved = document.createElement("p");
            saved.className = "cyan";
            saved.textContent = "Score saved to leaderboard!";
            statsDiv.appendChild(saved);
        }
    }
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
