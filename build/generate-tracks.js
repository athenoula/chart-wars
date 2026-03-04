#!/usr/bin/env node
// ─── Chart Wars — Track Generator ──────────────────────────────────────────
// Fetches Billboard Hot 100 charts, enriches with audio previews from
// iTunes/Deezer, and outputs data/tracks.json.
//
// Usage:
//   node generate-tracks.js                        # Default: ~50 tracks, all decades
//   node generate-tracks.js --limit 20             # Only output 20 tracks
//   node generate-tracks.js --decades 1980,1990    # Only 80s and 90s
//   node generate-tracks.js --dry-run              # Preview without API calls
//   node generate-tracks.js --output custom.json   # Custom output path

const fs = require("fs");
const path = require("path");

// ── Constants ───────────────────────────────────────────────────────────────

const BILLBOARD_BASE = "https://raw.githubusercontent.com/mhollingshead/billboard-hot-100/main/date";
const ITUNES_SEARCH = "https://itunes.apple.com/search";
const DEEZER_SEARCH = "https://api.deezer.com/search";
const RATE_LIMIT_MS = 400;

// Chart dates spread across decades — verified against valid_dates.json
const CHART_DATES = {
    1950: ["1958-08-11", "1959-06-22"],
    1960: ["1960-03-14", "1961-07-17", "1962-11-10", "1963-08-10", "1964-02-08", "1965-05-15", "1966-09-10", "1967-12-30", "1968-04-13", "1969-08-23"],
    1970: ["1970-03-14", "1971-07-10", "1972-11-11", "1973-07-07", "1974-05-11", "1975-09-13", "1976-12-25", "1977-06-25", "1978-04-08", "1979-08-18"],
    1980: ["1980-02-09", "1981-06-13", "1982-10-16", "1983-03-05", "1984-01-14", "1985-05-18", "1986-09-20", "1987-08-22", "1988-03-12", "1989-07-15"],
    1990: ["1990-01-13", "1991-05-18", "1992-09-12", "1993-06-12", "1994-03-12", "1995-07-15", "1996-11-16", "1997-11-15", "1998-06-13", "1999-10-16"],
    2000: ["2000-02-12", "2001-06-16", "2002-10-12", "2003-07-05", "2004-04-10", "2005-08-13", "2006-12-16", "2007-05-12", "2008-05-10", "2009-09-12"],
    2010: ["2010-01-16", "2011-05-14", "2012-09-15", "2013-08-03", "2014-03-15", "2015-07-18", "2016-11-12", "2017-06-24", "2018-06-16", "2019-10-12"],
    2020: ["2020-03-14", "2021-01-16", "2021-09-04", "2022-07-16", "2023-03-11", "2024-06-15", "2024-09-14", "2025-06-14"],
};

// Target counts per tier bucket (total ~300)
const TIER_TARGETS = [
    { tier: 1, filter: t => t.peakPosition === 1,                         count: 70 },
    { tier: 2, filter: t => t.peakPosition >= 2 && t.peakPosition <= 10,  count: 80 },
    { tier: 3, filter: t => t.peakPosition >= 11 && t.peakPosition <= 20, count: 80 },
    { tier: 4, filter: t => t.peakPosition >= 21 && t.peakPosition <= 40, count: 70 },
];

// Patterns for splitting featured/collaborative artists
const ARTIST_SPLIT_RE = /\s+(?:[Ff]eaturing|[Ff]eat\.?|[Ff]t\.?|[Ww]ith|[Xx]|[&+]|[Aa]nd)\s+|\s*,\s+/;

// ── CLI Arg Parsing ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = {
    limit: 300,
    decades: null,
    dryRun: false,
    output: path.join(__dirname, "..", "data", "tracks.json"),
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
    }
}

// ── Utilities ───────────────────────────────────────────────────────────────

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const res = await fetch(url);
        if (res.ok) return res;
        if (res.status === 403 || res.status === 429) {
            const backoff = 1000 * Math.pow(2, attempt);
            process.stdout.write(` (rate-limited, retry in ${backoff}ms)`);
            await delay(backoff);
            continue;
        }
        throw new Error(`HTTP ${res.status}`);
    }
    return null;
}

function normalizeKey(title, artist) {
    return `${title.toLowerCase().trim()}|||${artist.toLowerCase().trim()}`;
}

// ── Phase 1: Fetch Billboard Charts ─────────────────────────────────────────

async function fetchChart(dateStr) {
    const url = `${BILLBOARD_BASE}/${dateStr}.json`;
    console.log(`  Fetching chart for ${dateStr}...`);

    const res = await fetchWithRetry(url);
    if (!res) throw new Error(`Failed after retries: ${dateStr}`);

    const json = await res.json();
    const entries = json.data || json; // handle { date, data: [...] } or flat array

    return entries.map(e => ({
        title: e.song,
        artist: e.artist,
        year: parseInt(dateStr.slice(0, 4)),
        peakPosition: e.peak_position,
        weeksOnChart: e.weeks_on_chart,
    }));
}

async function fetchAllCharts(decadeFilter) {
    const allTracks = [];
    const decades = decadeFilter || Object.keys(CHART_DATES).map(Number);

    for (const decade of decades) {
        const dates = CHART_DATES[decade];
        if (!dates) {
            console.warn(`  Warning: No chart dates for ${decade}s, skipping`);
            continue;
        }
        for (const dateStr of dates) {
            try {
                const tracks = await fetchChart(dateStr);
                allTracks.push(...tracks);
                await delay(RATE_LIMIT_MS);
            } catch (e) {
                console.error(`  Error fetching ${dateStr}: ${e.message}`);
            }
        }
    }

    return allTracks;
}

// ── Phase 2: Deduplicate & Select ───────────────────────────────────────────

function deduplicateTracks(rawTracks) {
    const seen = new Map();

    for (const track of rawTracks) {
        const key = normalizeKey(track.title, track.artist);
        const existing = seen.get(key);

        if (!existing) {
            seen.set(key, track);
        } else {
            // Keep best peak position; tie-break by weeks on chart
            if (track.peakPosition < existing.peakPosition ||
                (track.peakPosition === existing.peakPosition &&
                 track.weeksOnChart > existing.weeksOnChart)) {
                seen.set(key, track);
            }
        }
    }

    return Array.from(seen.values());
}

function selectTracks(dedupedTracks, limit) {
    const selected = [];
    const usedKeys = new Set();

    for (const { tier, filter, count } of TIER_TARGETS) {
        const pool = dedupedTracks.filter(filter);

        // Group by decade for round-robin diversity
        const byDecade = {};
        for (const track of pool) {
            const decade = Math.floor(track.year / 10) * 10;
            if (!byDecade[decade]) byDecade[decade] = [];
            byDecade[decade].push(track);
        }

        // Sort within each decade by weeksOnChart (most recognisable first)
        for (const decade of Object.keys(byDecade)) {
            byDecade[decade].sort((a, b) => b.weeksOnChart - a.weeksOnChart);
        }

        // Round-robin across decades
        const decadeKeys = Object.keys(byDecade).sort();
        let added = 0;
        let round = 0;

        while (added < count && added < limit - selected.length) {
            let addedThisRound = false;
            for (const dk of decadeKeys) {
                if (added >= count || selected.length >= limit) break;
                if (round < byDecade[dk].length) {
                    const candidate = byDecade[dk][round];
                    const key = normalizeKey(candidate.title, candidate.artist);
                    if (!usedKeys.has(key)) {
                        usedKeys.add(key);
                        selected.push(candidate);
                        added++;
                        addedThisRound = true;
                    }
                }
            }
            round++;
            if (!addedThisRound) break;
        }

        console.log(`   Tier ${tier}: selected ${added}/${count} (pool: ${pool.length})`);
    }

    return selected.slice(0, limit);
}

// ── Phase 3: Artist Parsing ─────────────────────────────────────────────────

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

// ── Phase 3: iTunes / Deezer Enrichment ─────────────────────────────────────

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
    // iTunes first
    let result = await searchItunes(track.title, track.artist);
    await delay(RATE_LIMIT_MS);

    // Deezer fallback if no preview
    if (!result || !result.previewUrl) {
        result = await searchDeezer(track.title, track.artist);
        await delay(RATE_LIMIT_MS);
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

// ── Phase 3: Fun Fact Generation ────────────────────────────────────────────

function generateFunFact(track) {
    const { peakPosition, weeksOnChart, year } = track;

    if (peakPosition === 1 && weeksOnChart >= 20) {
        return `Hit #1 on the Billboard Hot 100 and spent an impressive ${weeksOnChart} weeks on the chart in ${year}.`;
    }
    if (peakPosition === 1) {
        return `Reached the top of the Billboard Hot 100 in ${year}, spending ${weeksOnChart} weeks on the chart.`;
    }
    if (peakPosition <= 5) {
        return `Peaked at #${peakPosition} on the Billboard Hot 100 and spent ${weeksOnChart} weeks on the chart.`;
    }
    if (weeksOnChart >= 30) {
        return `Spent a remarkable ${weeksOnChart} weeks on the Billboard Hot 100, peaking at #${peakPosition}.`;
    }
    return `Peaked at #${peakPosition} and spent ${weeksOnChart} weeks on the Billboard Hot 100.`;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
    console.log(`\nChart Wars — Track Generator`);
    console.log(`  Limit:   ${flags.limit}`);
    console.log(`  Decades: ${flags.decades ? flags.decades.join(", ") : "all"}`);
    console.log(`  Output:  ${flags.output}`);
    console.log(`  Dry run: ${flags.dryRun}\n`);

    // ── Dry run ──
    if (flags.dryRun) {
        const decades = flags.decades || Object.keys(CHART_DATES).map(Number);
        const dates = decades.flatMap(d => CHART_DATES[d] || []);
        console.log(`  [DRY RUN] Would fetch ${dates.length} charts:`);
        dates.forEach(d => console.log(`    - ${d}`));
        console.log(`\n  [DRY RUN] Would select ~${flags.limit} tracks across tiers:`);
        for (const { tier, count } of TIER_TARGETS) {
            console.log(`    Tier ${tier}: ~${count} tracks`);
        }
        console.log(`\n  Done (dry run).\n`);
        return;
    }

    // ── Phase 1: Fetch ──
    console.log(`Phase 1: Fetching Billboard charts...\n`);
    const rawTracks = await fetchAllCharts(flags.decades);
    console.log(`\n  Fetched ${rawTracks.length} raw chart entries\n`);

    if (rawTracks.length === 0) {
        console.error("No tracks fetched. Check your network connection.");
        process.exit(1);
    }

    // ── Phase 2: Select ──
    console.log(`Phase 2: Deduplicating and selecting tracks...\n`);
    const deduped = deduplicateTracks(rawTracks);
    console.log(`  ${deduped.length} unique tracks after deduplication\n`);

    const selected = selectTracks(deduped, flags.limit);
    console.log(`\n  Selected ${selected.length} tracks total\n`);

    // ── Phase 3: Enrich ──
    console.log(`Phase 3: Looking up audio previews...\n`);
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

    // ── Phase 4: Write ──
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

    fs.writeFileSync(flags.output, JSON.stringify(output, null, 2), "utf8");

    console.log(`\nSaved ${output.length} tracks to ${flags.output}`);
    console.log(`\nSummary:`);
    console.log(`  Total tracks:    ${output.length}`);
    console.log(`  With preview:    ${withPreview}`);
    console.log(`  Without preview: ${noPreview}`);
    console.log(`  Errors:          ${errors}`);
    console.log(`\nDone!\n`);
}

main().catch(e => {
    console.error("Fatal error:", e.message);
    process.exit(1);
});
