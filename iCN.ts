/// <reference path="anime-torrent-provider.d.ts" />

class Provider {
    // Configuration
    private api = "https://ilcorsaronero.link/search/?q="

    getSettings(): AnimeProviderSettings {
        return {
            canSmartSearch: true,
            smartSearchFilters: ["batch", "episodeNumber", "query"],
            supportsAdult: false,
            type: "main",
        }
    }

    // Query Processing
    private cleanQuery(query: string): string {
        let cleaned = query
            .replace(/Season \d+/i, '')
            .replace(/\d+(?:st|nd|rd|th) Season/i, '')
            .replace(/^\s+|\s+$/g, '')
            .replace(/\s+/g, ' ')

        if (cleaned.length < 3) {
            cleaned = query
        }

        return cleaned
    }

    async fetchTorrents(query: string, userQuery?: string, episodeNumber?: number, isBatch?: boolean): Promise<IlCorsaroNeroTorrent[]> {
        const cleanedQuery = this.cleanQuery(query)
        let torrents: IlCorsaroNeroTorrent[] = []

        const firstWord = cleanedQuery.split(' ')[0]
        let refinedQuery = firstWord
        if (userQuery && userQuery.trim()) {
            refinedQuery += ` ${userQuery.trim()}`
        }
        if (!isBatch && episodeNumber && episodeNumber > 0) {
            const episodeStr = episodeNumber.toString().padStart(2, '0')
            refinedQuery += ` E${episodeStr}`
        }

        if (refinedQuery !== firstWord) {
            console.log(`Trying refined query: "${refinedQuery}"`)
            torrents = await this.performSearch(refinedQuery)
            if (torrents.length > 0) {
                return torrents
            }
        }

        if (firstWord && firstWord.length >= 3) {
            console.log(`No results for refined query, trying first word: "${firstWord}"`)
            torrents = await this.performSearch(firstWord)
            if (torrents.length > 0) {
                return torrents
            }
        }

        if (firstWord !== cleanedQuery) {
            console.log(`No results for first word, trying full query: "${cleanedQuery}"`)
            torrents = await this.performSearch(cleanedQuery)
        }

        return torrents
    }

    private async performSearch(query: string): Promise<IlCorsaroNeroTorrent[]> {
        const furl = `${this.api}${encodeURIComponent(query)}`

        try {
            console.log(`Searching for: "${query}"`)
            console.log(furl)
            const response = await fetch(furl)

            if (!response.ok) {
                throw new Error(`Failed to fetch torrents, ${response.statusText}`)
            }

            const htmlText = await response.text()
            const torrents = this.parseHTML(htmlText)
            console.log(`Found ${torrents.length} torrents for "${query}"`)

            return torrents
        }
        catch (error) {
            console.error(`Error searching for "${query}":`, error)
            return []
        }
    }

    // HTML Parsing
    private parseHTML(htmlText: string): IlCorsaroNeroTorrent[] {
        const torrents: IlCorsaroNeroTorrent[] = []

        let tableRegex = /<table[^>]*id="main_table"[^>]*>([\s\S]*?)<\/table>/i
        let tableMatch = htmlText.match(tableRegex)
        if (!tableMatch) {
            tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/i
            tableMatch = htmlText.match(tableRegex)
        }
        if (!tableMatch) return torrents

        let tableContent = tableMatch[1]
        const tbodyMatch = tableContent.match(/<tbody>([\s\S]*?)<\/tbody>/i)
        if (tbodyMatch) {
            tableContent = tbodyMatch[1]
        }

        const rowRegex = /<tr>([\s\S]*?)<\/tr>/gi
        let rowMatch
        while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
            const rowHtml = rowMatch[1]

            const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi
            const tds: string[] = []
            let cellMatch
            while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
                tds.push(cellMatch[1].trim())
            }

            if (tds.length < 7) continue

            const category = tds[0].replace(/<[^>]*>/g, '').trim()
            if (!category.includes('Film') && !category.includes('Animazione') && !category.includes('Serie TV')) {
                continue
            }

            const titleLinkRegex = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i
            const titleMatch = tds[1].match(titleLinkRegex)
            const link = titleMatch ? titleMatch[1] : ''
            if (!link) continue

            let title = titleMatch ? titleMatch[2].replace(/<[^>]*>/g, '').trim() : tds[1].replace(/<[^>]*>/g, '').trim()
            title = title.replace(/&#039;/g, "'").replace(/"/g, '"').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')

            const size = tds[4].replace(/<[^>]*>/g, '').trim()
            const seeders = parseInt(tds[2].replace(/<[^>]*>/g, '').trim() || '0')
            const leechers = parseInt(tds[3].replace(/<[^>]*>/g, '').trim() || '0')
            const downloads = 0

            const timestampMatch = rowHtml.match(/data-timestamp="(\d+)"/)
            let date: string
            if (timestampMatch) {
                const timestamp = parseInt(timestampMatch[1])
                date = new Date(timestamp * 1000).toISOString()
            } else {
                const dateStr = tds[5].replace(/<[^>]*>/g, '').trim()
                date = this.parseDate(dateStr)
            }

            const magnetRegex = /href="(magnet:[^"]*)"/i
            const magnetMatch = rowHtml.match(magnetRegex)
            const magnet = magnetMatch ? magnetMatch[1] : ''

            const torrentRegex = /href="([^"]*\.torrent)"/i
            const torrentMatch = rowHtml.match(torrentRegex)
            const torrentUrl = torrentMatch ? torrentMatch[1] : ''

            torrents.push({
                title,
                link,
                size,
                seeders,
                leechers,
                downloads,
                magnet,
                torrentUrl,
                date
            })
        }

        return torrents
    }

    // Utility Functions
    private parseSize(size: string): number {
        const match = size.match(/^([\d.]+)\s*(B|KB|MB|GB|TB)$/i)
        if (!match) return 0
        const [, num, unit] = match
        const multipliers: { [key: string]: number } = {
            "B": 1,
            "KB": 1024,
            "MB": 1024 * 1024,
            "GB": 1024 * 1024 * 1024,
            "TB": 1024 * 1024 * 1024 * 1024
        }
        return Math.round(parseFloat(num) * multipliers[unit.toUpperCase()])
    }

    private parseDate(dateStr: string): string {
        const now = new Date()
        const lower = dateStr.toLowerCase().trim()

        if (lower === 'oggi') {
            return now.toISOString()
        } else if (lower === 'ieri') {
            const yesterday = new Date(now)
            yesterday.setDate(now.getDate() - 1)
            return yesterday.toISOString()
        }

        const giorniMatch = lower.match(/^(\d+)\s+giorni?\s+fa$/i)
        if (giorniMatch) {
            const days = parseInt(giorniMatch[1])
            const past = new Date(now)
            past.setDate(now.getDate() - days)
            return past.toISOString()
        }

        const settimaneMatch = lower.match(/^(\d+)\s+settimane?\s+fa$/i)
        if (settimaneMatch) {
            const weeks = parseInt(settimaneMatch[1])
            const past = new Date(now)
            past.setDate(now.getDate() - (weeks * 7))
            return past.toISOString()
        }

        const mesiMatch = lower.match(/^(\d+)\s+mesi?\s+fa$/i)
        if (mesiMatch) {
            const months = parseInt(mesiMatch[1])
            const past = new Date(now)
            past.setMonth(now.getMonth() - months)
            return past.toISOString()
        }

        const anniMatch = lower.match(/^(\d+)\s+anni?\s+fa$/i)
        if (anniMatch) {
            const years = parseInt(anniMatch[1])
            const past = new Date(now)
            past.setFullYear(now.getFullYear() - years)
            return past.toISOString()
        }

        const absMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
        if (absMatch) {
            const [, day, month, year] = absMatch
            const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
            if (!isNaN(date.getTime())) {
                return date.toISOString()
            }
        }

        console.log(`Unable to parse date: "${dateStr}", using current date`)
        return now.toISOString()
    }

    // Public API Methods
    async search(opts: AnimeSearchOptions): Promise<AnimeTorrent[]> {
        const torrents = await this.fetchTorrents(opts.query)
        return torrents.map(t => this.toAnimeTorrent(t, false))
    }

    async smartSearch(opts: AnimeSmartSearchOptions): Promise<AnimeTorrent[]> {
        console.log('Smart search opts:', opts)

        let query = opts.media.englishTitle || opts.media.romajiTitle || opts.media.synonyms[0] || ''
        if (opts.query) {
            query += ' ' + opts.query
        }
        if (!opts.batch && opts.episodeNumber > 0) {
            const episodeStr = opts.episodeNumber.toString().padStart(2, '0')
            query += ` E${episodeStr}`
        }

        console.log('Smart search built query:', query)
        let torrents = await this.fetchTorrents(query, opts.query, opts.episodeNumber, opts.batch)
        console.log('Smart search raw torrents:', torrents.length)

        if (opts.batch) {
            let seasonToFilter = -1
            if (opts.query) {
                const seasonMatch = opts.query.match(/stagione (\d+)/i) || opts.query.match(/season (\d+)/i) || opts.query.match(/s(\d+)/i)
                if (seasonMatch) {
                    seasonToFilter = parseInt(seasonMatch[1])
                }
            }

            if (seasonToFilter > 0) {
                torrents = torrents.filter(t => {
                    const seasonPatterns = [/S(\d+)/i, /Season (\d+)/i, /Stagione (\d+)/i]
                    for (const pattern of seasonPatterns) {
                        const match = t.title.match(pattern)
                        if (match && parseInt(match[1]) === seasonToFilter) {
                            return true
                        }
                    }
                    return false
                })
                console.log(`Filtered torrents to season ${seasonToFilter}:`, torrents.length, 'torrents')
            }
        }

        let results = torrents.map(t => this.toAnimeTorrent(t, true))
        console.log('Smart search mapped results:', results.map(r => ({ name: r.name, episodeNumber: r.episodeNumber })))

        if (opts.batch) {
            const batchResults = results.filter(r => r.isBatch)
            if (batchResults.length > 0) {
                results = batchResults
                console.log(`Filtered to batch only:`, results.length, 'results')
            } else {
                console.log(`No batch torrents found, returning all results:`, results.length, 'results')
            }
        } else if (opts.episodeNumber > 0) {
            const episodeResults = results.filter(r => r.episodeNumber === opts.episodeNumber)
            if (episodeResults.length > 0) {
                results = episodeResults
                console.log(`Filtered to episode ${opts.episodeNumber}:`, results.length, 'results')
            } else {
                console.log(`No episodes found for ${opts.episodeNumber}, returning all results:`, results.length, 'results')
            }
        }

        return results
    }

    // Torrent Details & Conversion
    async getTorrentInfoHash(torrent: AnimeTorrent): Promise<string> {
        if (torrent.infoHash) {
            return torrent.infoHash
        }

        if (torrent.magnetLink) {
            const match = torrent.magnetLink.match(/xt=urn:btih:([a-fA-F0-9]+)/)
            if (match) {
                return match[1].toLowerCase()
            }
        }

        try {
            const response = await fetch(torrent.link)
            if (!response.ok) {
                throw new Error(`Failed to fetch torrent page: ${response.statusText}`)
            }
            const htmlText = await response.text()
            const magnetRegex = /href="(magnet:[^"]*)"/i
            const magnetMatch = htmlText.match(magnetRegex)
            if (magnetMatch) {
                const magnetLink = magnetMatch[1]
                const match = magnetLink.match(/xt=urn:btih:([a-fA-F0-9]+)/)
                if (match) {
                    return match[1].toLowerCase()
                }
            }
        } catch (error) {
            console.error('Error fetching info hash:', error)
        }

        return ''
    }

    async getTorrentMagnetLink(torrent: AnimeTorrent): Promise<string> {
        if (torrent.magnetLink) {
            return torrent.magnetLink
        }

        try {
            const response = await fetch(torrent.link)
            if (!response.ok) {
                throw new Error(`Failed to fetch torrent page: ${response.statusText}`)
            }
            const htmlText = await response.text()
            const magnetRegex = /href="(magnet:[^"]*)"/i
            const magnetMatch = htmlText.match(magnetRegex)
            if (magnetMatch) {
                return magnetMatch[1]
            }
            throw new Error('Magnet link not found on page')
        } catch (error) {
            console.error('Error fetching magnet link:', error)
            throw error
        }
    }

    toAnimeTorrent(torrent: IlCorsaroNeroTorrent, confirmed: boolean = false): AnimeTorrent {
        const hasSeason = /S\d+|Season|Stagione/i.test(torrent.title)
        const hasEpisode = /E\d+|Episode/i.test(torrent.title)
        const isBatch = hasSeason && !hasEpisode

        let episodeNumber = -1
        const episodePatterns = [/E(\d+)/i, /Episode (\d+)/i, /\b(\d{1,3})\b$/]
        for (const pattern of episodePatterns) {
            const match = torrent.title.match(pattern)
            if (match) {
                episodeNumber = parseInt(match[1])
                break
            }
        }

        let seasonNumber = -1
        const seasonPatterns = [/S(\d+)/i, /Season (\d+)/i, /Stagione (\d+)/i]
        for (const pattern of seasonPatterns) {
            const match = torrent.title.match(pattern)
            if (match) {
                seasonNumber = parseInt(match[1])
                break
            }
        }

        let infoHash = ""
        if (torrent.magnet) {
            const match = torrent.magnet.match(/btih:([a-zA-Z0-9]+)/)
            if (match) {
                infoHash = match[1].toLowerCase()
            }
        }

        return {
            name: torrent.title,
            date: torrent.date,
            size: this.parseSize(torrent.size),
            formattedSize: torrent.size,
            seeders: torrent.seeders,
            leechers: torrent.leechers,
            downloadCount: torrent.downloads,
            link: "https://ilcorsaronero.link" + torrent.link,
            downloadUrl: torrent.torrentUrl ? "https://ilcorsaronero.link" + torrent.torrentUrl : undefined,
            magnetLink: torrent.magnet || undefined,
            infoHash,
            resolution: "",
            isBatch,
            isBestRelease: false,
            confirmed,
            episodeNumber
        }
    }
}

type IlCorsaroNeroTorrent = {
    title: string
    link: string
    size: string
    seeders: number
    leechers: number
    downloads: number
    magnet: string
    torrentUrl: string
    date: string
}

type NyaaTorrent = {
    id: number
    title: string
    link: string
    timestamp: number
    status: string
    size: string
    tosho_id?: number
    nyaa_id?: number
    nyaa_subdom?: any
    anidex_id?: number
    torrent_url: string
    info_hash: string
    info_hash_v2?: string
    magnet_uri: string
    seeders: number
    leechers: number
    torrent_download_count: number
    tracker_updated?: any
    nzb_url?: string
    total_size: number
    num_files: number
    anidb_aid: number
    anidb_eid: number
    anidb_fid: number
    article_url: string
    article_title: string
    website_url: string
}
