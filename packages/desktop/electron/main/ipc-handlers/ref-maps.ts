/**
 * IPC Handlers for Reference Maps
 * Handles importing, listing, and deleting reference map files.
 */

import { ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { SqliteRefMapsRepository } from '../../repositories/sqlite-ref-maps-repository';
import { parseMapFile, getSupportedExtensions, isSupportedMapFile } from '../../services/map-parser-service';
import { RefMapMatcherService } from '../../services/ref-map-matcher-service';
import type { Kysely } from 'kysely';
import type { Database } from '../database.types';

export function registerRefMapsHandlers(db: Kysely<Database>): void {
  const repository = new SqliteRefMapsRepository(db);
  const matcher = new RefMapMatcherService(db);

  /**
   * Select and import a map file
   */
  ipcMain.handle('refMaps:import', async (_event, importedBy?: string) => {
    try {
      // Show file dialog
      const result = await dialog.showOpenDialog({
        title: 'Import Reference Map',
        filters: [
          { name: 'Map Files', extensions: ['kml', 'kmz', 'gpx', 'geojson', 'json', 'csv'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      const filePath = result.filePaths[0];

      // Verify it's a supported file
      if (!isSupportedMapFile(filePath)) {
        return {
          success: false,
          error: `Unsupported file type. Supported: ${getSupportedExtensions().join(', ')}`
        };
      }

      // Parse the file
      const parseResult = await parseMapFile(filePath);

      if (!parseResult.success) {
        return {
          success: false,
          error: parseResult.error || 'Failed to parse map file'
        };
      }

      if (parseResult.points.length === 0) {
        return {
          success: false,
          error: 'No points found in map file'
        };
      }

      // Create the map record with points
      const mapName = path.basename(filePath, path.extname(filePath));
      const refMap = await repository.create({
        mapName,
        filePath,
        fileType: parseResult.fileType,
        importedBy,
        points: parseResult.points
      });

      return {
        success: true,
        map: {
          mapId: refMap.mapId,
          mapName: refMap.mapName,
          filePath: refMap.filePath,
          fileType: refMap.fileType,
          pointCount: refMap.pointCount,
          importedAt: refMap.importedAt,
          importedBy: refMap.importedBy
        },
        pointCount: parseResult.points.length
      };
    } catch (error) {
      console.error('Error importing reference map:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error importing map'
      };
    }
  });

  /**
   * Import a map file from a specific path (for drag-drop)
   */
  ipcMain.handle('refMaps:importFromPath', async (_event, filePath: string, importedBy?: string) => {
    try {
      // Verify file exists
      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: 'File not found'
        };
      }

      // Verify it's a supported file
      if (!isSupportedMapFile(filePath)) {
        return {
          success: false,
          error: `Unsupported file type. Supported: ${getSupportedExtensions().join(', ')}`
        };
      }

      // Parse the file
      const parseResult = await parseMapFile(filePath);

      if (!parseResult.success) {
        return {
          success: false,
          error: parseResult.error || 'Failed to parse map file'
        };
      }

      if (parseResult.points.length === 0) {
        return {
          success: false,
          error: 'No points found in map file'
        };
      }

      // Create the map record with points
      const mapName = path.basename(filePath, path.extname(filePath));
      const refMap = await repository.create({
        mapName,
        filePath,
        fileType: parseResult.fileType,
        importedBy,
        points: parseResult.points
      });

      return {
        success: true,
        map: {
          mapId: refMap.mapId,
          mapName: refMap.mapName,
          filePath: refMap.filePath,
          fileType: refMap.fileType,
          pointCount: refMap.pointCount,
          importedAt: refMap.importedAt,
          importedBy: refMap.importedBy
        },
        pointCount: parseResult.points.length
      };
    } catch (error) {
      console.error('Error importing reference map from path:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error importing map'
      };
    }
  });

  /**
   * Get all reference maps (metadata only, no points)
   */
  ipcMain.handle('refMaps:findAll', async () => {
    try {
      const maps = await repository.findAll();
      return maps.map(m => ({
        mapId: m.mapId,
        mapName: m.mapName,
        filePath: m.filePath,
        fileType: m.fileType,
        pointCount: m.pointCount,
        importedAt: m.importedAt,
        importedBy: m.importedBy
      }));
    } catch (error) {
      console.error('Error finding all reference maps:', error);
      return [];
    }
  });

  /**
   * Get a specific map with all its points
   */
  ipcMain.handle('refMaps:findById', async (_event, mapId: string) => {
    try {
      const map = await repository.findByIdWithPoints(mapId);
      if (!map) return null;

      return {
        mapId: map.mapId,
        mapName: map.mapName,
        filePath: map.filePath,
        fileType: map.fileType,
        pointCount: map.pointCount,
        importedAt: map.importedAt,
        importedBy: map.importedBy,
        points: map.points.map(p => ({
          pointId: p.pointId,
          mapId: p.mapId,
          name: p.name,
          description: p.description,
          lat: p.lat,
          lng: p.lng,
          state: p.state,
          category: p.category,
          rawMetadata: p.rawMetadata
        }))
      };
    } catch (error) {
      console.error('Error finding reference map by ID:', error);
      return null;
    }
  });

  /**
   * Get all points from all maps (for Atlas layer)
   */
  ipcMain.handle('refMaps:getAllPoints', async () => {
    try {
      const points = await repository.getAllPoints();
      return points.map(p => ({
        pointId: p.pointId,
        mapId: p.mapId,
        name: p.name,
        description: p.description,
        lat: p.lat,
        lng: p.lng,
        state: p.state,
        category: p.category,
        rawMetadata: p.rawMetadata
      }));
    } catch (error) {
      console.error('Error getting all reference map points:', error);
      return [];
    }
  });

  /**
   * Update a map's name
   */
  ipcMain.handle('refMaps:update', async (_event, mapId: string, updates: { mapName?: string }) => {
    try {
      const map = await repository.update(mapId, updates);
      if (!map) return null;

      return {
        mapId: map.mapId,
        mapName: map.mapName,
        filePath: map.filePath,
        fileType: map.fileType,
        pointCount: map.pointCount,
        importedAt: map.importedAt,
        importedBy: map.importedBy
      };
    } catch (error) {
      console.error('Error updating reference map:', error);
      return null;
    }
  });

  /**
   * Delete a reference map and all its points
   */
  ipcMain.handle('refMaps:delete', async (_event, mapId: string) => {
    try {
      await repository.delete(mapId);
      return { success: true };
    } catch (error) {
      console.error('Error deleting reference map:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error deleting map'
      };
    }
  });

  /**
   * Get statistics about reference maps
   */
  ipcMain.handle('refMaps:getStats', async () => {
    try {
      const mapCount = await repository.count();
      const pointCount = await repository.countPoints();
      const categories = await repository.getCategories();
      const states = await repository.getStates();

      return {
        mapCount,
        pointCount,
        categories,
        states
      };
    } catch (error) {
      console.error('Error getting reference map stats:', error);
      return {
        mapCount: 0,
        pointCount: 0,
        categories: [],
        states: []
      };
    }
  });

  /**
   * Get supported file extensions
   */
  ipcMain.handle('refMaps:getSupportedExtensions', () => {
    return getSupportedExtensions();
  });

  /**
   * Find matching reference map points for a location name
   * Phase 2: Auto-matching during location creation
   */
  ipcMain.handle('refMaps:findMatches', async (
    _event,
    query: string,
    options?: { threshold?: number; limit?: number; state?: string | null }
  ) => {
    try {
      const matches = await matcher.findMatches(query, options);
      return matches.map(m => ({
        pointId: m.pointId,
        mapId: m.mapId,
        name: m.name,
        description: m.description,
        lat: m.lat,
        lng: m.lng,
        state: m.state,
        category: m.category,
        mapName: m.mapName,
        score: m.score
      }));
    } catch (error) {
      console.error('Error finding reference map matches:', error);
      return [];
    }
  });
}
