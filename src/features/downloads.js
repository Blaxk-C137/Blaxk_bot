// downloads.js — song, ytvideo, yts, tiktok, mediafire, apk
const fs = require('fs');
const path = require('path');

const DOWNLOADS_DIR = path.resolve(__dirname, '../../downloads');
const YT_ID_REGEX = /(?:http(?:s|):\/\/|)(?:(?:www\.|)youtube(?:\-nocookie|)\.com\/(?:watch\?.*(?:|\&)v=|embed|shorts\/|v\/)|youtu\.be\/)([-_0-9A-Za-z]{11})/;

function sanitizeTitle(title) {
    return String(title || 'blaxkbot')
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .substring(0, 60) || 'blaxkbot';
}

function normalizeYouTubeUrl(input) {
    const vid = YT_ID_REGEX.exec(input);
    if (vid) return `https://www.youtube.com/watch?v=${vid[1]}`;
    return input;
}

// Download YouTube audio/video to disk; resolves { path, fileName }
function ytdlDownload(url, { video = false } = {}) {
    const ytdl = require('@distube/ytdl-core');
    return new Promise(async (resolve, reject) => {
        try {
            fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
            const info = await ytdl.getInfo(url);
            const title = info.videoDetails.title;
            const sanitized = sanitizeTitle(title);
            const ext = video ? 'mp4' : 'mp3';
            const outputPath = path.join(DOWNLOADS_DIR, `${Date.now()}_${sanitized}.${ext}`);
            const stream = video
                ? ytdl(url, { quality: 'highest' })
                : ytdl(url, { quality: 'highestaudio', filter: 'audioonly' });
            const ws = fs.createWriteStream(outputPath);
            stream.on('error', reject);
            ws.on('error', reject);
            ws.on('finish', () => resolve({ path: outputPath, fileName: `${sanitized}.${ext}`, title }));
            stream.pipe(ws);
        } catch (err) { reject(err); }
    });
}

// Scrape MediaFire for the direct download link (axios + cheerio)
async function mediafireScrape(url) {
    const axios = require('axios');
    const cheerio = require('cheerio');
    if (!url.includes('mediafire.com')) throw new Error('Invalid MediaFire URL');
    const res = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(res.data);
    const downloadLink = $('a#downloadButton').attr('href')
        || $('a[href*="download"]').attr('href');
    if (!downloadLink) throw new Error('Could not extract download link');
    const filename = $('.filename').text().trim()
        || $('title').text().replace('MediaFire', '').trim()
        || 'unknown_file';
    const size = $('.fileinfo').text().trim() || 'Unknown size';
    return { url: downloadLink, filename, size };
}

// Search APKMirror; resolves [{ title, url }]
async function apkMirrorSearch(query) {
    const axios = require('axios');
    const cheerio = require('cheerio');
    const res = await axios.get(`https://www.apkmirror.com/?s=${encodeURIComponent(query)}`, {
        timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(res.data);
    const items = new Map();
    $('a').each((_, el) => {
        const href = $(el).attr('href') || '';
        const text = ($(el).text() || '').trim();
        if (href.startsWith('/apk/') && text.length > 0 && !items.has(href)) items.set(href, text);
    });
    return Array.from(items.entries()).slice(0, 10).map(([href, text]) => ({
        title: text, url: `https://www.apkmirror.com${href}`
    }));
}

module.exports = function registerDownloads({ registry, config }) {
    registry = registry.withCategory('downloads');
    const reply = (sock, msg, text) => sock.sendMessage(msg.key.remoteJid, { text });

    registry.registerCommand('song', 'Download a song from YouTube (.song <query or url>)', async (sock, msg, args) => {
        const from = msg.key.remoteJid;
        const query = args.join(' ').trim();
        if (!query) return reply(sock, msg, 'Usage: .song <song name or YouTube URL>');
        try {
            await reply(sock, msg, '🎵 Searching and downloading... please wait.');
            let url = normalizeYouTubeUrl(query);
            if (!YT_ID_REGEX.test(query)) {
                const yts = require('yt-search');
                const results = await yts(query);
                const first = results.videos?.[0];
                if (!first) return reply(sock, msg, '❌ No results found for that query.');
                url = first.url;
            }
            const { path: filePath, fileName, title } = await ytdlDownload(url);
            await sock.sendMessage(from, {
                document: { url: filePath },
                fileName,
                mimetype: 'audio/mpeg',
                caption: `🎵 ${title}`
            });
        } catch (err) {
            console.error('❌ Song error:', err.message);
            await reply(sock, msg, `⚠️ Download failed: ${err.message}`);
        }
    }, { permission: 'all', aliases: ['play'] });

    registry.registerCommand('ytvideo', 'Download a video from YouTube (.ytvideo <query or url>)', async (sock, msg, args) => {
        const from = msg.key.remoteJid;
        const query = args.join(' ').trim();
        if (!query) return reply(sock, msg, 'Usage: .ytvideo <video name or YouTube URL>');
        try {
            await reply(sock, msg, '🎬 Searching and downloading... please wait.');
            let url = normalizeYouTubeUrl(query);
            if (!YT_ID_REGEX.test(query)) {
                const yts = require('yt-search');
                const results = await yts(query);
                const first = results.videos?.[0];
                if (!first) return reply(sock, msg, '❌ No results found for that query.');
                url = first.url;
            }
            const { path: filePath, fileName, title } = await ytdlDownload(url, { video: true });
            await sock.sendMessage(from, {
                document: { url: filePath },
                fileName,
                mimetype: 'video/mp4',
                caption: `🎬 ${title}`
            });
        } catch (err) {
            console.error('❌ Ytvideo error:', err.message);
            await reply(sock, msg, `⚠️ Download failed: ${err.message}`);
        }
    }, { permission: 'all', aliases: ['video', 'mp4'] });

    registry.registerCommand('yts', 'Search YouTube (.yts <query>)', async (sock, msg, args) => {
        const from = msg.key.remoteJid;
        const query = args.join(' ').trim();
        if (!query) return reply(sock, msg, 'Usage: .yts <search query>');
        try {
            const yts = require('yt-search');
            if (YT_ID_REGEX.test(query)) {
                // Direct URL: show video info
                const ytdl = require('@distube/ytdl-core');
                const info = await ytdl.getInfo(normalizeYouTubeUrl(query));
                const d = info.videoDetails;
                const mins = Math.floor((d.lengthSeconds || 0) / 60);
                const secs = (d.lengthSeconds || 0) % 60;
                return reply(sock, msg, `*Title:* ${d.title}\n*Time:* ${mins}:${String(secs).padStart(2, '0')}\n*Views:* ${d.viewCount || 0}\n*Published:* ${d.publishDate || '?'}\n\n*Desc:* ${(d.description || '').substring(0, 300)}`);
            }
            const results = await yts(query);
            const videos = (results.videos || []).slice(0, 5);
            if (!videos.length) return reply(sock, msg, '❌ No results found.');
            let text = `🔍 *YouTube Search: "${query}"*\n\n`;
            videos.forEach((v, i) => {
                text += `*${i + 1}.* ${v.title.trim()}\n👤 ${v.author?.name || '?'}\n⏱️ ${v.timestamp || '?'}\n👁️ ${v.views || 0} views\n🔗 ${v.url}\n\n`;
            });
            text += `💡 Use .song <url> or .ytvideo <url> to download.`;
            await reply(sock, msg, text);
        } catch (err) {
            console.error('❌ Yts error:', err.message);
            await reply(sock, msg, `⚠️ Search failed: ${err.message}`);
        }
    }, { permission: 'all', aliases: ['ytsearch'] });

    registry.registerCommand('tiktok', 'Download a TikTok video (.tiktok <url>)', async (sock, msg, args) => {
        const from = msg.key.remoteJid;
        const url = args[0];
        if (!url) return reply(sock, msg, 'Usage: .tiktok <TikTok video URL>');
        if (!/https?:\/\/(?:www\.|vm\.|vt\.|)tiktok\.com\//.test(url)) {
            return reply(sock, msg, '❌ That is not a valid TikTok link.');
        }
        try {
            await reply(sock, msg, '📱 Downloading TikTok video...');
            const axios = require('axios');
            const apiUrl = `https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(url)}`;
            const res = await axios.get(apiUrl, { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } });
            const data = res.data?.data;
            const videoUrl = data?.urls?.[0] || data?.video_url || data?.url || data?.download_url;
            if (!videoUrl) return reply(sock, msg, '❌ Could not extract video from that TikTok link.');
            const title = data?.metadata?.title || 'TikTok Video';
            const videoRes = await axios.get(videoUrl, {
                responseType: 'arraybuffer', timeout: 60000,
                maxContentLength: 100 * 1024 * 1024,
                headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.tiktok.com/' }
            });
            await sock.sendMessage(from, {
                video: Buffer.from(videoRes.data),
                mimetype: 'video/mp4',
                caption: `📱 ${title}`
            });
        } catch (err) {
            console.error('❌ Tiktok error:', err.message);
            await reply(sock, msg, `⚠️ TikTok download failed: ${err.message}`);
        }
    }, { permission: 'all', aliases: ['tt'] });

    registry.registerCommand('mediafire', 'Get direct download link from MediaFire (.mediafire <url>)', async (sock, msg, args) => {
        const from = msg.key.remoteJid;
        const url = args[0];
        if (!url) return reply(sock, msg, 'Usage: .mediafire <MediaFire URL>');
        try {
            await reply(sock, msg, '📁 Extracting download link...');
            const result = await mediafireScrape(url);
            await reply(sock, msg, `📁 *MediaFire File Found*\n\n📄 *Filename:* ${result.filename}\n📊 *Size:* ${result.size}\n🔗 *Link:* ${result.url}`);
        } catch (err) {
            console.error('❌ Mediafire error:', err.message);
            await reply(sock, msg, `⚠️ Failed: ${err.message}`);
        }
    }, { permission: 'all' });

    registry.registerCommand('apk', 'Search APKMirror for APKs (.apk <app name>)', async (sock, msg, args) => {
        const from = msg.key.remoteJid;
        const query = args.join(' ').trim();
        if (!query) return reply(sock, msg, 'Usage: .apk <app name>');
        try {
            await reply(sock, msg, `📱 Searching APKMirror for "${query}"...`);
            const results = await apkMirrorSearch(query);
            if (!results.length) return reply(sock, msg, '❌ No APKs found for that query.');
            let text = `📱 *APKMirror results for "${query}"*\n\n`;
            results.forEach((r, i) => { text += `*${i + 1}.* ${r.title}\n🔗 ${r.url}\n\n`; });
            await reply(sock, msg, text);
        } catch (err) {
            console.error('❌ Apk error:', err.message);
            await reply(sock, msg, `⚠️ Search failed: ${err.message}`);
        }
    }, { permission: 'all' });
};

module.exports.normalizeYouTubeUrl = normalizeYouTubeUrl;
module.exports.sanitizeTitle = sanitizeTitle;
module.exports.YT_ID_REGEX = YT_ID_REGEX;
