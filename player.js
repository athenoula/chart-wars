// ─── Chart Wars — Player (Phone) Logic ───────────────────────────────────────
// Handles the phone-side experience: join room, answer questions, view results.

const Player = {
    roomCode: null,
    playerId: null,
    playerName: null,
    mode: "same-room",
    currentQuestion: 0,
    totalQuestions: 10,
    timerInterval: null,
    audio: new Audio(),
    clipInterval: null,
    locked: false,
    _myResult: null,         // last scored result for this player
    _activeContestId: null,  // contest currently in flight

    // ── Initialise ───────────────────────────────────────────────────────────
    init() {
        if (!Multiplayer.init()) {
            document.getElementById("join-error").textContent = "Multiplayer unavailable. Check connection.";
            document.getElementById("join-error").style.display = "block";
            return;
        }

        Player._bindEvents();

        // Check URL params for room code and name
        const params = new URLSearchParams(window.location.search);
        const room = params.get("room");
        const name = params.get("name");

        if (room) {
            document.getElementById("inp-room-code").value = room.toUpperCase();
        }
        if (name) {
            document.getElementById("inp-player-name").value = name;
        }

        // Auto-join if both provided
        if (room && name) {
            Player._join();
        }
    },

    // ── Event Binding ────────────────────────────────────────────────────────
    _bindEvents() {
        document.getElementById("btn-join").addEventListener("click", Player._join);
        document.getElementById("btn-lock-in").addEventListener("click", Player._lockIn);
        document.getElementById("btn-play-again").addEventListener("click", () => {
            window.location.href = window.location.pathname;
        });

        // Contest buttons
        document.getElementById("btn-player-contest").addEventListener("click", () => {
            document.getElementById("player-contest-form").style.display = "block";
            document.getElementById("btn-player-contest").style.display = "none";
            setTimeout(() => document.getElementById("player-contest-reason").focus(), 100);
        });
        document.getElementById("btn-player-contest-cancel").addEventListener("click", () => {
            document.getElementById("player-contest-form").style.display = "none";
            document.getElementById("btn-player-contest").style.display = "block";
        });
        document.getElementById("btn-player-contest-submit").addEventListener("click", Player._submitContest);

        // Remote audio play button
        const remotePlayBtn = document.getElementById("btn-play-remote");
        if (remotePlayBtn) {
            remotePlayBtn.addEventListener("click", Player._playRemoteClip);
        }

        // Enter key on inputs
        document.getElementById("inp-room-code").addEventListener("keydown", (e) => {
            if (e.key === "Enter") document.getElementById("inp-player-name").focus();
        });
        document.getElementById("inp-player-name").addEventListener("keydown", (e) => {
            if (e.key === "Enter") Player._join();
        });
        document.getElementById("inp-year").addEventListener("keydown", (e) => {
            if (e.key === "Enter") Player._lockIn();
        });
    },

    // ── Screen Management ────────────────────────────────────────────────────
    _showScreen(screenId) {
        document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
        document.getElementById(`screen-${screenId}`).classList.add("active");
        window.scrollTo(0, 0);
    },

    // ── Join Room ────────────────────────────────────────────────────────────
    async _join() {
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

        const result = await Multiplayer.joinRoom(code, name);
        if (result.error) {
            errorEl.textContent = result.error;
            errorEl.style.display = "block";
            return;
        }

        Player.roomCode = code;
        Player.playerId = result.playerId;
        Player.playerName = name;

        // Start listening to room state
        Player._listenToRoom();
        Player._showScreen("lobby");
    },

    // ── Listen to Room State Changes ─────────────────────────────────────────
    _listenToRoom() {
        Multiplayer.listenToRoom(Player.roomCode, {
            onStatus: Player._onStatusChange,
            onPlayers: Player._onPlayersChange,
            onTrack: Player._onTrackChange,
            onTimer: Player._onTimerChange,
            onQuestion: (q) => {
                if (q !== null) Player.currentQuestion = q;
            },
            onTotalQuestions: (t) => {
                if (t !== null) Player.totalQuestions = t;
            },
            onHostConnection: (connected) => {
                if (connected === false) {
                    Player._showScreen("disconnected");
                }
            },
            onMode: (mode) => {
                if (mode) Player.mode = mode;
            }
        });
    },

    // ── Status Change Handler ────────────────────────────────────────────────
    _onStatusChange(status) {
        if (!status) return;

        switch (status) {
            case "lobby":
                Player._showScreen("lobby");
                break;
            case "playing":
                Player.locked = false;
                Player._showListening();
                break;
            case "answering":
                if (!Player.locked) {
                    Player._showAnswer();
                }
                break;
            case "reveal":
                Player._showReveal();
                break;
            case "final":
                Player._showFinal();
                break;
        }
    },

    // ── Players Change Handler ───────────────────────────────────────────────
    _onPlayersChange(players) {
        const list = document.getElementById("lobby-player-list");
        const countEl = document.getElementById("lobby-player-count");
        const entries = Object.entries(players || {});

        countEl.textContent = entries.length;
        list.innerHTML = "";
        entries.forEach(([pid, p]) => {
            const li = document.createElement("li");
            const isMe = pid === Player.playerId;
            li.innerHTML = `
                <span class="player-status-dot ${p.connected ? 'connected' : 'disconnected'}"></span>
                ${Player._escapeHtml(p.name)}${isMe ? ' <span class="cyan">(you)</span>' : ''}
            `;
            list.appendChild(li);
        });
    },

    // ── Track Change Handler ─────────────────────────────────────────────────
    _onTrackChange(track) {
        if (!track) return;
        // Store for remote audio playback
        Player._currentTrack = track;
    },

    // ── Timer Change Handler ─────────────────────────────────────────────────
    _onTimerChange(timerEnd) {
        if (!timerEnd) return;
        Player._startCountdown(timerEnd);
    },

    // ── Show Listening Screen ────────────────────────────────────────────────
    _showListening() {
        document.getElementById("current-q-num").textContent = Player.currentQuestion;
        document.getElementById("total-q-num").textContent = Player.totalQuestions;

        const remoteContainer = document.getElementById("remote-play-container");
        if (Player.mode === "remote" && Player._currentTrack && Player._currentTrack.previewUrl) {
            remoteContainer.style.display = "block";
            document.querySelector("#screen-listening .subtext").textContent = "Play the clip on your phone:";
        } else {
            remoteContainer.style.display = "none";
            document.querySelector("#screen-listening .subtext").textContent = "Listen to the clip on the host's speakers...";
        }

        Player._showScreen("listening");
    },

    // ── Play Remote Audio Clip ───────────────────────────────────────────────
    _playRemoteClip() {
        if (!Player._currentTrack || !Player._currentTrack.previewUrl) return;

        const btn = document.getElementById("btn-play-remote");
        const progress = document.getElementById("remote-progress");

        btn.classList.add("playing");
        progress.innerHTML = '<div class="progress-fill" style="width:0%"></div>';
        const fill = progress.querySelector(".progress-fill");

        Player.audio.src = Player._currentTrack.previewUrl;
        Player.audio.play().catch(() => {});

        const startTime = Date.now();
        const duration = 20000;

        if (Player.clipInterval) clearInterval(Player.clipInterval);
        Player.clipInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const pct = Math.min(100, (elapsed / duration) * 100);
            if (fill) fill.style.width = `${pct}%`;

            if (elapsed >= duration) {
                clearInterval(Player.clipInterval);
                Player.clipInterval = null;
                Player.audio.pause();
                Player.audio.currentTime = 0;
                btn.classList.remove("playing");
            }
        }, 100);
    },

    // ── Show Answer Screen ───────────────────────────────────────────────────
    _showAnswer() {
        document.getElementById("answer-q-num").textContent = Player.currentQuestion;
        document.getElementById("answer-q-total").textContent = Player.totalQuestions;

        // Clear inputs
        document.getElementById("inp-artist").value = "";
        document.getElementById("inp-title").value = "";
        document.getElementById("inp-year").value = "";

        // Stop any remote audio
        Player.audio.pause();
        Player.audio.currentTime = 0;
        if (Player.clipInterval) {
            clearInterval(Player.clipInterval);
            Player.clipInterval = null;
        }

        Player._showScreen("answer");
        setTimeout(() => document.getElementById("inp-artist").focus(), 100);
    },

    // ── Start Answer Countdown ───────────────────────────────────────────────
    _startCountdown(timerEnd) {
        const timerEl = document.getElementById("answer-timer");
        if (Player.timerInterval) clearInterval(Player.timerInterval);

        Player.timerInterval = setInterval(() => {
            const remaining = Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000));
            timerEl.textContent = `${remaining}s`;

            if (remaining <= 10) {
                timerEl.classList.add("timer-urgent");
            } else {
                timerEl.classList.remove("timer-urgent");
            }

            if (remaining <= 0) {
                clearInterval(Player.timerInterval);
                Player.timerInterval = null;
                timerEl.textContent = "Time's up!";
                // Auto-lock if not already locked
                if (!Player.locked) {
                    Player._lockIn();
                }
            }
        }, 250);
    },

    // ── Lock In Answer ───────────────────────────────────────────────────────
    async _lockIn() {
        if (Player.locked) return;
        Player.locked = true;

        const answer = {
            artist: document.getElementById("inp-artist").value,
            title: document.getElementById("inp-title").value,
            year: document.getElementById("inp-year").value
        };

        await Multiplayer.submitAnswer(
            Player.roomCode,
            Player.currentQuestion,
            Player.playerId,
            answer
        );

        // Haptic feedback
        if (navigator.vibrate) navigator.vibrate(50);

        Player._showScreen("waiting");
    },

    // ── Show Reveal Screen ───────────────────────────────────────────────────
    _showReveal() {
        if (Player.timerInterval) {
            clearInterval(Player.timerInterval);
            Player.timerInterval = null;
        }

        // Reset contest UI for this new reveal
        Player._activeContestId = null;
        const contestSection = document.getElementById("player-contest-section");
        const contestForm = document.getElementById("player-contest-form");
        const contestBtn = document.getElementById("btn-player-contest");
        const contestStatus = document.getElementById("player-contest-status");
        contestSection.style.display = "none";
        contestForm.style.display = "none";
        contestBtn.style.display = "block";
        contestBtn.disabled = false;
        contestBtn.textContent = "Contest my score";
        contestStatus.style.display = "none";
        contestStatus.className = "player-contest-status";
        if (contestSection) document.getElementById("player-contest-reason").value = "";

        // Listen for results of this question
        Multiplayer.listenToResults(Player.roomCode, Player.currentQuestion, (results) => {
            if (!results) return;

            // Show correct answer
            if (results.correctAnswer) {
                document.getElementById("reveal-title").textContent = results.correctAnswer.title;
                document.getElementById("reveal-artist").textContent = results.correctAnswer.artist;
                document.getElementById("reveal-year").textContent = results.correctAnswer.year;
            }

            // Show player's result
            const myResult = results[Player.playerId];
            if (myResult) {
                Player._myResult = myResult;
                const resultDiv = document.getElementById("player-result");
                resultDiv.innerHTML = `
                    <h4 class="cyan">Your Score</h4>
                    ${Player._scoreRow("Artist", myResult.artist)}
                    ${Player._scoreRow("Title", myResult.title)}
                    ${Player._scoreRow("Year", myResult.year)}
                    <div class="score-row score-total-row">
                        <span>Round Total</span>
                        <span class="round-total ${myResult.total >= 6 ? 'text-green' : myResult.total > 0 ? 'text-amber' : 'text-red'}">${myResult.total} pts</span>
                    </div>
                `;
                // Show contest button in remote mode (if not already contested)
                if (Player.mode === "remote" && !Player._activeContestId) {
                    contestSection.style.display = "block";
                }
            }
        });

        // Listen for standings
        Multiplayer.listenToStandings(Player.roomCode, (standings) => {
            if (!standings) return;
            const list = document.getElementById("standings-list");
            list.innerHTML = "";
            const sorted = Object.entries(standings).sort((a, b) => b[1].score - a[1].score);
            sorted.forEach(([pid, data], i) => {
                const li = document.createElement("li");
                const isMe = pid === Player.playerId;
                if (i === 0) li.classList.add("leader");
                li.innerHTML = `
                    <span>${i + 1}. ${Player._escapeHtml(data.name)}${isMe ? ' (you)' : ''}</span>
                    <span>${data.score} pts</span>
                `;
                list.appendChild(li);
            });
        });

        Player._showScreen("reveal");
    },

    // ── Show Final Screen ────────────────────────────────────────────────────
    _showFinal() {
        Multiplayer.listenToStandings(Player.roomCode, (standings) => {
            if (!standings) return;
            const list = document.getElementById("final-standings-list");
            list.innerHTML = "";
            const sorted = Object.entries(standings).sort((a, b) => b[1].score - a[1].score);
            sorted.forEach(([pid, data], i) => {
                const li = document.createElement("li");
                const isMe = pid === Player.playerId;
                if (i === 0) li.classList.add("leader");
                li.innerHTML = `
                    <span>${i + 1}. ${Player._escapeHtml(data.name)}${isMe ? ' (you)' : ''}</span>
                    <span>${data.score} pts</span>
                `;
                list.appendChild(li);
            });
        });

        Player._showScreen("final");
    },

    // ── Contest Submission (Remote Mode) ─────────────────────────────────────
    async _submitContest() {
        const reason = document.getElementById("player-contest-reason").value.trim();
        if (!reason) return;

        const track = Player._currentTrack || {};
        const myResult = Player._myResult || {};
        const answer = {
            artist: myResult.artist ? String(myResult.artist.points ?? "") : "",
            title: myResult.title ? String(myResult.title.points ?? "") : "",
            year: myResult.year ? String(myResult.year.points ?? "") : ""
        };

        const contestId = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        Player._activeContestId = contestId;

        const contest = {
            id: contestId,
            mode: "remote",
            roomCode: Player.roomCode,
            questionNum: Player.currentQuestion,
            track: { title: track.title || "", artist: track.artist || "", year: track.year || "" },
            teamName: Player.playerName,
            theirAnswer: answer,
            reason,
            status: "pending",
            pointsAwarded: 0,
            playerId: Player.playerId
        };

        // Submit to Firebase
        await Multiplayer.writeRoomContest(Player.roomCode, contest);
        if (Multiplayer.isAvailable()) await Multiplayer.writeContestLog(contest);

        // Update UI to "awaiting" state
        document.getElementById("player-contest-form").style.display = "none";
        document.getElementById("btn-player-contest").style.display = "none";
        const status = document.getElementById("player-contest-status");
        status.textContent = "Contest submitted — awaiting GM review...";
        status.className = "player-contest-status contest-status-awaiting";
        status.style.display = "block";

        // Listen for resolution
        Multiplayer.listenToContestStatus(Player.roomCode, contestId, (newStatus) => {
            if (newStatus === "approved") {
                status.textContent = "Contest approved — points awarded!";
                status.className = "player-contest-status contest-status-approved";
            } else if (newStatus === "dismissed") {
                status.textContent = "Contest dismissed.";
                status.className = "player-contest-status contest-status-dismissed";
            }
        });
    },

    // ── Helper: Score Row ────────────────────────────────────────────────────
    _scoreRow(label, result) {
        if (!result) return "";
        const reasonHtml = result.reason
            ? `<span class="score-reason">(${result.reason})</span>`
            : "";
        return `
            <div class="score-row">
                <span>${label} ${reasonHtml}</span>
                <span><span class="score-dot ${result.status}"></span>${result.points} pts</span>
            </div>
        `;
    },

    // ── Helper: Escape HTML ──────────────────────────────────────────────────
    _escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }
};

// ── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", Player.init);
