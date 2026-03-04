// ─── Chart Wars — Leaderboard Module ──────────────────────────────────────────
// Persists solo mode high scores in localStorage.

const Leaderboard = {
    STORAGE_KEY: "chartWarsLeaderboard",
    MAX_ENTRIES: 10,

    DIFFICULTY_NAMES: { 1: "★ Party", 2: "🎵 Easy", 3: "⚡ Medium", 4: "🏆 Hard", 5: "🎧 Nerd" },

    // ── Load from localStorage ────────────────────────────────────────────────
    getEntries() {
        try {
            const raw = localStorage.getItem(Leaderboard.STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.error("Failed to load leaderboard", e);
            return [];
        }
    },

    // ── Save a new entry ──────────────────────────────────────────────────────
    saveEntry(entry) {
        const entries = Leaderboard.getEntries();
        entries.push(entry);

        // Sort by percentage descending, then by raw score descending for ties
        entries.sort((a, b) => {
            if (b.percentage !== a.percentage) return b.percentage - a.percentage;
            return b.score - a.score;
        });

        const trimmed = entries.slice(0, Leaderboard.MAX_ENTRIES);
        localStorage.setItem(Leaderboard.STORAGE_KEY, JSON.stringify(trimmed));
        return trimmed;
    },

    // ── Render leaderboard into a container element ───────────────────────────
    render(containerId) {
        const container = document.getElementById(containerId);
        const entries = Leaderboard.getEntries();

        if (entries.length === 0) {
            container.innerHTML = '<p class="subtext">No scores yet. Play a solo game to get on the board!</p>';
            return;
        }

        let html = '<ul class="scoreboard-list">';
        entries.forEach((entry, i) => {
            const dateStr = new Date(entry.date).toLocaleDateString("en-GB", {
                day: "numeric", month: "short", year: "numeric"
            });
            const diffName = Leaderboard.DIFFICULTY_NAMES[entry.difficulty] || "Unknown";
            html += `
                <li ${i === 0 ? 'class="leader"' : ''}>
                    <span>${i + 1}. ${Leaderboard._escapeHtml(entry.name)}</span>
                    <span>
                        ${entry.score}/${entry.maxPossible} (${entry.percentage}%)
                        <span class="leaderboard-meta">${diffName} · ${dateStr}</span>
                    </span>
                </li>
            `;
        });
        html += '</ul>';
        container.innerHTML = html;
    },

    // ── Clear leaderboard ─────────────────────────────────────────────────────
    clear() {
        localStorage.removeItem(Leaderboard.STORAGE_KEY);
    },

    _escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }
};
