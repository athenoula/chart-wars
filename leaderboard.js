// ─── Chart Wars — Leaderboard Module ──────────────────────────────────────────
// Persists solo and survival mode high scores in localStorage.

const Leaderboard = {
    STORAGE_KEY: "chartWarsLeaderboard",
    SURVIVAL_KEY: "chartWarsSurvivalLeaderboard",
    MAX_ENTRIES: 10,

    // ── Load from localStorage ────────────────────────────────────────────────
    getEntries(storageKey) {
        const key = storageKey || Leaderboard.STORAGE_KEY;
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.error("Failed to load leaderboard", e);
            return [];
        }
    },

    // ── Save a new entry ──────────────────────────────────────────────────────
    saveEntry(entry, storageKey) {
        const key = storageKey || Leaderboard.STORAGE_KEY;
        const entries = Leaderboard.getEntries(key);
        entries.push(entry);

        if (key === Leaderboard.SURVIVAL_KEY) {
            // Survival: sort by score descending
            entries.sort((a, b) => b.score - a.score);
        } else {
            // Solo: sort by percentage descending, then by raw score descending
            entries.sort((a, b) => {
                if (b.percentage !== a.percentage) return b.percentage - a.percentage;
                return b.score - a.score;
            });
        }

        const trimmed = entries.slice(0, Leaderboard.MAX_ENTRIES);
        localStorage.setItem(key, JSON.stringify(trimmed));
        return trimmed;
    },

    // ── Render leaderboard into a container element ───────────────────────────
    render(containerId, storageKey) {
        const key = storageKey || Leaderboard.STORAGE_KEY;
        const container = document.getElementById(containerId);
        const entries = Leaderboard.getEntries(key);
        const isSurvival = (key === Leaderboard.SURVIVAL_KEY);

        if (entries.length === 0) {
            const modeText = isSurvival ? "survival" : "solo";
            container.innerHTML = `<p class="subtext">No scores yet. Play a ${modeText} game to get on the board!</p>`;
            return;
        }

        let html = '<ul class="scoreboard-list">';
        entries.forEach((entry, i) => {
            const dateStr = new Date(entry.date).toLocaleDateString("en-GB", {
                day: "numeric", month: "short", year: "numeric"
            });
            const scoreDisplay = isSurvival
                ? `${entry.score} pts (${entry.rounds} rounds)`
                : `${entry.score}/${entry.maxPossible} (${entry.percentage}%)`;
            html += `
                <li ${i === 0 ? 'class="leader"' : ''}>
                    <span>${i + 1}. ${Leaderboard._escapeHtml(entry.name)}</span>
                    <span>
                        ${scoreDisplay}
                        <span class="leaderboard-meta">${dateStr}</span>
                    </span>
                </li>
            `;
        });
        html += '</ul>';
        container.innerHTML = html;
    },

    // ── Render from a pre-fetched entries array (e.g. Firebase) ──────────────
    renderFromEntries(containerId, entries, isSurvival = true) {
        const container = document.getElementById(containerId);
        if (!entries || entries.length === 0) {
            const modeText = isSurvival ? "survival" : "solo";
            container.innerHTML = `<p class="subtext">No scores yet. Play a ${modeText} game to get on the board!</p>`;
            return;
        }
        let html = '<ul class="scoreboard-list">';
        entries.forEach((entry, i) => {
            const dateStr = new Date(entry.date).toLocaleDateString("en-GB", {
                day: "numeric", month: "short", year: "numeric"
            });
            const scoreDisplay = isSurvival
                ? `${entry.score} pts (${entry.rounds} rounds)`
                : `${entry.score}/${entry.maxPossible} (${entry.percentage}%)`;
            html += `
                <li ${i === 0 ? 'class="leader"' : ''}>
                    <span>${Leaderboard._escapeHtml(entry.name)}</span>
                    <span>
                        ${scoreDisplay}
                        <span class="leaderboard-meta">${dateStr}</span>
                    </span>
                </li>
            `;
        });
        html += '</ul>';
        container.innerHTML = html;
    },

    // ── Clear leaderboard ─────────────────────────────────────────────────────
    clear(storageKey) {
        const key = storageKey || Leaderboard.STORAGE_KEY;
        localStorage.removeItem(key);
    },

    _escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }
};
