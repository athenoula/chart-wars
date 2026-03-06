#!/usr/bin/env node
// One-shot: remove peakPosition, weeksOnChart, and funFact from all tracks
const fs = require("fs");
const path = require("path");

const tracksPath = path.join(__dirname, "..", "data", "tracks.json");
const tracks = JSON.parse(fs.readFileSync(tracksPath, "utf-8"));

let cleaned = 0;
for (const t of tracks) {
    let changed = false;
    if ("peakPosition" in t) { delete t.peakPosition; changed = true; }
    if ("weeksOnChart" in t) { delete t.weeksOnChart; changed = true; }
    if ("funFact" in t) { delete t.funFact; changed = true; }
    if (changed) cleaned++;
}

fs.writeFileSync(tracksPath, JSON.stringify(tracks, null, 2) + "\n");
console.log(`Cleaned ${cleaned} tracks (removed peakPosition, weeksOnChart, funFact)`);
console.log(`Total tracks: ${tracks.length}`);
