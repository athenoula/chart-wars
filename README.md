# Chart Wars

A music quiz game built with vanilla JavaScript and Firebase. Players listen to 30-second Spotify preview clips and score points by correctly identifying the artist, track title, and release year.

**786 tracks** spanning UK chart hits and all-time classics from 1942 to 2026.

---

## Game Modes

### Solo Play

**Challenge**
Pass-and-play on a single device. Teams take turns entering answers (artist, title, year) before the answers are revealed and scored together. Great for groups without their own devices.

**Solo**
One player answers all tracks alone. Scores are saved to the leaderboard ranked by percentage of maximum possible points.

**Survival**
Three lives. Each round you must correctly name the artist or track title — get neither and you lose a life. The game ends when all lives are gone. Scores saved to a separate survival leaderboard ranked by total points.

### Multiplayer (Firebase)

**Teams**
Everyone joins on their own device in the same room. Players scan a QR code or enter a room code at `player.html`. The host controls playback and all players answer simultaneously on their own phones.

**Remote**
Same as Teams but played from different locations. Share the room code or join URL and compete in real time anywhere.

In both multiplayer modes the host also participates — entering their own artist/title/year answers alongside remote players.

---

## Scoring

| Category | Full | Partial | Wrong |
|----------|------|---------|-------|
| Artist | 3 pts — exact or very close match | 1.5 pts — partial Levenshtein match | 0 |
| Title | 3 pts — exact or very close match | 1.5 pts — partial match | 0 |
| Year | 2 pts — exact | 1 pt — correct decade; 1 pt — within 1 year (stackable) | 0 |

Maximum per round: **8 points**

Remastered/remix/version suffixes in track titles are automatically stripped before matching (e.g. "Song Title - 2012 Remaster" matches "Song Title").

---

## Contesting Answers

On the reveal screen each team's result card has a **Contest** button. Clicking it opens a dialog where the player can explain why they believe their answer deserves points (e.g. alternative artist name, accepted abbreviation, close enough spelling).

Pending contests appear below the result cards. The host can **Award Points** (choose how many) or **Dismiss** each one. All contested answers — and their outcome — are logged to `localStorage` under `chartWarsContests` for later review.

---

## Setup

### Prerequisites

- A local web server (preview clips won't load over `file://`)
- A Firebase project with Realtime Database enabled (for multiplayer)

### Running Locally

```bash
npx serve .
# then open http://localhost:3000
```

### Firebase Configuration

1. Create a project at [firebase.google.com](https://firebase.google.com)
2. Enable **Realtime Database** and set rules to allow read/write during development
3. Copy your web app config into `firebase-config.js`

```js
firebase.initializeApp({
  apiKey: "...",
  authDomain: "...",
  databaseURL: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
});
```

Firebase web API keys are designed to be public — secure your database by adding HTTP referrer restrictions in the Google Cloud console and tightening your database rules before going live.

---

## Project Structure

```
chart-wars/
├── index.html          # Main game UI and screens
├── player.html         # Remote player join page
├── game.js             # Core game logic, screen flow, scoring integration
├── scoring.js          # Fuzzy matching (Levenshtein) and point calculation
├── multiplayer.js      # Firebase Realtime Database interface
├── leaderboard.js      # localStorage leaderboard (solo + survival)
├── playlist.js         # Spotify / Apple Music / YouTube export
├── firebase-config.js  # Firebase initialisation (not committed)
├── retro-grid.js       # Animated background canvas
├── style.css           # All styling
└── data/
    └── tracks.json     # 786 track records with Spotify preview URLs
```

---

## Track Data

Each track record:
```json
{
  "title": "Bohemian Rhapsody",
  "artist": "Queen",
  "year": 1975,
  "previewUrl": "https://p.scdn.co/...",
  "albumArt": "https://i.scdn.co/..."
}
```

Tracks without a Spotify preview URL are filtered out at load time. Track history is stored in `localStorage` so previously heard tracks aren't repeated across sessions until the pool is exhausted.
