/**
 * bookmark-api-server.ts
 *
 * HTTP server that receives bookmark data from the browser extension.
 * Runs on localhost:47123 - only accepts local connections for security.
 */
import http from 'http';
import { URL } from 'url';
import { getLogger } from './logger-service';
import type { SQLiteBookmarksRepository } from '../repositories/sqlite-bookmarks-repository';
import type { SQLiteLocationRepository } from '../repositories/sqlite-location-repository';

const PORT = 47123;
const logger = getLogger();

let bookmarksRepository: SQLiteBookmarksRepository | null = null;
let locationsRepository: SQLiteLocationRepository | null = null;
let server: http.Server | null = null;

/**
 * Parse JSON body from incoming request
 */
function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send JSON response with CORS headers
 */
function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

/**
 * Handle incoming HTTP requests
 */
async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method || 'GET';

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    sendJson(res, 200, {});
    return;
  }

  logger.info('BookmarkAPI', `${method} ${path}`);

  try {
    // GET /api/status - Check if app is running
    if (method === 'GET' && path === '/api/status') {
      sendJson(res, 200, { running: true, version: '1.0.0' });
      return;
    }

    // POST /api/bookmark - Save a bookmark
    if (method === 'POST' && path === '/api/bookmark') {
      if (!bookmarksRepository) {
        sendJson(res, 500, { error: 'Bookmarks repository not initialized' });
        return;
      }

      const body = await parseBody(req);

      if (!body.url || typeof body.url !== 'string') {
        sendJson(res, 400, { error: 'URL is required' });
        return;
      }

      const bookmark = await bookmarksRepository.create({
        url: body.url,
        title: typeof body.title === 'string' ? body.title : null,
        locid: typeof body.locid === 'string' ? body.locid : null,
        auth_imp: null,
      });

      sendJson(res, 201, { success: true, bookmark_id: bookmark.bookmark_id });
      return;
    }

    // GET /api/locations?search=query - Search locations for autocomplete
    if (method === 'GET' && path === '/api/locations') {
      if (!locationsRepository) {
        sendJson(res, 500, { error: 'Locations repository not initialized' });
        return;
      }

      const search = url.searchParams.get('search') || '';
      const locations = await locationsRepository.findAll({ search, limit: 10 });

      sendJson(res, 200, {
        locations: locations.map((loc) => ({
          locid: loc.locid,
          locnam: loc.locnam,
          address_state: loc.address?.state || null,
        })),
      });
      return;
    }

    // GET /api/recent?limit=5 - Get recent bookmarks
    if (method === 'GET' && path === '/api/recent') {
      if (!bookmarksRepository) {
        sendJson(res, 500, { error: 'Bookmarks repository not initialized' });
        return;
      }

      const limit = parseInt(url.searchParams.get('limit') || '5', 10);
      const bookmarks = await bookmarksRepository.findRecent(limit);

      sendJson(res, 200, { bookmarks });
      return;
    }

    // 404 for unknown routes
    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    logger.error('BookmarkAPI', `Error: ${error}`);
    sendJson(res, 500, { error: 'Internal server error' });
  }
}

/**
 * Start the HTTP server
 */
export function startBookmarkAPIServer(
  bookmarksRepo: SQLiteBookmarksRepository,
  locationsRepo: SQLiteLocationRepository
): Promise<void> {
  return new Promise((resolve, reject) => {
    bookmarksRepository = bookmarksRepo;
    locationsRepository = locationsRepo;

    server = http.createServer((req, res) => {
      handleRequest(req, res).catch((error) => {
        logger.error('BookmarkAPI', `Unhandled error: ${error}`);
        sendJson(res, 500, { error: 'Internal server error' });
      });
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        logger.error('BookmarkAPI', `Port ${PORT} is already in use`);
        reject(new Error(`Port ${PORT} is already in use`));
      } else {
        reject(err);
      }
    });

    server.listen(PORT, '127.0.0.1', () => {
      logger.info('BookmarkAPI', `Server running on http://localhost:${PORT}`);
      resolve();
    });
  });
}

/**
 * Stop the HTTP server
 */
export function stopBookmarkAPIServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        logger.info('BookmarkAPI', 'Server stopped');
        server = null;
        bookmarksRepository = null;
        locationsRepository = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

/**
 * Check if server is running
 */
export function isBookmarkAPIServerRunning(): boolean {
  return server !== null && server.listening;
}
