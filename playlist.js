// ─── Chart Wars — Playlist Export Module ──────────────────────────────────────
// Exports game tracks as playlists to Spotify (OAuth PKCE), or as a copyable text list.
// Fully client-side — no backend needed.

const Playlist = {

    // ── Configuration ─────────────────────────────────────────────────────────
    // Replace with your own Spotify app's Client ID from https://developer.spotify.com/dashboard
    SPOTIFY_CLIENT_ID: "18989ccb54b34abbb01e328a16558c83",
    SPOTIFY_REDIRECT_URI: window.location.origin + window.location.pathname,
    SPOTIFY_SCOPES: "playlist-modify-public playlist-modify-private",

    // Internal state
    _accessToken: null,
    _codeVerifier: null,

    // ── PKCE Helpers ──────────────────────────────────────────────────────────
    _generateRandomString(length) {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
        const values = crypto.getRandomValues(new Uint8Array(length));
        return Array.from(values, v => chars[v % chars.length]).join("");
    },

    async _sha256(plain) {
        const encoder = new TextEncoder();
        const data = encoder.encode(plain);
        return await crypto.subtle.digest("SHA-256", data);
    },

    _base64urlEncode(buffer) {
        const bytes = new Uint8Array(buffer);
        let str = "";
        bytes.forEach(b => str += String.fromCharCode(b));
        return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    },

    async _generateCodeChallenge(verifier) {
        const hash = await Playlist._sha256(verifier);
        return Playlist._base64urlEncode(hash);
    },

    // ── Spotify OAuth PKCE Flow ───────────────────────────────────────────────

    async authorizeSpotify() {
        if (Playlist.SPOTIFY_CLIENT_ID === "YOUR_SPOTIFY_CLIENT_ID_HERE") {
            alert("Spotify Client ID not configured. Register a free app at developer.spotify.com and set SPOTIFY_CLIENT_ID in playlist.js");
            return false;
        }

        const codeVerifier = Playlist._generateRandomString(64);
        const codeChallenge = await Playlist._generateCodeChallenge(codeVerifier);

        // Store verifier for the callback
        sessionStorage.setItem("spotify_code_verifier", codeVerifier);
        sessionStorage.setItem("spotify_return_action", "playlist_export");

        const params = new URLSearchParams({
            client_id: Playlist.SPOTIFY_CLIENT_ID,
            response_type: "code",
            redirect_uri: Playlist.SPOTIFY_REDIRECT_URI,
            scope: Playlist.SPOTIFY_SCOPES,
            code_challenge_method: "S256",
            code_challenge: codeChallenge,
            state: Playlist._generateRandomString(16)
        });

        window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
        return true;
    },

    async handleSpotifyCallback() {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const error = params.get("error");

        if (error) {
            console.error("Spotify auth error:", error);
            return null;
        }

        if (!code) return null;

        const codeVerifier = sessionStorage.getItem("spotify_code_verifier");
        if (!codeVerifier) {
            console.error("No code verifier found");
            return null;
        }

        // Exchange code for token
        try {
            const response = await fetch("https://accounts.spotify.com/api/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    client_id: Playlist.SPOTIFY_CLIENT_ID,
                    grant_type: "authorization_code",
                    code: code,
                    redirect_uri: Playlist.SPOTIFY_REDIRECT_URI,
                    code_verifier: codeVerifier
                })
            });

            const data = await response.json();

            if (data.access_token) {
                Playlist._accessToken = data.access_token;
                sessionStorage.removeItem("spotify_code_verifier");

                // Clean URL
                window.history.replaceState({}, document.title, window.location.pathname);

                return data.access_token;
            } else {
                console.error("Token exchange failed:", data);
                return null;
            }
        } catch (e) {
            console.error("Token exchange error:", e);
            return null;
        }
    },

    // ── Spotify API Helpers ───────────────────────────────────────────────────

    async _spotifyGet(endpoint) {
        const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
            headers: { "Authorization": `Bearer ${Playlist._accessToken}` }
        });
        if (!res.ok) throw new Error(`Spotify API error: ${res.status}`);
        return res.json();
    },

    async _spotifyPost(endpoint, body) {
        const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${Playlist._accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`Spotify API error: ${res.status}`);
        return res.json();
    },

    // ── Create Spotify Playlist ───────────────────────────────────────────────

    async exportToSpotify(tracks, playlistName) {
        if (!Playlist._accessToken) {
            // Need to authorize first
            // Store tracks and name for after redirect
            sessionStorage.setItem("spotify_pending_tracks", JSON.stringify(tracks.map(t => ({
                title: t.title,
                artist: t.artist
            }))));
            sessionStorage.setItem("spotify_pending_name", playlistName);
            await Playlist.authorizeSpotify();
            return null; // Page will redirect
        }

        try {
            // 1. Get user ID
            const user = await Playlist._spotifyGet("/me");
            const userId = user.id;

            // 2. Create playlist
            const today = new Date().toLocaleDateString("en-GB", {
                day: "numeric", month: "short", year: "numeric"
            });
            const name = playlistName || `Chart Wars — ${today}`;

            const playlist = await Playlist._spotifyPost(`/users/${userId}/playlists`, {
                name: name,
                description: `Chart Wars game playlist — ${tracks.length} tracks from the quiz. Created ${today}.`,
                public: false
            });

            // 3. Search for each track and collect URIs
            const uris = [];
            const notFound = [];

            for (const track of tracks) {
                try {
                    const query = encodeURIComponent(`artist:${track.artist} track:${track.title}`);
                    const results = await Playlist._spotifyGet(`/search?q=${query}&type=track&limit=3`);

                    if (results.tracks && results.tracks.items.length > 0) {
                        uris.push(results.tracks.items[0].uri);
                    } else {
                        // Try a broader search without field filters
                        const broadQuery = encodeURIComponent(`${track.artist} ${track.title}`);
                        const broadResults = await Playlist._spotifyGet(`/search?q=${broadQuery}&type=track&limit=3`);

                        if (broadResults.tracks && broadResults.tracks.items.length > 0) {
                            uris.push(broadResults.tracks.items[0].uri);
                        } else {
                            notFound.push(`${track.artist} — ${track.title}`);
                        }
                    }

                    // Small delay between searches to be respectful
                    await new Promise(r => setTimeout(r, 100));
                } catch (e) {
                    notFound.push(`${track.artist} — ${track.title}`);
                }
            }

            // 4. Add tracks to playlist (Spotify allows max 100 per request)
            if (uris.length > 0) {
                for (let i = 0; i < uris.length; i += 100) {
                    const batch = uris.slice(i, i + 100);
                    await Playlist._spotifyPost(`/playlists/${playlist.id}/tracks`, {
                        uris: batch
                    });
                }
            }

            return {
                success: true,
                playlistUrl: playlist.external_urls.spotify,
                tracksAdded: uris.length,
                tracksNotFound: notFound,
                playlistName: name
            };

        } catch (e) {
            console.error("Spotify export error:", e);
            return {
                success: false,
                error: e.message
            };
        }
    },

    // ── Resume After Spotify Redirect ─────────────────────────────────────────

    async resumeAfterRedirect() {
        const token = await Playlist.handleSpotifyCallback();
        if (!token) return null;

        const pendingTracks = sessionStorage.getItem("spotify_pending_tracks");
        const pendingName = sessionStorage.getItem("spotify_pending_name");

        if (pendingTracks) {
            const tracks = JSON.parse(pendingTracks);
            const name = pendingName || "Chart Wars Playlist";

            sessionStorage.removeItem("spotify_pending_tracks");
            sessionStorage.removeItem("spotify_pending_name");

            return await Playlist.exportToSpotify(tracks, name);
        }

        return null;
    },

    // ── Copy Track List (No Auth Fallback) ────────────────────────────────────

    copyTrackList(tracks, platform = "spotify") {
        const lines = tracks.map(t => {
            const base = `${t.artist} — ${t.title} (${t.year})`;
            if (platform === "spotify") {
                return `${base}\nhttps://open.spotify.com/search/${encodeURIComponent(t.artist + " " + t.title)}`;
            } else if (platform === "apple") {
                return `${base}\nhttps://music.apple.com/search?term=${encodeURIComponent(t.artist + " " + t.title)}`;
            } else if (platform === "youtube") {
                return `${base}\nhttps://music.youtube.com/search?q=${encodeURIComponent(t.artist + " " + t.title)}`;
            }
            return base;
        });

        const text = `Chart Wars Playlist\n${"─".repeat(40)}\n\n${lines.join("\n\n")}`;

        navigator.clipboard.writeText(text).then(() => {
            alert("Track list copied to clipboard!");
        }).catch(() => {
            // Fallback: show in a prompt
            prompt("Copy this track list:", text);
        });

        return text;
    },

    // ── Apple Music (Stub — requires developer enrollment) ────────────────────

    async exportToAppleMusic(tracks, playlistName) {
        console.log("Apple Music export not yet implemented. Requires Apple Developer enrollment and MusicKit JS token.");
        alert("Apple Music export coming soon. Use 'Copy List' for now and search each track manually.");
        return { success: false, error: "Not implemented" };
    },

    // ── YouTube Music (Stub — requires Google OAuth) ──────────────────────────

    async exportToYouTube(tracks, playlistName) {
        console.log("YouTube Music export not yet implemented. Requires YouTube Data API v3 and Google OAuth.");
        alert("YouTube Music export coming soon. Use 'Copy List' for now and search each track manually.");
        return { success: false, error: "Not implemented" };
    }
};

// ── Auto-handle Spotify redirect on page load ─────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
    if (window.location.search.includes("code=")) {
        const result = await Playlist.resumeAfterRedirect();
        if (result && result.success) {
            alert(`Playlist "${result.playlistName}" created with ${result.tracksAdded} tracks!\n\nOpen it: ${result.playlistUrl}`);
        } else if (result && !result.success) {
            alert(`Playlist export failed: ${result.error}`);
        }
    }
});
