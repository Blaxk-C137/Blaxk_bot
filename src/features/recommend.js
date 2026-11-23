// recommend.js — movie (TMDB), anime (Jikan), football (api-sports) — all key-optional where possible
const axios = require('axios');

const FOOTBALL_BASE = 'https://v3.football.api-sports.io';

async function fetchJson(url, { headers, params, retries = 1 } = {}) {
    let response = await axios.get(url, { headers, params, timeout: 10000 });
    if ((response.status === 429 || response.status >= 500) && retries > 0) {
        await new Promise(r => setTimeout(r, 750));
        response = await axios.get(url, { headers, params, timeout: 10000 });
    }
    return response.data;
}

// ==================== MOVIES (TMDB, key required) ====================

function formatMovie(m) {
    return `🎬 *${m.title}* (${m.year})\n⭐ ${m.rating}/10\n${m.overview}\n`;
}

async function movieSearch(apiKey, query, limit = 5) {
    const data = await fetchJson('https://api.themoviedb.org/3/search/movie', {
        params: { api_key: apiKey, query, page: 1 }
    });
    return (data.results || []).slice(0, limit).map((m, i) => ({
        number: i + 1,
        title: m.title,
        year: m.release_date ? m.release_date.split('-')[0] : 'N/A',
        rating: m.vote_average || 'N/A',
        overview: m.overview || 'No description available',
        poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null
    }));
}

async function movieTrending(apiKey, limit = 5) {
    const data = await fetchJson('https://api.themoviedb.org/3/trending/movie/week', {
        params: { api_key: apiKey }
    });
    return (data.results || []).slice(0, limit).map((m, i) => ({
        number: i + 1,
        title: m.title,
        year: m.release_date ? m.release_date.split('-')[0] : 'N/A',
        rating: m.vote_average || 'N/A',
        overview: m.overview || 'No description available',
        poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null
    }));
}

async function movieRandom(apiKey) {
    const page = Math.floor(Math.random() * 5) + 1;
    const data = await fetchJson('https://api.themoviedb.org/3/movie/popular', {
        params: { api_key: apiKey, page }
    });
    const results = data.results || [];
    if (!results.length) throw new Error('No results from TMDB');
    const m = results[Math.floor(Math.random() * results.length)];
    return {
        title: m.title,
        year: m.release_date ? m.release_date.split('-')[0] : 'N/A',
        rating: m.vote_average || 'N/A',
        overview: m.overview || 'No description available',
        poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null
    };
}

// ==================== ANIME (Jikan — free, no key) ====================

function formatAnime(a) {
    return `📺 *${a.title}* (${a.year})\n⭐ ${a.rating} | 📼 ${a.episodes} eps | ${a.type} | ${a.status}\n🏷️ ${a.genres}\n${a.synopsis}\n`;
}

async function animeSearch(query, limit = 5) {
    const data = await fetchJson(`https://api.jikan.moe/v4/anime`, {
        params: { q: query, limit }
    });
    return (data.data || []).map((a, i) => ({
        number: i + 1,
        title: a.title || a.title_english || 'Unknown Title',
        year: a.year || (a.aired?.from || '').split('-')[0] || 'N/A',
        rating: a.score || 'N/A',
        episodes: a.episodes || '?',
        type: a.type || '?',
        status: a.status || '?',
        synopsis: (a.synopsis || 'No description available').substring(0, 300),
        genres: a.genres?.map(g => g.name).join(', ') || 'N/A'
    }));
}

async function animeTop(limit = 5) {
    const data = await fetchJson(`https://api.jikan.moe/v4/top/anime`, { params: { limit } });
    return (data.data || []).map((a, i) => ({
        number: i + 1,
        title: a.title || a.title_english || 'Unknown Title',
        year: a.year || (a.aired?.from || '').split('-')[0] || 'N/A',
        rating: a.score || 'N/A',
        episodes: a.episodes || '?',
        type: a.type || '?',
        status: a.status || '?',
        synopsis: (a.synopsis || 'No description available').substring(0, 300),
        genres: a.genres?.map(g => g.name).join(', ') || 'N/A'
    }));
}

async function animeSeasonal(limit = 5) {
    const data = await fetchJson(`https://api.jikan.moe/v4/seasons/now`, { params: { limit } });
    return (data.data || []).map((a, i) => ({
        number: i + 1,
        title: a.title || a.title_english || 'Unknown Title',
        year: a.year || (a.aired?.from || '').split('-')[0] || 'N/A',
        rating: a.score || 'N/A',
        episodes: a.episodes || '?',
        type: a.type || '?',
        status: a.status || '?',
        synopsis: (a.synopsis || 'No description available').substring(0, 300),
        genres: a.genres?.map(g => g.name).join(', ') || 'N/A'
    }));
}

async function animeRandom() {
    const data = await fetchJson(`https://api.jikan.moe/v4/top/anime`, { params: { limit: 25 } });
    const list = data.data || [];
    if (!list.length) throw new Error('No results from Jikan');
    const a = list[Math.floor(Math.random() * list.length)];
    return {
        title: a.title || a.title_english || 'Unknown Title',
        year: a.year || (a.aired?.from || '').split('-')[0] || 'N/A',
        rating: a.score || 'N/A',
        episodes: a.episodes || '?',
        type: a.type || '?',
        status: a.status || '?',
        synopsis: (a.synopsis || 'No description available').substring(0, 300),
        genres: a.genres?.map(g => g.name).join(', ') || 'N/A'
    };
}

// ==================== FOOTBALL (api-sports, key required) ====================

function footballHelp() {
    return `⚽ *FOOTBALL COMMANDS*

1. .football help — this menu
2. .football leagues — list leagues
3. .football fixtures <league_id> <season> — league fixtures
4. .football today — today's matches
5. .football live — live matches
6. .football standings <league_id> <season> — league table
7. .football team <team_id> — team info
8. .football players <team_id> <season> — team squad
9. .football h2h <team1_id> <team2_id> — head-to-head
10. .football scorers <league_id> <season> — top scorers
11. .football next <team_id> — next 5 fixtures
12. .football results <league_id> <season> — past results

Examples:
• .football standings 39 2024
• .football team 33`;
}

async function fetchFootball(key, endpoint, params = {}) {
    const response = await axios.get(`${FOOTBALL_BASE}/${endpoint}`, {
        headers: { 'x-apisports-key': key },
        params, timeout: 10000
    });
    const data = response.data;
    if (data.errors && Object.keys(data.errors).length > 0) {
        throw new Error(Object.values(data.errors).join(' | '));
    }
    return data;
}

function fmtFixture(f) {
    const home = f.teams?.home?.name || '?';
    const away = f.teams?.away?.name || '?';
    const goals = f.goals || {};
    const league = f.league?.name || '';
    const time = (f.fixture?.date || '').replace('T', ' ').substring(0, 16);
    const status = f.fixture?.status?.short || '';
    return `⚽ ${home} ${goals.home ?? '-'} : ${goals.away ?? '-'} ${away} (${status})\n🏆 ${league} | 🕒 ${time} UTC`;
}

module.exports = function registerRecommend({ registry, config }) {
    registry = registry.withCategory('recommend');
    const reply = (sock, msg, text) => sock.sendMessage(msg.key.remoteJid, { text });
    const tmdbKey = () => config.tmdbApiKey;
    const footballKey = () => config.footballApiKey;

    // === MOVIE ===
    registry.registerCommand('movie', 'Movie info from TMDB (.movie <query> | trending | random)', async (sock, msg, args) => {
        const query = args.join(' ').trim();
        if (!query) return reply(sock, msg, 'Usage: .movie <title> | .movie trending | .movie random');
        const key = tmdbKey();
        if (!key) return reply(sock, msg, '🔑 .movie needs TMDB_API_KEY in .env');
        try {
            if (query.toLowerCase() === 'trending') {
                const movies = await movieTrending(key);
                if (!movies.length) return reply(sock, msg, '❌ No trending movies found.');
                return reply(sock, msg, `🔥 *Trending Movies:*\n\n${movies.map(formatMovie).join('\n')}`);
            }
            if (query.toLowerCase() === 'random') {
                const m = await movieRandom(key);
                return reply(sock, msg, `🎲 *Random Movie Pick:*\n\n${formatMovie(m)}`);
            }
            const movies = await movieSearch(key, query);
            if (!movies.length) return reply(sock, msg, `❌ No movies found for "${query}".`);
            return reply(sock, msg, `🎬 *Movies matching "${query}":*\n\n${movies.map(formatMovie).join('\n')}`);
        } catch (err) {
            console.error('❌ Movie error:', err.message);
            await reply(sock, msg, `⚠️ Movie lookup failed: ${err.message}`);
        }
    }, { permission: 'all' });

    // === ANIME (keyless via Jikan) ===
    registry.registerCommand('anime', 'Anime info from MyAnimeList (.anime <query> | top | seasonal | random)', async (sock, msg, args) => {
        const query = args.join(' ').trim();
        if (!query) return reply(sock, msg, 'Usage: .anime <title> | .anime top | .anime seasonal | .anime random');
        try {
            if (query.toLowerCase() === 'top') {
                const list = await animeTop();
                return reply(sock, msg, `🏆 *Top Anime:*\n\n${list.map(formatAnime).join('\n')}`);
            }
            if (query.toLowerCase() === 'seasonal') {
                const list = await animeSeasonal();
                return reply(sock, msg, `🌸 *Airing This Season:*\n\n${list.map(formatAnime).join('\n')}`);
            }
            if (query.toLowerCase() === 'random') {
                const a = await animeRandom();
                return reply(sock, msg, `🎲 *Random Anime Pick:*\n\n${formatAnime(a)}`);
            }
            const list = await animeSearch(query);
            if (!list.length) return reply(sock, msg, `❌ No anime found for "${query}".`);
            return reply(sock, msg, `📺 *Anime matching "${query}":\n\n${list.map(formatAnime).join('\n')}`);
        } catch (err) {
            console.error('❌ Anime error:', err.message);
            await reply(sock, msg, `⚠️ Anime lookup failed: ${err.message} (Jikan is free but rate-limited — try again shortly.)`);
        }
    }, { permission: 'all' });

    // === FOOTBALL ===
    registry.registerCommand('football', 'Football data (12 subcommands — .football help)', async (sock, msg, args) => {
        const sub = (args[0] || 'help').toLowerCase();
        const params = args.slice(1);
        if (sub === 'help') return reply(sock, msg, footballHelp());

        const key = footballKey();
        if (!key) return reply(sock, msg, '🔑 .football needs FOOTBALL_API_KEY in .env');

        try {
            switch (sub) {
                case 'leagues': {
                    const data = await fetchFootball(key, 'leagues', { current: 'true' });
                    const leagues = (data.response || []).slice(0, 15).map(l => `${l.league.id} — ${l.league.name} (${l.league.country})`);
                    return reply(sock, msg, `🏆 *Leagues:*\n\n${leagues.join('\n')}`);
                }
                case 'today': {
                    const today = new Date().toISOString().split('T')[0];
                    const data = await fetchFootball(key, 'fixtures', { date: today });
                    const fixtures = data.response || [];
                    if (!fixtures.length) return reply(sock, msg, 'No matches today. 🛋️');
                    return reply(sock, msg, `📅 *Today's Matches (${today}):*\n\n${fixtures.slice(0, 15).map(fmtFixture).join('\n')}`);
                }
                case 'live': {
                    const data = await fetchFootball(key, 'fixtures', { live: 'all' });
                    const fixtures = data.response || [];
                    if (!fixtures.length) return reply(sock, msg, 'No live matches right now. 🛋️');
                    return reply(sock, msg, `🔴 *Live Matches:*\n\n${fixtures.slice(0, 15).map(fmtFixture).join('\n')}`);
                }
                case 'fixtures': {
                    const [league, season] = params;
                    if (!league || !season) return reply(sock, msg, 'Usage: .football fixtures <league_id> <season>');
                    const data = await fetchFootball(key, 'fixtures', { league, season, next: '10' });
                    return reply(sock, msg, `📅 *Upcoming Fixtures:*\n\n${(data.response || []).slice(0, 10).map(fmtFixture).join('\n')}`);
                }
                case 'standings': {
                    const [league, season] = params;
                    if (!league || !season) return reply(sock, msg, 'Usage: .football standings <league_id> <season>');
                    const data = await fetchFootball(key, 'standings', { league, season });
                    const table = data.response?.[0]?.league?.standings?.[0] || [];
                    if (!table.length) return reply(sock, msg, 'No standings found.');
                    const lines = table.slice(0, 20).map(r => `${String(r.rank).padStart(2)} ${r.team.name} — ${r.points} pts (${r.all?.played} P, GD ${r.goalsDiff})`);
                    return reply(sock, msg, `🏆 *League Table:*\n\n${lines.join('\n')}`);
                }
                case 'team': {
                    const [id] = params;
                    if (!id) return reply(sock, msg, 'Usage: .football team <team_id>');
                    const data = await fetchFootball(key, 'teams', { id });
                    const t = data.response?.[0]?.team;
                    if (!t) return reply(sock, msg, 'Team not found.');
                    const venue = data.response?.[0]?.venue;
                    return reply(sock, msg, `🏟️ *${t.name}* (${t.code || '?'}), founded ${t.founded || '?'}\n📍 ${venue?.city || '?'} — ${venue?.name || '?'}`);
                }
                case 'players': {
                    const [team, season] = params;
                    if (!team || !season) return reply(sock, msg, 'Usage: .football players <team_id> <season>');
                    const data = await fetchFootball(key, 'players', { team, season });
                    const players = (data.response || []).slice(0, 15).map(p => `${p.player.name} (${p.player.age}y, ${p.player.nationality || '?'})`);
                    return reply(sock, msg, `👥 *Squad:*\n\n${players.join('\n')}`);
                }
                case 'h2h': {
                    const [t1, t2] = params;
                    if (!t1 || !t2) return reply(sock, msg, 'Usage: .football h2h <team1_id> <team2_id>');
                    const data = await fetchFootball(key, 'fixtures/headtohead', { h2h: `${t1}-${t2}`, last: '5' });
                    return reply(sock, msg, `⚔️ *Head-to-Head (last 5):*\n\n${(data.response || []).map(fmtFixture).join('\n')}`);
                }
                case 'scorers': {
                    const [league, season] = params;
                    if (!league || !season) return reply(sock, msg, 'Usage: .football scorers <league_id> <season>');
                    const data = await fetchFootball(key, 'players/topscorers', { league, season });
                    const scorers = (data.response || []).slice(0, 10).map((p, i) => `${i + 1}. ${p.player.name} (${p.statistics?.[0]?.goals?.total || 0} goals, ${p.statistics?.[0]?.team?.name || '?'})`);
                    return reply(sock, msg, `🥅 *Top Scorers:*\n\n${scorers.join('\n')}`);
                }
                case 'next': {
                    const [id] = params;
                    if (!id) return reply(sock, msg, 'Usage: .football next <team_id>');
                    const data = await fetchFootball(key, 'fixtures', { team: id, next: '5' });
                    return reply(sock, msg, `📅 *Next 5 Fixtures:*\n\n${(data.response || []).map(fmtFixture).join('\n')}`);
                }
                case 'results': {
                    const [league, season] = params;
                    if (!league || !season) return reply(sock, msg, 'Usage: .football results <league_id> <season>');
                    const data = await fetchFootball(key, 'fixtures', { league, season, last: '10' });
                    return reply(sock, msg, `📊 *Recent Results:*\n\n${(data.response || []).map(fmtFixture).join('\n')}`);
                }
                default:
                    return reply(sock, msg, footballHelp());
            }
        } catch (err) {
            console.error('❌ Football error:', err.message);
            await reply(sock, msg, `⚠️ Football lookup failed: ${err.message}`);
        }
    }, { permission: 'all', aliases: ['soccer'] });
};

module.exports.footballHelp = footballHelp;
module.exports.formatMovie = formatMovie;
module.exports.formatAnime = formatAnime;
module.exports.fmtFixture = fmtFixture;
