#!/usr/bin/env node
// Add manually specified tracks to the dataset
// Usage: node build/add-tracks.js

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
function deriveRelatedArtists(artistStr) {
    const parts = artistStr.split(ARTIST_SPLIT_RE).map(p => p.trim()).filter(p => p.length > 0);
    return parts.length > 1 ? parts : [];
}

async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url);
            if (res.ok) return res;
            if (res.status === 403 || res.status === 429) {
                const wait = 1000 * Math.pow(2, i);
                process.stdout.write(` (retry ${wait}ms)`);
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

// ── Tracks to add ──────────────────────────────────────────────────────────

const NEW_TRACKS = [
    // Most-played 301-400
    { title: "Life in the Fast Lane", artist: "Eagles", year: 1977 },
    { title: "Baby", artist: "Justin Bieber featuring Ludacris", year: 2010 },
    { title: "The Times They Are a-Changin'", artist: "Bob Dylan", year: 1964 },
    { title: "Everybody Hurts", artist: "R.E.M.", year: 1993 },
    { title: "Only Time", artist: "Enya", year: 2000 },
    { title: "Kiss", artist: "Prince and the Revolution", year: 1986 },
    { title: "Thank You", artist: "Dido", year: 2001 },
    { title: "We Didn't Start the Fire", artist: "Billy Joel", year: 1989 },
    { title: "Tragedy", artist: "Bee Gees", year: 1979 },
    { title: "Sweet Emotion", artist: "Aerosmith", year: 1975 },
    { title: "Into the Groove", artist: "Madonna", year: 1985 },
    { title: "Let's Groove", artist: "Earth, Wind & Fire", year: 1981 },
    { title: "Bad Romance", artist: "Lady Gaga", year: 2009 },
    { title: "Bed of Roses", artist: "Bon Jovi", year: 1993 },
    { title: "Boogie Wonderland", artist: "Earth, Wind & Fire", year: 1979 },
    { title: "Complicated", artist: "Avril Lavigne", year: 2002 },
    { title: "In My Life", artist: "The Beatles", year: 1965 },
    { title: "The Winner Takes It All", artist: "ABBA", year: 1980 },
    { title: "Cryin'", artist: "Aerosmith", year: 1993 },
    { title: "Sacrifice", artist: "Elton John", year: 1989 },
    { title: "Can't Buy Me Love", artist: "The Beatles", year: 1964 },
    { title: "Get Back", artist: "The Beatles", year: 1969 },
    { title: "I'm on Fire", artist: "Bruce Springsteen", year: 1985 },
    { title: "Jamming", artist: "Bob Marley", year: 1977 },
    { title: "Highway Star", artist: "Deep Purple", year: 1972 },
    { title: "If I Ain't Got You", artist: "Alicia Keys", year: 2004 },
    { title: "Endless Love", artist: "Diana Ross & Lionel Richie", year: 1981 },
    { title: "Papa Don't Preach", artist: "Madonna", year: 1986 },
    { title: "Quit Playin' Games (with My Heart)", artist: "Backstreet Boys", year: 1997 },
    { title: "Rock and Roll", artist: "Led Zeppelin", year: 1972 },
    { title: "Love Story", artist: "Taylor Swift", year: 2008 },
    { title: "Let's Dance", artist: "David Bowie", year: 1983 },
    { title: "Killer Queen", artist: "Queen", year: 1974 },
    { title: "Tell Him", artist: "Barbra Streisand & Celine Dion", year: 1997 },
    { title: "Blinding Lights", artist: "The Weeknd", year: 2020 },
    { title: "Roadhouse Blues", artist: "The Doors", year: 1970 },
    { title: "Dynamite", artist: "BTS", year: 2020 },
    { title: "Where Is the Love?", artist: "Black Eyed Peas featuring Justin Timberlake", year: 2003 },
    { title: "Breakfast in America", artist: "Supertramp", year: 1979 },
    { title: "I Can't Dance", artist: "Genesis", year: 1991 },
    { title: "Evil Ways", artist: "Santana", year: 1969 },
    { title: "Iron Man", artist: "Black Sabbath", year: 1970 },
    { title: "Genie in a Bottle", artist: "Christina Aguilera", year: 1999 },
    { title: "Strangers in the Night", artist: "Frank Sinatra", year: 1966 },
    { title: "Frozen", artist: "Madonna", year: 1998 },
    { title: "Come Fly with Me", artist: "Frank Sinatra", year: 1958 },
    { title: "Wild Horses", artist: "The Rolling Stones", year: 1971 },
    { title: "Bad", artist: "Michael Jackson", year: 1987 },
    { title: "Theme from New York, New York", artist: "Frank Sinatra", year: 1980 },
    { title: "Burning Love", artist: "Elvis Presley", year: 1972 },
    { title: "Love the Way You Lie", artist: "Eminem featuring Rihanna", year: 2010 },
    { title: "All My Loving", artist: "The Beatles", year: 1963 },
    { title: "Any Man of Mine", artist: "Shania Twain", year: 1995 },
    { title: "It's Still Rock and Roll to Me", artist: "Billy Joel", year: 1980 },
    { title: "Black", artist: "Pearl Jam", year: 1991 },
    { title: "If I Could Turn Back Time", artist: "Cher", year: 1989 },
    { title: "The Show Must Go On", artist: "Queen", year: 1991 },
    { title: "Heroes", artist: "David Bowie", year: 1977 },
    { title: "You Oughta Know", artist: "Alanis Morissette", year: 1995 },
    { title: "Remember the Time", artist: "Michael Jackson", year: 1992 },
    { title: "Hung Up", artist: "Madonna", year: 2005 },
    { title: "Don't Cry", artist: "Guns N' Roses", year: 1991 },
    { title: "Candle in the Wind", artist: "Elton John", year: 1973 },
    { title: "We Belong Together", artist: "Mariah Carey", year: 2005 },
    { title: "She Loves You", artist: "The Beatles", year: 1963 },
    { title: "The River", artist: "Bruce Springsteen", year: 1980 },
    { title: "Can't Get You Out of My Head", artist: "Kylie Minogue", year: 2001 },
    { title: "P.Y.T. (Pretty Young Thing)", artist: "Michael Jackson", year: 1983 },
    { title: "In the Ghetto", artist: "Elvis Presley", year: 1969 },
    { title: "People Are Strange", artist: "The Doors", year: 1967 },
    { title: "My Sweet Lord", artist: "George Harrison", year: 1970 },
    { title: "Give a Little Bit", artist: "Supertramp", year: 1977 },
    { title: "Pride (In the Name of Love)", artist: "U2", year: 1984 },
    { title: "ABC", artist: "The Jackson 5", year: 1970 },
    { title: "Greatest Love of All", artist: "Whitney Houston", year: 1986 },
    { title: "Crazy Little Thing Called Love", artist: "Queen", year: 1979 },
    { title: "I Saw Her Standing There", artist: "The Beatles", year: 1963 },
    { title: "That's Life", artist: "Frank Sinatra", year: 1966 },
    { title: "God Only Knows", artist: "The Beach Boys", year: 1966 },
    { title: "The River of Dreams", artist: "Billy Joel", year: 1993 },
    { title: "Landslide", artist: "Fleetwood Mac", year: 1975 },
    { title: "Linger", artist: "The Cranberries", year: 1993 },
    { title: "She's Always a Woman", artist: "Billy Joel", year: 1977 },
    { title: "Sailing", artist: "Rod Stewart", year: 1975 },
    { title: "White Flag", artist: "Dido", year: 2003 },
    { title: "Romeo and Juliet", artist: "Dire Straits", year: 1980 },
    { title: "Run to the Hills", artist: "Iron Maiden", year: 1982 },
    { title: "Hot Blooded", artist: "Foreigner", year: 1978 },
    { title: "Umbrella", artist: "Rihanna featuring Jay-Z", year: 2007 },
    { title: "Hurricane", artist: "Bob Dylan", year: 1976 },
    { title: "Mockingbird", artist: "Eminem", year: 2005 },
    { title: "The Chain", artist: "Fleetwood Mac", year: 1977 },
    { title: "Vision of Love", artist: "Mariah Carey", year: 1990 },
    { title: "Blank Space", artist: "Taylor Swift", year: 2014 },

    // Most-played 401-500
    { title: "Can't Find My Way Home", artist: "Blind Faith", year: 1969 },
    { title: "Child in Time", artist: "Deep Purple", year: 1970 },
    { title: "One Love / People Get Ready", artist: "Bob Marley", year: 1977 },
    { title: "If Tomorrow Never Comes", artist: "Garth Brooks", year: 1989 },
    { title: "My Life", artist: "Billy Joel", year: 1978 },
    { title: "Because of You", artist: "Kelly Clarkson", year: 2005 },
    { title: "You Are Not Alone", artist: "Michael Jackson", year: 1995 },
    { title: "Don't Let the Sun Go Down on Me", artist: "Elton John", year: 1974 },
    { title: "Good Riddance (Time of Your Life)", artist: "Green Day", year: 1997 },
    { title: "Come Away with Me", artist: "Norah Jones", year: 2002 },
    { title: "Space Oddity", artist: "David Bowie", year: 1969 },
    { title: "Juke Box Hero", artist: "Foreigner", year: 1981 },
    { title: "I Say a Little Prayer", artist: "Aretha Franklin", year: 1968 },
    { title: "One Sweet Day", artist: "Boyz II Men & Mariah Carey", year: 1995 },
    { title: "My Immortal", artist: "Evanescence", year: 2003 },
    { title: "Lucy in the Sky with Diamonds", artist: "The Beatles", year: 1967 },
    { title: "Otherside", artist: "Red Hot Chili Peppers", year: 2000 },
    { title: "Hero", artist: "Enrique Iglesias", year: 2001 },
    { title: "And I Love Her", artist: "The Beatles", year: 1964 },
    { title: "Earth Song", artist: "Michael Jackson", year: 1995 },
    { title: "Samba Pa Ti", artist: "Santana", year: 1970 },
    { title: "Kashmir", artist: "Led Zeppelin", year: 1975 },
    { title: "Tearin' Up My Heart", artist: "NSYNC", year: 1997 },
    { title: "Blackbird", artist: "The Beatles", year: 1968 },
    { title: "I Shot the Sheriff", artist: "Eric Clapton", year: 1974 },
    { title: "Faithfully", artist: "Journey", year: 1983 },
    { title: "All You Need Is Love", artist: "The Beatles", year: 1967 },
    { title: "Eight Days a Week", artist: "The Beatles", year: 1964 },
    { title: "Lithium", artist: "Nirvana", year: 1992 },
    { title: "I'm Still Standing", artist: "Elton John", year: 1983 },
    { title: "Alive", artist: "Pearl Jam", year: 1991 },
    { title: "Forever in Blue Jeans", artist: "Neil Diamond", year: 1979 },
    { title: "The Sign", artist: "Ace of Base", year: 1993 },
    { title: "Don't Stand So Close to Me", artist: "The Police", year: 1980 },
    { title: "Knockin' on Heaven's Door", artist: "Bob Dylan", year: 1973 },
    { title: "Have I Told You Lately", artist: "Rod Stewart", year: 1993 },
    { title: "Yellow Submarine", artist: "The Beatles", year: 1966 },
    { title: "Moves Like Jagger", artist: "Maroon 5 featuring Christina Aguilera", year: 2011 },
    { title: "Crocodile Rock", artist: "Elton John", year: 1972 },
    { title: "For What It's Worth", artist: "Buffalo Springfield", year: 1967 },
    { title: "Our House", artist: "Crosby, Stills, Nash & Young", year: 1970 },
    { title: "Photograph", artist: "Def Leppard", year: 1983 },
    { title: "Doo Wop (That Thing)", artist: "Lauryn Hill", year: 1998 },
    { title: "I Got You Babe", artist: "Sonny & Cher", year: 1965 },
    { title: "Chiquitita", artist: "ABBA", year: 1979 },
    { title: "Don't Know Why", artist: "Norah Jones", year: 2002 },
    { title: "Personal Jesus", artist: "Depeche Mode", year: 1989 },
    { title: "Clint Eastwood", artist: "Gorillaz", year: 2001 },
    { title: "Rhiannon", artist: "Fleetwood Mac", year: 1975 },
    { title: "Breathe", artist: "Pink Floyd", year: 1973 },
    { title: "Cracklin' Rosie", artist: "Neil Diamond", year: 1970 },
    { title: "That's All", artist: "Genesis", year: 1983 },
    { title: "Fields of Gold", artist: "Sting", year: 1993 },
    { title: "Give Me One Reason", artist: "Tracy Chapman", year: 1996 },
    { title: "Sir Duke", artist: "Stevie Wonder", year: 1977 },
    { title: "Suite: Judy Blue Eyes", artist: "Crosby, Stills & Nash", year: 1969 },
    { title: "Everlong", artist: "Foo Fighters", year: 1997 },
    { title: "Me and Julio Down by the Schoolyard", artist: "Paul Simon", year: 1972 },
    { title: "Just Give Me a Reason", artist: "P!nk featuring Nate Ruess", year: 2013 },
    { title: "My All", artist: "Mariah Carey", year: 1998 },
    { title: "You Should Be Dancing", artist: "Bee Gees", year: 1976 },
    { title: "California Love", artist: "2Pac featuring Dr. Dre", year: 1996 },
    { title: "Buffalo Soldier", artist: "Bob Marley", year: 1983 },
    { title: "Shake It Off", artist: "Taylor Swift", year: 2014 },
    { title: "No Ordinary Love", artist: "Sade", year: 1992 },
    { title: "Somethin' Stupid", artist: "Frank Sinatra", year: 1967 },
    { title: "Hysteria", artist: "Def Leppard", year: 1987 },
    { title: "Heal the World", artist: "Michael Jackson", year: 1992 },
    { title: "Beauty and the Beast", artist: "Celine Dion & Peabo Bryson", year: 1991 },
    { title: "Rodeo", artist: "Garth Brooks", year: 1991 },
    { title: "Love Me Tender", artist: "Elvis Presley", year: 1956 },
    { title: "Sugar", artist: "Maroon 5", year: 2015 },
    { title: "All by Myself", artist: "Celine Dion", year: 1996 },
    { title: "Shoot to Thrill", artist: "AC/DC", year: 1980 },
    { title: "Boy with Luv", artist: "BTS featuring Halsey", year: 2019 },
    { title: "Happy Xmas (War Is Over)", artist: "John Lennon", year: 1971 },
    { title: "Hollaback Girl", artist: "Gwen Stefani", year: 2005 },
    { title: "Two Out of Three Ain't Bad", artist: "Meat Loaf", year: 1978 },
    { title: "The Unforgiven", artist: "Metallica", year: 1991 },
    { title: "You Belong with Me", artist: "Taylor Swift", year: 2009 },
    { title: "When I Was Your Man", artist: "Bruno Mars", year: 2013 },
    { title: "We Found Love", artist: "Rihanna featuring Calvin Harris", year: 2011 },
    { title: "Honky Tonk Women", artist: "The Rolling Stones", year: 1969 },
    { title: "So What", artist: "P!nk", year: 2008 },
    { title: "The Sweetest Taboo", artist: "Sade", year: 1985 },
    { title: "Rainy Days and Mondays", artist: "Carpenters", year: 1971 },
    { title: "Photograph", artist: "Ed Sheeran", year: 2015 },
    { title: "Proud Mary", artist: "Creedence Clearwater Revival", year: 1969 },
    { title: "Lyin' Eyes", artist: "Eagles", year: 1975 },
    { title: "Panama", artist: "Van Halen", year: 1984 },
    { title: "Boulevard of Broken Dreams", artist: "Green Day", year: 2004 },
    { title: "Wanna Be Startin' Somethin'", artist: "Michael Jackson", year: 1983 },
    { title: "To Love Somebody", artist: "Bee Gees", year: 1967 },
    { title: "Chop Suey!", artist: "System of a Down", year: 2001 },
    { title: "SexyBack", artist: "Justin Timberlake featuring Timbaland", year: 2006 },
    { title: "Lay Lady Lay", artist: "Bob Dylan", year: 1969 },

    // Most-played 251-300
    { title: "Fallin'", artist: "Alicia Keys", year: 2001 },
    { title: "Toxic", artist: "Britney Spears", year: 2004 },
    { title: "Brothers in Arms", artist: "Dire Straits", year: 1985 },
    { title: "Could You Be Loved", artist: "Bob Marley", year: 1980 },
    { title: "Take a Chance on Me", artist: "ABBA", year: 1978 },
    { title: "Hound Dog", artist: "Elvis Presley", year: 1956 },
    { title: "One of These Nights", artist: "Eagles", year: 1975 },
    { title: "When Doves Cry", artist: "Prince and the Revolution", year: 1984 },
    { title: "Immigrant Song", artist: "Led Zeppelin", year: 1970 },
    { title: "Gimme Shelter", artist: "The Rolling Stones", year: 1969 },
    { title: "Even Flow", artist: "Pearl Jam", year: 1991 },
    { title: "Baby Love", artist: "The Supremes", year: 1964 },
    { title: "As Long as You Love Me", artist: "Backstreet Boys", year: 1997 },
    { title: "The Trooper", artist: "Iron Maiden", year: 1983 },
    { title: "Stan", artist: "Eminem featuring Dido", year: 2000 },
    { title: "Hey Joe", artist: "Jimi Hendrix Experience", year: 1966 },
    { title: "She Will Be Loved", artist: "Maroon 5", year: 2004 },
    { title: "Good Times Bad Times", artist: "Led Zeppelin", year: 1969 },
    { title: "Crazy Train", artist: "Ozzy Osbourne", year: 1980 },
    { title: "Radio Ga Ga", artist: "Queen", year: 1984 },
    { title: "Ramble On", artist: "Led Zeppelin", year: 1969 },
    { title: "Love Me Do", artist: "The Beatles", year: 1962 },
    { title: "Bye Bye Bye", artist: "NSYNC", year: 2000 },
    { title: "Emotions", artist: "Mariah Carey", year: 1991 },
    { title: "Good Days", artist: "SZA", year: 2020 },
    { title: "White Room", artist: "Cream", year: 1968 },
    { title: "The Thunder Rolls", artist: "Garth Brooks", year: 1991 },
    { title: "Brown Sugar", artist: "The Rolling Stones", year: 1971 },
    { title: "Beautiful Boy (Darling Boy)", artist: "John Lennon", year: 1980 },
    { title: "Back for Good", artist: "Take That", year: 1995 },
    { title: "Wanted Dead or Alive", artist: "Bon Jovi", year: 1987 },
    { title: "Hells Bells", artist: "AC/DC", year: 1980 },
    { title: "I Don't Want to Talk About It", artist: "Rod Stewart", year: 1977 },
    { title: "Something", artist: "The Beatles", year: 1969 },
    { title: "Set Fire to the Rain", artist: "Adele", year: 2011 },
    { title: "Orinoco Flow", artist: "Enya", year: 1988 },
    { title: "Holiday", artist: "Madonna", year: 1983 },
    { title: "T.N.T.", artist: "AC/DC", year: 1975 },
    { title: "For Those About to Rock (We Salute You)", artist: "AC/DC", year: 1981 },
    { title: "Dirty Deeds Done Dirt Cheap", artist: "AC/DC", year: 1976 },
    { title: "Patience", artist: "Guns N' Roses", year: 1989 },
    { title: "Waterloo", artist: "ABBA", year: 1974 },
    { title: "Invisible Touch", artist: "Genesis", year: 1986 },
    { title: "Numb/Encore", artist: "Jay-Z & Linkin Park", year: 2004 },
    { title: "Perfect", artist: "Ed Sheeran", year: 2017 },
    { title: "One More Night", artist: "Phil Collins", year: 1985 },
    { title: "Bat Out of Hell", artist: "Meat Loaf", year: 1977 },
    { title: "A Hard Day's Night", artist: "The Beatles", year: 1964 },

    // Most-played 201-249
    { title: "Born to Run", artist: "Bruce Springsteen", year: 1975 },
    { title: "Californication", artist: "Red Hot Chili Peppers", year: 1999 },
    { title: "Cocaine", artist: "Eric Clapton", year: 1977 },
    { title: "Maria Maria", artist: "Santana featuring The Product G&B", year: 1999 },
    { title: "The Dance", artist: "Garth Brooks", year: 1990 },
    { title: "Message in a Bottle", artist: "The Police", year: 1979 },
    { title: "Englishman in New York", artist: "Sting", year: 1987 },
    { title: "Smooth Operator", artist: "Sade", year: 1984 },
    { title: "Say My Name", artist: "Destiny's Child", year: 1999 },
    { title: "Help!", artist: "The Beatles", year: 1965 },
    { title: "Crazy in Love", artist: "Beyonce featuring Jay-Z", year: 2003 },
    { title: "Numb", artist: "Linkin Park", year: 2003 },
    { title: "Heart of Gold", artist: "Neil Young", year: 1972 },
    { title: "Angie", artist: "The Rolling Stones", year: 1973 },
    { title: "Don't Go Breaking My Heart", artist: "Elton John & Kiki Dee", year: 1976 },
    { title: "I Just Called to Say I Love You", artist: "Stevie Wonder", year: 1984 },
    { title: "You Don't Bring Me Flowers", artist: "Barbra Streisand", year: 1978 },
    { title: "You're Beautiful", artist: "James Blunt", year: 2005 },
    { title: "Desperado", artist: "Eagles", year: 1973 },
    { title: "Top of the World", artist: "Carpenters", year: 1972 },
    { title: "Sussudio", artist: "Phil Collins", year: 1985 },
    { title: "Cecilia", artist: "Simon & Garfunkel", year: 1970 },
    { title: "Just Can't Get Enough", artist: "Depeche Mode", year: 1981 },
    { title: "You're Still the One", artist: "Shania Twain", year: 1998 },
    { title: "Bring Me to Life", artist: "Evanescence", year: 2003 },
    { title: "Caribbean Blue", artist: "Enya", year: 1991 },
    { title: "No Woman, No Cry", artist: "Bob Marley", year: 1975 },
    { title: "Fix You", artist: "Coldplay", year: 2005 },
    { title: "They Don't Care About Us", artist: "Michael Jackson", year: 1996 },
    { title: "Angels", artist: "Robbie Williams", year: 1997 },
    { title: "Hips Don't Lie", artist: "Shakira featuring Wyclef Jean", year: 2006 },
    { title: "Crazy", artist: "Aerosmith", year: 1993 },
    { title: "Master of Puppets", artist: "Metallica", year: 1986 },
    { title: "Waterfalls", artist: "TLC", year: 1995 },
    { title: "I Get Around", artist: "The Beach Boys", year: 1964 },
    { title: "You Can Call Me Al", artist: "Paul Simon", year: 1986 },
    { title: "Every Little Thing She Does Is Magic", artist: "The Police", year: 1981 },
    { title: "Black Dog", artist: "Led Zeppelin", year: 1971 },
    { title: "Heaven", artist: "Bryan Adams", year: 1985 },
    { title: "Night Fever", artist: "Bee Gees", year: 1977 },
    { title: "Killing Me Softly", artist: "Fugees", year: 1996 },
    { title: "That's the Way Love Goes", artist: "Janet Jackson", year: 1993 },
    { title: "Proud Mary", artist: "Ike & Tina Turner", year: 1971 },
    { title: "Three Little Birds", artist: "Bob Marley", year: 1977 },
    { title: "Cold as Ice", artist: "Foreigner", year: 1977 },
    { title: "Time", artist: "Pink Floyd", year: 1973 },
    { title: "Feel", artist: "Robbie Williams", year: 2002 },
    { title: "That Don't Impress Me Much", artist: "Shania Twain", year: 1998 },

    // Most-played 101-150
    { title: "Believe", artist: "Cher", year: 1998 },
    { title: "Wonderful Tonight", artist: "Eric Clapton", year: 1977 },
    { title: "Twist and Shout", artist: "The Beatles", year: 1963 },
    { title: "Like a Virgin", artist: "Madonna", year: 1984 },
    { title: "Money", artist: "Pink Floyd", year: 1973 },
    { title: "Hero", artist: "Mariah Carey", year: 1993 },
    { title: "Sunshine of Your Love", artist: "Cream", year: 1967 },
    { title: "Mamma Mia", artist: "ABBA", year: 1975 },
    { title: "November Rain", artist: "Guns N' Roses", year: 1991 },
    { title: "Come Together", artist: "The Beatles", year: 1969 },
    { title: "One", artist: "U2", year: 1991 },
    { title: "Man in the Mirror", artist: "Michael Jackson", year: 1988 },
    { title: "Beautiful Day", artist: "U2", year: 2000 },
    { title: "My Way", artist: "Frank Sinatra", year: 1969 },
    { title: "Da Ya Think I'm Sexy?", artist: "Rod Stewart", year: 1978 },
    { title: "Whole Lotta Love", artist: "Led Zeppelin", year: 1969 },
    { title: "(I Can't Get No) Satisfaction", artist: "The Rolling Stones", year: 1965 },
    { title: "Good Vibrations", artist: "The Beach Boys", year: 1966 },
    { title: "Oops!... I Did It Again", artist: "Britney Spears", year: 2000 },
    { title: "Uptown Girl", artist: "Billy Joel", year: 1983 },
    { title: "Don't Stop 'Til You Get Enough", artist: "Michael Jackson", year: 1979 },
    { title: "Wouldn't It Be Nice", artist: "The Beach Boys", year: 1966 },
    { title: "La Isla Bonita", artist: "Madonna", year: 1987 },
    { title: "Tears in Heaven", artist: "Eric Clapton", year: 1992 },
    { title: "Light My Fire", artist: "The Doors", year: 1967 },
    { title: "(They Long to Be) Close to You", artist: "Carpenters", year: 1970 },
    { title: "Surfin' U.S.A.", artist: "The Beach Boys", year: 1963 },
    { title: "Start Me Up", artist: "The Rolling Stones", year: 1981 },
    { title: "Like a Rolling Stone", artist: "Bob Dylan", year: 1965 },
    { title: "The Way We Were", artist: "Barbra Streisand", year: 1973 },
    { title: "I Still Haven't Found What I'm Looking For", artist: "U2", year: 1987 },
    { title: "I Want to Break Free", artist: "Queen", year: 1984 },
    { title: "Without You", artist: "Mariah Carey", year: 1994 },
    { title: "Man! I Feel Like a Woman!", artist: "Shania Twain", year: 1999 },
    { title: "Purple Haze", artist: "Jimi Hendrix Experience", year: 1967 },
    { title: "Smooth Criminal", artist: "Michael Jackson", year: 1988 },
    { title: "Woman in Love", artist: "Barbra Streisand", year: 1980 },
    { title: "Fantasy", artist: "Mariah Carey", year: 1995 },
    { title: "Bennie and the Jets", artist: "Elton John", year: 1973 },
    { title: "Walk of Life", artist: "Dire Straits", year: 1985 },
    { title: "Suspicious Minds", artist: "Elvis Presley", year: 1969 },
    { title: "I'd Do Anything for Love (But I Won't Do That)", artist: "Meat Loaf", year: 1993 },
    { title: "The Power of Love", artist: "Celine Dion", year: 1993 },

    // Most-played songs of all time (radio/streaming)
    { title: "Hotel California", artist: "Eagles", year: 1977 },
    { title: "Layla", artist: "Derek and the Dominos", year: 1970 },
    { title: "Every Breath You Take", artist: "The Police", year: 1983 },
    { title: "Sweet Caroline", artist: "Neil Diamond", year: 1969 },
    { title: "Stayin' Alive", artist: "Bee Gees", year: 1977 },
    { title: "The Sound of Silence", artist: "Simon & Garfunkel", year: 1965 },
    { title: "Can't Help Falling in Love", artist: "Elvis Presley", year: 1961 },
    { title: "Stairway to Heaven", artist: "Led Zeppelin", year: 1971 },
    { title: "Maggie May", artist: "Rod Stewart", year: 1971 },
    { title: "In the Air Tonight", artist: "Phil Collins", year: 1981 },
    { title: "Let It Be", artist: "The Beatles", year: 1970 },
    { title: "With Or Without You", artist: "U2", year: 1987 },
    { title: "What's Love Got to Do with It", artist: "Tina Turner", year: 1984 },
    { title: "Under Pressure", artist: "David Bowie & Queen", year: 1981 },
    { title: "Another One Bites the Dust", artist: "Queen", year: 1980 },
    { title: "Smoke on the Water", artist: "Deep Purple", year: 1972 },
    { title: "Wish You Were Here", artist: "Pink Floyd", year: 1975 },
    { title: "Sultans of Swing", artist: "Dire Straits", year: 1978 },
    { title: "Here Comes the Sun", artist: "The Beatles", year: 1969 },
    { title: "Summer of '69", artist: "Bryan Adams", year: 1985 },
    { title: "Imagine", artist: "John Lennon", year: 1971 },
    { title: "Go Your Own Way", artist: "Fleetwood Mac", year: 1977 },
    { title: "Black Magic Woman", artist: "Santana", year: 1970 },
    { title: "Yesterday", artist: "The Beatles", year: 1965 },
    { title: "Wannabe", artist: "Spice Girls", year: 1996 },
    { title: "Sweet Child O' Mine", artist: "Guns N' Roses", year: 1987 },
    { title: "You Shook Me All Night Long", artist: "AC/DC", year: 1980 },
    { title: "Another Day in Paradise", artist: "Phil Collins", year: 1989 },
    { title: "I Want It That Way", artist: "Backstreet Boys", year: 1999 },
    { title: "Losing My Religion", artist: "R.E.M.", year: 1991 },
    { title: "Your Song", artist: "Elton John", year: 1970 },
    { title: "Black or White", artist: "Michael Jackson", year: 1991 },
    { title: "Mrs. Robinson", artist: "Simon & Garfunkel", year: 1968 },
    { title: "White Christmas", artist: "Bing Crosby", year: 1942 },
    { title: "Take It Easy", artist: "Eagles", year: 1972 },
    { title: "Like a Prayer", artist: "Madonna", year: 1989 },
    { title: "(Everything I Do) I Do It for You", artist: "Bryan Adams", year: 1991 },
    { title: "Woman", artist: "John Lennon", year: 1980 },
    { title: "More Than a Feeling", artist: "Boston", year: 1976 },
    { title: "Jailhouse Rock", artist: "Elvis Presley", year: 1957 },
    { title: "Another Brick in the Wall (Part II)", artist: "Pink Floyd", year: 1979 },
    { title: "Walk This Way", artist: "Aerosmith", year: 1975 },
    { title: "Friends in Low Places", artist: "Garth Brooks", year: 1990 },
    { title: "I Want to Hold Your Hand", artist: "The Beatles", year: 1963 },
    { title: "You Give Love a Bad Name", artist: "Bon Jovi", year: 1986 },
    { title: "Hey Jude", artist: "The Beatles", year: 1968 },
    { title: "Blue Christmas", artist: "Elvis Presley", year: 1957 },
    { title: "Someone Like You", artist: "Adele", year: 2011 },
    { title: "Fast Car", artist: "Tracy Chapman", year: 1988 },
    { title: "All Along the Watchtower", artist: "Jimi Hendrix Experience", year: 1968 },
    { title: "Wonderwall", artist: "Oasis", year: 1995 },
    { title: "Paranoid", artist: "Black Sabbath", year: 1970 },
    { title: "Zombie", artist: "The Cranberries", year: 1994 },
    { title: "Nothing Else Matters", artist: "Metallica", year: 1991 },
    { title: "Sunday Bloody Sunday", artist: "U2", year: 1983 },
    { title: "Is This Love", artist: "Bob Marley", year: 1978 },
    { title: "Paint It Black", artist: "The Rolling Stones", year: 1966 },
    { title: "Because You Loved Me", artist: "Celine Dion", year: 1996 },
    { title: "Dream On", artist: "Aerosmith", year: 1973 },
    { title: "Ironic", artist: "Alanis Morissette", year: 1996 },
    { title: "Purple Rain", artist: "Prince and the Revolution", year: 1984 },
    { title: "How Deep Is Your Love", artist: "Bee Gees", year: 1977 },
    { title: "Come As You Are", artist: "Nirvana", year: 1992 },
    { title: "Rocket Man (I Think It's Going to Be a Long, Long Time)", artist: "Elton John", year: 1972 },
    { title: "Jump", artist: "Van Halen", year: 1984 },
    { title: "Don't Speak", artist: "No Doubt", year: 1996 },
    { title: "I Want to Know What Love Is", artist: "Foreigner", year: 1984 },
    { title: "Somebody to Love", artist: "Queen", year: 1976 },
    { title: "All That She Wants", artist: "Ace of Base", year: 1992 },
    { title: "You Can't Hurry Love", artist: "The Supremes", year: 1966 },
    { title: "Born in the U.S.A.", artist: "Bruce Springsteen", year: 1984 },
    { title: "Everybody (Backstreet's Back)", artist: "Backstreet Boys", year: 1997 },
    { title: "Money for Nothing", artist: "Dire Straits", year: 1985 },
    { title: "Pour Some Sugar on Me", artist: "Def Leppard", year: 1987 },
];

async function main() {
    const tracksPath = path.join(__dirname, "..", "data", "tracks.json");
    const existing = JSON.parse(fs.readFileSync(tracksPath, "utf-8"));

    const existingKeys = new Set(existing.map(t => `${t.title.toLowerCase()}|||${t.artist.toLowerCase()}`));

    // Filter out duplicates
    const toAdd = NEW_TRACKS.filter(t => {
        const key = `${t.title.toLowerCase()}|||${t.artist.toLowerCase()}`;
        return !existingKeys.has(key);
    });

    console.log(`Existing tracks: ${existing.length}`);
    console.log(`Tracks to add: ${toAdd.length} (${NEW_TRACKS.length - toAdd.length} already in dataset)\n`);

    if (toAdd.length === 0) {
        console.log("Nothing to add!");
        return;
    }

    let added = 0, failed = 0;

    for (let i = 0; i < toAdd.length; i++) {
        const t = toAdd[i];
        process.stdout.write(`  [${i + 1}/${toAdd.length}] ${t.artist} - ${t.title}...`);

        try {
            const result = await searchItunes(t.title, t.artist);
            if (result && result.previewUrl) {
                existing.push({
                    title: t.title,
                    artist: t.artist,
                    year: t.year,
                    previewUrl: result.previewUrl,
                    albumArt: result.albumArt,
                    source: result.source,
                    relatedArtists: deriveRelatedArtists(t.artist),
                });
                console.log(` ✓`);
                added++;
            } else {
                console.log(` ✗ no preview`);
                failed++;
            }
        } catch (e) {
            console.log(` ✗ ${e.message}`);
            failed++;
        }

        await delay(RATE_MS);
    }

    fs.writeFileSync(tracksPath, JSON.stringify(existing, null, 2) + "\n");
    console.log(`\nDone! Added: ${added}, Failed: ${failed}`);
    console.log(`Total tracks: ${existing.length}`);

    const years = existing.map(t => t.year).sort((a, b) => a - b);
    console.log(`Year range: ${years[0]}-${years[years.length - 1]}`);
}

main().catch(e => { console.error(e); process.exit(1); });
