#!/usr/bin/env node
// ─── Chart Wars — Fun Facts Generator ─────────────────────────────────────────
// Enriches tracks.json with AI-generated fun facts.
// Usage:
//   node generate-facts.js                          # Process all tracks, Anthropic
//   node generate-facts.js --provider openai        # Use OpenAI instead
//   node generate-facts.js --limit 10               # Only process first 10
//   node generate-facts.js --dry-run                # Preview without API calls
//
// Env vars:
//   ANTHROPIC_API_KEY  — for Claude (default)
//   OPENAI_API_KEY     — for OpenAI

const fs = require("fs");
const path = require("path");

// ── Parse CLI args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flags = {
    provider: "anthropic",
    limit: 0,
    dryRun: false,
    inputFile: path.join(__dirname, "..", "data", "tracks.json"),
};

for (let i = 0; i < args.length; i++) {
    if (args[i] === "--provider" && args[i + 1]) {
        flags.provider = args[++i].toLowerCase();
    } else if (args[i] === "--limit" && args[i + 1]) {
        flags.limit = parseInt(args[++i]);
    } else if (args[i] === "--dry-run") {
        flags.dryRun = true;
    } else if (args[i] === "--input" && args[i + 1]) {
        flags.inputFile = args[++i];
    }
}

// ── LLM API Callers ───────────────────────────────────────────────────────────

async function callAnthropic(prompt) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable not set");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
            model: "claude-sonnet-4-5-20250929",
            max_tokens: 100,
            messages: [{ role: "user", content: prompt }]
        })
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Anthropic API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    return data.content[0].text.trim();
}

async function callOpenAI(prompt) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY environment variable not set");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: "gpt-4o-mini",
            max_tokens: 100,
            messages: [{ role: "user", content: prompt }]
        })
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenAI API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    return data.choices[0].message.content.trim();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    console.log(`\n🎵 Chart Wars — Fun Facts Generator`);
    console.log(`   Provider: ${flags.provider}`);
    console.log(`   Input: ${flags.inputFile}`);
    console.log(`   Limit: ${flags.limit || "all"}`);
    console.log(`   Dry run: ${flags.dryRun}\n`);

    // Load tracks
    if (!fs.existsSync(flags.inputFile)) {
        console.error(`❌ File not found: ${flags.inputFile}`);
        process.exit(1);
    }

    const tracks = JSON.parse(fs.readFileSync(flags.inputFile, "utf8"));
    console.log(`📀 Loaded ${tracks.length} tracks\n`);

    // Filter to tracks that need better facts (chart-derived defaults)
    const needsFact = tracks.filter(t =>
        !t.funFact ||
        t.funFact.startsWith("Spent") ||
        t.funFact.startsWith("Peaked") ||
        t.funFact.startsWith("Entered")
    );

    const toProcess = flags.limit > 0 ? needsFact.slice(0, flags.limit) : needsFact;
    console.log(`🔍 ${needsFact.length} tracks need better facts, processing ${toProcess.length}\n`);

    const callLLM = flags.provider === "openai" ? callOpenAI : callAnthropic;

    let processed = 0;
    let errors = 0;

    for (const track of toProcess) {
        const prompt = `Give me one surprising, fun, short fact (under 30 words) about the song "${track.title}" by ${track.artist} (${track.year}). Focus on recording trivia, cultural impact, or unexpected history. Just the fact, no quotes or prefixes.`;

        if (flags.dryRun) {
            console.log(`  [DRY RUN] ${track.artist} — "${track.title}" (${track.year})`);
            console.log(`    Prompt: ${prompt}\n`);
            processed++;
            continue;
        }

        try {
            process.stdout.write(`  ${track.artist} — "${track.title}" (${track.year})...`);
            const fact = await callLLM(prompt);

            // Find this track in the original array and update it
            const idx = tracks.findIndex(t => t.title === track.title && t.artist === track.artist && t.year === track.year);
            if (idx !== -1) {
                tracks[idx].funFact = fact;
                console.log(` ✅`);
                console.log(`    → ${fact}\n`);
            }

            processed++;

            // Rate limit delay
            await new Promise(r => setTimeout(r, 500));

        } catch (e) {
            console.log(` ❌ ${e.message}\n`);
            errors++;
        }
    }

    // Save
    if (!flags.dryRun && processed > 0) {
        fs.writeFileSync(flags.inputFile, JSON.stringify(tracks, null, 2), "utf8");
        console.log(`\n💾 Saved updated tracks.json`);
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Processed: ${processed}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Skipped (already had good facts): ${tracks.length - needsFact.length}`);
    console.log(`\n✨ Done!\n`);
}

main().catch(e => {
    console.error("Fatal error:", e.message);
    process.exit(1);
});
