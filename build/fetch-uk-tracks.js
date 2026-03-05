#!/usr/bin/env node
// ─── Chart Wars — UK Track Fetcher ───────────────────────────────────────────
// Fetches top UK tracks from Last.fm, enriches with audio previews from
// iTunes/Deezer, and outputs data/tracks.json.
//
// Usage:
//   node fetch-uk-tracks.js --api-key YOUR_LASTFM_KEY
//   node fetch-uk-tracks.js --api-key KEY --limit 20
//   node fetch-uk-tracks.js --api-key KEY --decades 1980,1990
//   node fetch-uk-tracks.js --api-key KEY --dry-run
//   node fetch-uk-tracks.js --api-key KEY --output custom.json
//
// Environment variable alternative:
//   LASTFM_API_KEY=xxx node fetch-uk-tracks.js

const fs = require("fs");
const path = require("path");

// ── Constants ───────────────────────────────────────────────────────────────

const LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/";
const ITUNES_SEARCH = "https://itunes.apple.com/search";
const DEEZER_SEARCH = "https://api.deezer.com/search";
const LASTFM_RATE_MS = 250;  // ~4 requests/sec (Last.fm allows 5/sec)
const ITUNES_RATE_MS = 400;

// Patterns for splitting featured/collaborative artists
const ARTIST_SPLIT_RE = /\s+(?:[Ff]eaturing|[Ff]eat\.?|[Ff]t\.?|[Ww]ith|[Xx]|[&+]|[Aa]nd)\s+|\s*,\s+/;

// Valid decade range
const ALL_DECADES = [1970, 1980, 1990, 2000, 2010, 2020];

// ── CLI Arg Parsing ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = {
    limit: 300,
    decades: null,
    dryRun: false,
    output: path.join(__dirname, "..", "data", "tracks.json"),
    apiKey: process.env.LASTFM_API_KEY || null,
    pages: 40,  // pages of geo.getTopTracks to fetch (50 tracks/page = 2000 raw)
};

for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
        flags.limit = parseInt(args[++i]);
    } else if (args[i] === "--decades" && args[i + 1]) {
        flags.decades = args[++i].split(",").map(d => parseInt(d.trim()));
    } else if (args[i] === "--dry-run") {
        flags.dryRun = true;
    } else if (args[i] === "--output" && args[i + 1]) {
        flags.output = args[++i];
    } else if (args[i] === "--api-key" && args[i + 1]) {
        flags.apiKey = args[++i];
    } else if (args[i] === "--pages" && args[i + 1]) {
        flags.pages = parseInt(args[++i]);
    }
}

if (!flags.apiKey) {
    console.error("Error: Last.fm API key required.");
    console.error("  Use --api-key YOUR_KEY or set LASTFM_API_KEY env var.");
    console.error("  Get a free key at https://www.last.fm/api/account/create");
    process.exit(1);
}

// ── Utilities ───────────────────────────────────────────────────────────────

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const res = await fetch(url);
            if (res.ok) return res;
            if (res.status === 403 || res.status === 429) {
                const backoff = 1000 * Math.pow(2, attempt);
                process.stdout.write(` (rate-limited, retry in ${backoff}ms)`);
                await delay(backoff);
                continue;
            }
            throw new Error(`HTTP ${res.status}`);
        } catch (e) {
            if (attempt === maxRetries - 1) throw e;
            await delay(1000 * Math.pow(2, attempt));
        }
    }
    return null;
}

function normalizeKey(title, artist) {
    return `${title.toLowerCase().trim()}|||${artist.toLowerCase().trim()}`;
}

// ── Artist Parsing (reused from generate-tracks.js) ─────────────────────────

function parseArtists(artistStr) {
    return artistStr
        .split(ARTIST_SPLIT_RE)
        .map(p => p.trim())
        .filter(p => p.length > 0);
}

function deriveRelatedArtists(artistStr) {
    const parts = parseArtists(artistStr);
    return parts.length > 1 ? parts : [];
}

function getPrimaryArtist(artistStr) {
    return parseArtists(artistStr)[0] || artistStr;
}

function buildSearchTerm(title, artist) {
    const primary = getPrimaryArtist(artist);
    const cleanTitle = title.replace(/\s*\(.*?\)\s*/g, " ").trim();
    return `${primary} ${cleanTitle}`;
}

// ── Phase 1: Fetch UK Top Tracks from Last.fm ───────────────────────────────

async function fetchGeoTopTracks(page) {
    const url = `${LASTFM_BASE}?method=geo.getTopTracks&country=United Kingdom&page=${page}&limit=50&api_key=${flags.apiKey}&format=json`;

    const res = await fetchWithRetry(url);
    if (!res) return [];

    const data = await res.json();
    if (!data.tracks || !data.tracks.track) return [];

    return data.tracks.track.map(t => ({
        title: t.name,
        artist: t.artist.name,
        listeners: parseInt(t.listeners) || 0,
    }));
}

async function fetchAllUKTracks() {
    const allTracks = [];
    const seen = new Set();

    for (let page = 1; page <= flags.pages; page++) {
        process.stdout.write(`  Fetching page ${page}/${flags.pages}...`);
        try {
            const tracks = await fetchGeoTopTracks(page);
            let newCount = 0;
            for (const t of tracks) {
                const key = normalizeKey(t.title, t.artist);
                if (!seen.has(key)) {
                    seen.add(key);
                    allTracks.push(t);
                    newCount++;
                }
            }
            console.log(` ${tracks.length} tracks (${newCount} new)`);
            await delay(LASTFM_RATE_MS);
        } catch (e) {
            console.log(` [error: ${e.message}]`);
        }
    }

    return allTracks;
}

// ── Phase 2: Get Release Years ──────────────────────────────────────────────

async function getTrackYear(title, artist) {
    // Try track.getInfo first — sometimes has wiki with release year
    const trackUrl = `${LASTFM_BASE}?method=track.getInfo&track=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&api_key=${flags.apiKey}&format=json`;

    try {
        const res = await fetchWithRetry(trackUrl);
        if (!res) return null;

        const data = await res.json();
        const track = data.track;
        if (!track) return null;

        // Check wiki for a date
        if (track.wiki && track.wiki.published) {
            const year = parseYearFromDate(track.wiki.published);
            if (year) return year;
        }

        // Try album.getInfo if we have an album name
        if (track.album && track.album.title) {
            await delay(LASTFM_RATE_MS);
            return await getAlbumYear(track.album.title, artist);
        }
    } catch (e) {
        // Silently skip errors
    }

    return null;
}

async function getAlbumYear(albumTitle, artist) {
    const url = `${LASTFM_BASE}?method=album.getInfo&album=${encodeURIComponent(albumTitle)}&artist=${encodeURIComponent(artist)}&api_key=${flags.apiKey}&format=json`;

    try {
        const res = await fetchWithRetry(url);
        if (!res) return null;

        const data = await res.json();
        const album = data.album;
        if (!album) return null;

        // Check wiki published date
        if (album.wiki && album.wiki.published) {
            return parseYearFromDate(album.wiki.published);
        }
    } catch (e) {
        // Silently skip
    }

    return null;
}

function parseYearFromDate(dateStr) {
    if (!dateStr) return null;
    // Last.fm dates: "01 January 2005" or "2005-01-01" etc
    const match = dateStr.match(/\b(19[6-9]\d|20[0-2]\d)\b/);
    return match ? parseInt(match[1]) : null;
}

function getDecade(year) {
    return Math.floor(year / 10) * 10;
}

// ── Phase 2b: iTunes Year Fallback ──────────────────────────────────────────

async function getItunesYear(title, artist) {
    const term = encodeURIComponent(buildSearchTerm(title, artist));
    const url = `${ITUNES_SEARCH}?term=${term}&media=music&limit=3`;

    try {
        const res = await fetchWithRetry(url);
        if (!res) return null;

        const data = await res.json();
        if (!data.results || data.results.length === 0) return null;

        const normTitle = title.toLowerCase();
        const normArtist = getPrimaryArtist(artist).toLowerCase();

        for (const r of data.results) {
            const rTitle = (r.trackName || "").toLowerCase();
            const rArtist = (r.artistName || "").toLowerCase();
            if ((rTitle.includes(normTitle) || normTitle.includes(rTitle)) &&
                (rArtist.includes(normArtist) || normArtist.includes(rArtist))) {
                if (r.releaseDate) {
                    const year = parseYearFromDate(r.releaseDate);
                    if (year) return year;
                }
            }
        }

        // Fallback: first result's release date
        if (data.results[0].releaseDate) {
            return parseYearFromDate(data.results[0].releaseDate);
        }
    } catch (e) {
        // Silently skip
    }

    return null;
}

// ── Phase 3: Assign Difficulty Tiers ────────────────────────────────────────

function assignTiers(tracks) {
    // Sort by listeners descending
    tracks.sort((a, b) => b.listeners - a.listeners);

    const total = tracks.length;
    for (let i = 0; i < total; i++) {
        const percentile = i / total;

        if (percentile < 0.15) {
            tracks[i].peakPosition = 1;                          // Tier 1: Party
        } else if (percentile < 0.35) {
            tracks[i].peakPosition = 2 + Math.floor(Math.random() * 9); // Tier 2: 2-10
        } else if (percentile < 0.60) {
            tracks[i].peakPosition = 11 + Math.floor(Math.random() * 10); // Tier 3: 11-20
        } else {
            tracks[i].peakPosition = 21 + Math.floor(Math.random() * 20); // Tier 4: 21-40
        }

        // Map listeners to a reasonable weeksOnChart (1-52)
        const maxListeners = tracks[0].listeners;
        const ratio = tracks[i].listeners / maxListeners;
        tracks[i].weeksOnChart = Math.max(1, Math.round(ratio * 52));
    }

    return tracks;
}

// ── Phase 4: iTunes / Deezer Enrichment (reused pattern) ────────────────────

async function searchItunes(title, artist) {
    const term = encodeURIComponent(buildSearchTerm(title, artist));
    const url = `${ITUNES_SEARCH}?term=${term}&media=music&limit=5`;

    const res = await fetchWithRetry(url);
    if (!res) return null;

    const data = await res.json();
    if (!data.results || data.results.length === 0) return null;

    const normTitle = title.toLowerCase();
    const normArtist = getPrimaryArtist(artist).toLowerCase();

    // Try to find a close match
    for (const r of data.results) {
        const rTitle = (r.trackName || "").toLowerCase();
        const rArtist = (r.artistName || "").toLowerCase();
        if ((rTitle.includes(normTitle) || normTitle.includes(rTitle)) &&
            (rArtist.includes(normArtist) || normArtist.includes(rArtist))) {
            return {
                previewUrl: r.previewUrl || "",
                albumArt: r.artworkUrl100 || r.artworkUrl60 || "",
                source: "itunes",
            };
        }
    }

    // Fallback: first result
    const first = data.results[0];
    return {
        previewUrl: first.previewUrl || "",
        albumArt: first.artworkUrl100 || first.artworkUrl60 || "",
        source: "itunes",
    };
}

async function searchDeezer(title, artist) {
    const query = encodeURIComponent(buildSearchTerm(title, artist));
    const url = `${DEEZER_SEARCH}?q=${query}&limit=1`;

    const res = await fetchWithRetry(url);
    if (!res) return null;

    const data = await res.json();
    if (!data.data || data.data.length === 0) return null;

    const first = data.data[0];
    return {
        previewUrl: first.preview || "",
        albumArt: (first.album && first.album.cover_medium) || "",
        source: "deezer",
    };
}

async function enrichTrack(track) {
    let result = await searchItunes(track.title, track.artist);
    await delay(ITUNES_RATE_MS);

    if (!result || !result.previewUrl) {
        result = await searchDeezer(track.title, track.artist);
        await delay(ITUNES_RATE_MS);
    }

    if (result) {
        track.previewUrl = result.previewUrl;
        track.albumArt = result.albumArt;
        track.source = result.source;
    } else {
        track.previewUrl = "";
        track.albumArt = "";
        track.source = "none";
    }

    return track;
}

// ── Phase 5: Fun Fact Generation (UK-adapted) ──────────────────────────────

function formatListeners(n) {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
    return `${n}`;
}

function generateFunFact(track) {
    const { peakPosition, listeners, year } = track;
    const decade = `${getDecade(year)}s`;
    const listenerStr = formatListeners(listeners);

    if (peakPosition === 1 && listeners >= 1000000) {
        return `A massive UK favourite with over ${listenerStr} Last.fm listeners — one of the biggest hits of the ${decade}.`;
    }
    if (peakPosition === 1) {
        return `One of the most popular tracks in the UK from ${year}, with ${listenerStr} Last.fm listeners.`;
    }
    if (peakPosition <= 10) {
        return `A top UK hit with ${listenerStr} Last.fm listeners, hugely popular in the ${decade}.`;
    }
    if (listeners >= 500000) {
        return `Racked up ${listenerStr} Last.fm listeners — a firm favourite with UK music fans.`;
    }
    return `Popular with UK listeners in the ${decade}, with ${listenerStr} plays on Last.fm.`;
}

// ── Track Selection with Decade Diversity ───────────────────────────────────

function selectTracks(tracks, limit) {
    const decades = flags.decades || ALL_DECADES;

    // Group by decade
    const byDecade = {};
    for (const t of tracks) {
        const d = getDecade(t.year);
        if (!byDecade[d]) byDecade[d] = [];
        byDecade[d].push(t);
    }

    // Sort within each decade by listeners (most popular first)
    for (const d of Object.keys(byDecade)) {
        byDecade[d].sort((a, b) => b.listeners - a.listeners);
    }

    // Round-robin across decades
    const decadeKeys = Object.keys(byDecade).sort();
    const selected = [];
    const usedKeys = new Set();
    let round = 0;

    while (selected.length < limit) {
        let addedThisRound = false;
        for (const dk of decadeKeys) {
            if (selected.length >= limit) break;
            if (round < byDecade[dk].length) {
                const candidate = byDecade[dk][round];
                const key = normalizeKey(candidate.title, candidate.artist);
                if (!usedKeys.has(key)) {
                    usedKeys.add(key);
                    selected.push(candidate);
                    addedThisRound = true;
                }
            }
        }
        round++;
        if (!addedThisRound) break;
    }

    return selected;
}

// ── Backup ──────────────────────────────────────────────────────────────────

function backupExistingData() {
    const tracksPath = path.join(__dirname, "..", "data", "tracks.json");
    const backupPath = path.join(__dirname, "..", "data", "tracks.backup.json");

    if (fs.existsSync(tracksPath)) {
        fs.copyFileSync(tracksPath, backupPath);
        console.log(`  Backed up existing tracks.json → tracks.backup.json\n`);
    }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
    const decades = flags.decades || ALL_DECADES;

    console.log(`\nChart Wars — UK Track Fetcher (Last.fm)`);
    console.log(`  Limit:   ${flags.limit}`);
    console.log(`  Decades: ${decades.join(", ")}`);
    console.log(`  Pages:   ${flags.pages} (${flags.pages * 50} raw tracks)`);
    console.log(`  Output:  ${flags.output}`);
    console.log(`  Dry run: ${flags.dryRun}\n`);

    // ── Dry run ──
    if (flags.dryRun) {
        console.log(`  [DRY RUN] Would fetch ${flags.pages} pages of geo.getTopTracks (UK)`);
        console.log(`  [DRY RUN] Would look up release years via track.getInfo + album.getInfo`);
        console.log(`  [DRY RUN] Would filter to decades: ${decades.join(", ")}`);
        console.log(`  [DRY RUN] Would enrich ~${flags.limit} tracks with iTunes/Deezer previews`);
        console.log(`  [DRY RUN] Would assign difficulty tiers based on listener count`);
        console.log(`\n  Tier distribution:`);
        console.log(`    Tier 1 (Party):  ~${Math.round(flags.limit * 0.15)} tracks — position 1`);
        console.log(`    Tier 2 (Easy):   ~${Math.round(flags.limit * 0.20)} tracks — positions 2-10`);
        console.log(`    Tier 3 (Medium): ~${Math.round(flags.limit * 0.25)} tracks — positions 11-20`);
        console.log(`    Tier 4 (Hard):   ~${Math.round(flags.limit * 0.40)} tracks — positions 21-40`);
        console.log(`\n  Done (dry run).\n`);
        return;
    }

    // ── Backup ──
    backupExistingData();

    // ── Phase 1: Fetch UK tracks ──
    console.log(`Phase 1: Fetching UK top tracks from Last.fm...\n`);
    const rawTracks = await fetchAllUKTracks();
    console.log(`\n  Fetched ${rawTracks.length} unique UK tracks\n`);

    if (rawTracks.length === 0) {
        console.error("No tracks fetched. Check your API key and network connection.");
        process.exit(1);
    }

    // ── Phase 2: Get release years ──
    console.log(`Phase 2: Looking up release years...\n`);
    const tracksWithYears = [];
    let yearFound = 0;
    let yearMissing = 0;

    for (let i = 0; i < rawTracks.length; i++) {
        const t = rawTracks[i];
        process.stdout.write(`  [${i + 1}/${rawTracks.length}] ${t.artist} — "${t.title}"...`);

        // Try iTunes first (more accurate original release dates)
        let year = await getItunesYear(t.title, t.artist);
        await delay(ITUNES_RATE_MS);

        // Last.fm fallback
        if (!year) {
            year = await getTrackYear(t.title, t.artist);
            await delay(LASTFM_RATE_MS);
        }

        if (year) {
            const decade = getDecade(year);
            if (decades.includes(decade)) {
                t.year = year;
                tracksWithYears.push(t);
                console.log(` ${year} ✓`);
                yearFound++;
            } else {
                console.log(` ${year} (outside decade range, skipping)`);
                yearMissing++;
            }
        } else {
            console.log(` (no year found, skipping)`);
            yearMissing++;
        }

        // Early exit once we have plenty from each decade
        if (tracksWithYears.length >= flags.limit * 3) {
            console.log(`\n  Enough tracks found (${tracksWithYears.length}), stopping year lookups early.\n`);
            break;
        }
    }

    console.log(`\n  Years found: ${yearFound}, skipped: ${yearMissing}`);
    console.log(`  Tracks with valid years in range: ${tracksWithYears.length}\n`);

    if (tracksWithYears.length === 0) {
        console.error("No tracks with valid years found. Try different decades or more pages.");
        process.exit(1);
    }

    // ── Phase 3: Select with decade diversity ──
    console.log(`Phase 3: Selecting ${flags.limit} tracks with decade diversity...\n`);
    const selected = selectTracks(tracksWithYears, flags.limit);

    // Show decade distribution
    const decadeCounts = {};
    for (const t of selected) {
        const d = getDecade(t.year);
        decadeCounts[d] = (decadeCounts[d] || 0) + 1;
    }
    for (const d of Object.keys(decadeCounts).sort()) {
        console.log(`  ${d}s: ${decadeCounts[d]} tracks`);
    }
    console.log(`  Total: ${selected.length}\n`);

    // ── Phase 4: Assign tiers ──
    console.log(`Phase 4: Assigning difficulty tiers...\n`);
    assignTiers(selected);

    const tierCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const t of selected) {
        if (t.peakPosition === 1) tierCounts[1]++;
        else if (t.peakPosition <= 10) tierCounts[2]++;
        else if (t.peakPosition <= 20) tierCounts[3]++;
        else tierCounts[4]++;
    }
    console.log(`  Tier 1 (Party):  ${tierCounts[1]}`);
    console.log(`  Tier 2 (Easy):   ${tierCounts[2]}`);
    console.log(`  Tier 3 (Medium): ${tierCounts[3]}`);
    console.log(`  Tier 4 (Hard):   ${tierCounts[4]}\n`);

    // ── Phase 5: Enrich with iTunes/Deezer ──
    console.log(`Phase 5: Looking up audio previews...\n`);
    let withPreview = 0;
    let noPreview = 0;
    let errors = 0;

    for (let i = 0; i < selected.length; i++) {
        const track = selected[i];
        process.stdout.write(`  [${i + 1}/${selected.length}] ${track.artist} — "${track.title}" (${track.year})...`);

        try {
            await enrichTrack(track);
            track.relatedArtists = deriveRelatedArtists(track.artist);
            track.funFact = generateFunFact(track);

            if (track.previewUrl) {
                console.log(` [${track.source}]`);
                withPreview++;
            } else {
                console.log(` [no preview]`);
                noPreview++;
            }
        } catch (e) {
            console.log(` [error: ${e.message}]`);
            errors++;
            track.previewUrl = "";
            track.albumArt = "";
            track.source = "none";
            track.relatedArtists = deriveRelatedArtists(track.artist);
            track.funFact = generateFunFact(track);
        }
    }

    // ── Phase 6: Write ──
    const output = selected.map(t => ({
        title: t.title,
        artist: t.artist,
        year: t.year,
        peakPosition: t.peakPosition,
        weeksOnChart: t.weeksOnChart,
        previewUrl: t.previewUrl,
        albumArt: t.albumArt,
        source: t.source,
        relatedArtists: t.relatedArtists,
        funFact: t.funFact,
    }));

    // Ensure output directory exists
    const outDir = path.dirname(flags.output);
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    fs.writeFileSync(flags.output, JSON.stringify(output, null, 2), "utf8");

    console.log(`\nSaved ${output.length} tracks to ${flags.output}`);
    console.log(`\nSummary:`);
    console.log(`  Total tracks:    ${output.length}`);
    console.log(`  With preview:    ${withPreview}`);
    console.log(`  Without preview: ${noPreview}`);
    console.log(`  Errors:          ${errors}`);
    console.log(`\nTo restore old data: cp data/tracks.backup.json data/tracks.json`);
    console.log(`\nDone!\n`);
}

main().catch(e => {
    console.error("Fatal error:", e.message);
    process.exit(1);
});
