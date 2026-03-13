// cli/server.ts — Express server for Claude Cost Tracker CLI
import express from 'express'
import * as fs from 'fs'
import * as path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import { discoverSessionFiles, parseSessionFile } from './parser'
import type { ApiResponse } from '../src/lib/types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function parseArgs(): { dirs: string[]; port: number } {
  const args = process.argv.slice(2)
  const dirs: string[] = []
  let port = 3000

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) {
      dirs.push(path.resolve(args[i + 1]))
      i++
    } else if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[i + 1], 10)
      i++
    }
  }

  if (dirs.length === 0) {
    // Auto-discover: scan all subdirs in ~/.claude/projects/
    const defaultDir = path.join(os.homedir(), '.claude', 'projects')
    if (fs.existsSync(defaultDir)) {
      const subdirs = fs.readdirSync(defaultDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => path.join(defaultDir, d.name))
      dirs.push(...subdirs)
    }
  }

  return { dirs, port }
}

async function main() {
  const { dirs, port } = parseArgs()
  const app = express()

  // Serve static React app from dist/
  const distDir = path.join(__dirname, '..', 'dist')
  app.use(express.static(distDir))

  // API endpoint
  app.get('/api/sessions', (_req, res) => {
    try {
      const files = discoverSessionFiles(dirs)
      const sessions = files.map(f => {
        try {
          return parseSessionFile(f)
        } catch (err) {
          console.error(`Error parsing ${f.jsonlPath}:`, err)
          return null
        }
      }).filter(Boolean)

      const response: ApiResponse = { sessions: sessions as ApiResponse['sessions'] }
      res.json(response)
    } catch (err) {
      console.error('Error discovering sessions:', err)
      res.status(500).json({ error: 'Failed to parse sessions' })
    }
  })

  // SPA fallback (Express v5 requires named catch-all parameter)
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })

  app.listen(port, async () => {
    console.log(`Claude Cost Tracker running at http://localhost:${port}`)
    console.log(`Scanning directories: ${dirs.join(', ')}`)

    // Auto-open browser
    try {
      const open = (await import('open')).default
      await open(`http://localhost:${port}`)
    } catch {
      console.log('Could not auto-open browser. Navigate manually.')
    }
  })
}

main()
