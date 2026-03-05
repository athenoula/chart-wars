#!/usr/bin/env node
// Quick fix: replace broken Deezer preview URLs with iTunes ones
// Usage: node build/fix-deezer-previews.js

const fs = require("fs");
const path = require("path");

const ITUNES_SEARCH = "https://itunes.apple.com/search";
const RATE_MS = 500;
const ARTIST_SPLIT_RE = /\s+(?:[Ff]eaturing|[Ff]eat\.?|[Ff]t\.?|[Ww]ith|[Xx]|[&+]|[Aa]nd)\s+|\s*,\s+/;

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function getPrimaryArtist(s) {
    return s.split(ARTIST_SPLIT_RE).map(p => p.trim()).filter(p => p.length > 0)[0] || s;
}

function buildSearchTerm(title, artist) {
    const primary = getPrimaryArtist(artist);
    const clean = title.replace(/\s*\(.*?\)\s*/g, " ").trim();
    return `${primary} ${clean}`;
}

async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url);
            if (res.ok) return res;
            if (res.status === 403 || res.status === 429) {
                const wait = 1000 * Math.pow(2, i);
                process.stdout.write(` (rate-limited, retry ${wait}ms)`);
                await delay(wait);
                continue;
            }
            throw new Error(`HTTP ${res.status}`);
        } catch (e) {
            if (i === retries - 1) throw e;
            await delay(1000 * Math.pow(2, i));
        }
    }
    return null;
}

async function searchItunes(title, artist) {
    const term = encodeURIComponent(buildSearchTerm(title, artist));
    const url = `${ITUNES_SEARCH}?term=${term}&media=music&limit=5`;
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
            return { previewUrl: r.previewUrl || "", albumArt: r.artworkUrl100 || "", source: "itunes" };
        }
    }
    const first = data.results[0];
    return { previewUrl: first.previewUrl || "", albumArt: first.artworkUrl100 || "", source: "itunes" };
}

async function main() {
    const tracksPath = path.join(__dirname, "..", "data", "tracks.json");
    const tracks = JSON.parse(fs.readFileSync(tracksPath, "utf-8"));

    const deezerTracks = tracks.filter(t => t.source === "deezer");
    console.log(`Found ${deezerTracks.length} Deezer-sourced tracks to fix.\n`);

    let fixed = 0, failed = 0;

    for (let i = 0; i < deezerTracks.length; i++) {
        const t = deezerTracks[i];
        process.stdout.write(`  [${i + 1}/${deezerTracks.length}] ${t.artist} - ${t.title}...`);

        try {
            const result = await searchItunes(t.title, t.artist);
            if (result && result.previewUrl) {
                t.previewUrl = result.previewUrl;
                t.albumArt = result.albumArt || t.albumArt;
                t.source = "itunes";
                console.log(` ✓ iTunes`);
                fixed++;
            } else {
                console.log(` ✗ no iTunes preview found`);
                failed++;
            }
        } catch (e) {
            console.log(` ✗ error: ${e.message}`);
            failed++;
        }

        await delay(RATE_MS);
    }

    fs.writeFileSync(tracksPath, JSON.stringify(tracks, null, 2) + "\n");
    console.log(`\nDone! Fixed: ${fixed}, Failed: ${failed}`);
    console.log(`Saved to ${tracksPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
