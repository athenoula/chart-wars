// ─── Chart Wars — Scoring Module ──────────────────────────────────────────────
// Fuzzy string matching and automatic answer scoring.
// No external dependencies — pure vanilla JS with Levenshtein distance.

const Scoring = {

    // ── Normalisation ─────────────────────────────────────────────────────────
    normalize(str) {
        if (!str) return "";
        let s = str.toString().toLowerCase().trim();

        // Remove parenthesized/bracketed suffixes (remix tags, version info)
        // e.g. "Macarena (Bayside Boys Mix)" → "Macarena"
        s = s.replace(/\s*[\(\[][^\)\]]*[\)\]]\s*/g, " ");

        // Strip dash-separated release/version tags (with optional year)
        // e.g. "Rock the Casbah - Remastered" → "Rock the Casbah"
        // e.g. "Dreams - 2004 Remaster" → "Dreams"
        // e.g. "Rock With You - Single Version" → "Rock With You"
        s = s.replace(/\s*-\s*(\d{4}\s*)?(remaster(ed)?|remix(ed)?|re-?mix|radio\s*edit|single\s*version|deluxe|bonus\s*track|live|acoustic|demo|mono|stereo|edit|version|extended(\s*mix)?|original(\s*mix)?|(\w+\s+)?mix|b-?side)(\s*\d{4})?\s*$/i, "");

        // Strip diacritics/accents (Beyoncé → beyonce, Motörhead → motorhead)
        s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        // Remove punctuation except hyphens and apostrophes within words
        s = s.replace(/[^\w\s'-]/g, "");

        // Normalise connectors: & + → and
        s = s.replace(/\s*[&+]\s*/g, " and ");

        // Strip feat/ft/featuring and everything after
        s = s.replace(/\s*\b(feat\.?|ft\.?|featuring)\b\s*/i, " ");

        // Remove leading articles
        s = s.replace(/^(the|a|an)\s+/i, "");

        // Collapse whitespace
        s = s.replace(/\s+/g, " ").trim();

        return s;
    },

    // ── Levenshtein Distance ──────────────────────────────────────────────────
    levenshtein(a, b) {
        if (a === b) return 0;
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;

        const matrix = [];
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b[i - 1] === a[j - 1]) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        matrix[i][j - 1] + 1,       // insertion
                        matrix[i - 1][j] + 1         // deletion
                    );
                }
            }
        }
        return matrix[b.length][a.length];
    },

    // ── Similarity Score (0–1) ────────────────────────────────────────────────
    similarity(s1, s2) {
        if (!s1 && !s2) return 1;
        if (!s1 || !s2) return 0;
        const longer = s1.length >= s2.length ? s1 : s2;
        if (longer.length === 0) return 1;
        return (longer.length - Scoring.levenshtein(s1, s2)) / longer.length;
    },

    // ── Fuzzy Match Check (≥85% similarity) ───────────────────────────────────
    fuzzyMatch(guess, correct, threshold = 0.85) {
        return Scoring.similarity(guess, correct) >= threshold;
    },

    // ── Partial Name Detection ────────────────────────────────────────────────
    // Checks if the guess matches any significant word in the correct answer,
    // OR if any significant word from the correct answer appears in the guess.
    // Returns true if a meaningful partial match is found.
    isPartialMatch(normGuess, normCorrect) {
        if (!normGuess || normGuess.length < 3) return false;

        const correctWords = normCorrect.split(" ").filter(w => w.length > 2);
        const guessWords = normGuess.split(" ").filter(w => w.length > 2);

        // Check if any guess word fuzzy-matches a correct word
        for (const gw of guessWords) {
            for (const cw of correctWords) {
                if (Scoring.similarity(gw, cw) >= 0.80) return true;
            }
        }

        // Check if the guess is a significant substring of the correct answer
        if (normGuess.length >= 4 && normCorrect.includes(normGuess)) return true;

        // Check if any correct word is a significant substring of the guess
        for (const cw of correctWords) {
            if (cw.length >= 4 && normGuess.includes(cw)) return true;
        }

        return false;
    },

    // ── Score Artist ──────────────────────────────────────────────────────────
    scoreArtist(track, guessArtist) {
        const normCorrect = Scoring.normalize(track.artist);
        const normGuess = Scoring.normalize(guessArtist);

        if (!normGuess) return { points: 0, status: "wrong", reason: null };

        // Layer 1: Full match (≥85% similarity)
        if (Scoring.fuzzyMatch(normGuess, normCorrect)) {
            return { points: 1, status: "full", reason: null };
        }

        // Layer 2: Full match on a related/featured artist (1 pt)
        if (track.relatedArtists && track.relatedArtists.length > 0) {
            for (const related of track.relatedArtists) {
                const normRelated = Scoring.normalize(related);
                if (Scoring.fuzzyMatch(normGuess, normRelated)) {
                    return { points: 1, status: "full", reason: `Matched: ${related}` };
                }
            }
        }

        // Layer 3: Partial name match (0.5 pts)
        if (Scoring.isPartialMatch(normGuess, normCorrect)) {
            return { points: 0.5, status: "partial", reason: "Partial name match" };
        }

        // Layer 4: Partial match on related artist (0.5 pts)
        if (track.relatedArtists && track.relatedArtists.length > 0) {
            for (const related of track.relatedArtists) {
                const normRelated = Scoring.normalize(related);
                if (Scoring.isPartialMatch(normGuess, normRelated)) {
                    return { points: 0.5, status: "partial", reason: `Partial match on related artist` };
                }
            }
        }

        return { points: 0, status: "wrong", reason: null };
    },

    // ── Score Title ───────────────────────────────────────────────────────────
    scoreTitle(track, guessTitle) {
        const normCorrect = Scoring.normalize(track.title);
        const normGuess = Scoring.normalize(guessTitle);

        if (!normGuess) return { points: 0, status: "wrong", reason: null };

        // Layer 1: Full match (≥85% similarity)
        if (Scoring.fuzzyMatch(normGuess, normCorrect)) {
            return { points: 1, status: "full", reason: null };
        }

        // Layer 2: Partial match (0.5 pts)
        if (Scoring.isPartialMatch(normGuess, normCorrect)) {
            return { points: 0.5, status: "partial", reason: "Partial title match" };
        }

        return { points: 0, status: "wrong", reason: null };
    },

    // ── Score Year ────────────────────────────────────────────────────────────
    scoreYear(track, guessYear) {
        const correct = track.year;
        const guess = parseInt(guessYear);

        if (isNaN(guess)) return { points: 0, status: "wrong", reason: null };

        if (guess === correct) {
            return { points: 6, status: "full", reason: null };
        }

        if (Math.floor(guess / 10) === Math.floor(correct / 10)) {
            return { points: 1, status: "partial", reason: `Correct decade (${Math.floor(correct / 10) * 10}s)` };
        }

        return { points: 0, status: "wrong", reason: null };
    },

    // ── Swap Detection ────────────────────────────────────────────────────────
    // If both artist and title scored poorly, check if the user swapped the fields.
    // Awards 0.5 pts each for swapped matches (partial credit).
    _trySwappedFields(track, guesses) {
        // Score artist-guess against the title, and title-guess against the artist
        const swappedArtist = Scoring.scoreArtist(track, guesses.title || "");
        const swappedTitle = Scoring.scoreTitle(track, guesses.artist || "");

        if (swappedArtist.points > 0 || swappedTitle.points > 0) {
            return {
                artist: swappedArtist.points > 0
                    ? { points: Math.min(swappedArtist.points, 0.5), status: "partial", reason: "Swapped with title" }
                    : { points: 0, status: "wrong", reason: null },
                title: swappedTitle.points > 0
                    ? { points: Math.min(swappedTitle.points, 0.5), status: "partial", reason: "Swapped with artist" }
                    : { points: 0, status: "wrong", reason: null }
            };
        }
        return null;
    },

    // ── Calculate Full Round Score ────────────────────────────────────────────
    // Returns: { artist: {points, status, reason}, title: {...}, year: {...}, total }
    calculateRoundScore(track, guesses) {
        let artist = Scoring.scoreArtist(track, guesses.artist || "");
        let title = Scoring.scoreTitle(track, guesses.title || "");
        const year = Scoring.scoreYear(track, guesses.year || "");

        // If both artist and title scored 0, check for swapped fields
        if (artist.points === 0 && title.points === 0) {
            const swapped = Scoring._trySwappedFields(track, guesses);
            if (swapped) {
                artist = swapped.artist;
                title = swapped.title;
            }
        }

        return {
            artist,
            title,
            year,
            total: artist.points + title.points + year.points
        };
    }
};
