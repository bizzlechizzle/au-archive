import { ipcMain } from 'electron';
import { getDatabase } from './database';
import { SQLiteLocationRepository } from '../repositories/sqlite-location-repository';
import type { LocationInput, LocationFilters } from '@au-archive/core';

export function registerIpcHandlers() {
  const db = getDatabase();
  const locationRepo = new SQLiteLocationRepository(db);

  // Location queries
  ipcMain.handle('location:findAll', async (_event, filters?: LocationFilters) => {
    try {
      return await locationRepo.findAll(filters);
    } catch (error) {
      console.error('Error finding locations:', error);
      throw error;
    }
  });

  ipcMain.handle('location:findById', async (_event, id: string) => {
    try {
      return await locationRepo.findById(id);
    } catch (error) {
      console.error('Error finding location:', error);
      throw error;
    }
  });

  ipcMain.handle('location:create', async (_event, input: LocationInput) => {
    try {
      return await locationRepo.create(input);
    } catch (error) {
      console.error('Error creating location:', error);
      throw error;
    }
  });

  ipcMain.handle('location:update', async (_event, id: string, input: Partial<LocationInput>) => {
    try {
      return await locationRepo.update(id, input);
    } catch (error) {
      console.error('Error updating location:', error);
      throw error;
    }
  });

  ipcMain.handle('location:delete', async (_event, id: string) => {
    try {
      await locationRepo.delete(id);
    } catch (error) {
      console.error('Error deleting location:', error);
      throw error;
    }
  });

  ipcMain.handle('location:count', async (_event, filters?: LocationFilters) => {
    try {
      return await locationRepo.count(filters);
    } catch (error) {
      console.error('Error counting locations:', error);
      throw error;
    }
  });

  // Stats queries
  ipcMain.handle('stats:topStates', async (_event, limit: number = 5) => {
    try {
      const result = await db
        .selectFrom('locs')
        .select(['address_state as state', (eb) => eb.fn.count('locid').as('count')])
        .where('address_state', 'is not', null)
        .groupBy('address_state')
        .orderBy('count', 'desc')
        .limit(limit)
        .execute();
      return result;
    } catch (error) {
      console.error('Error getting top states:', error);
      throw error;
    }
  });

  ipcMain.handle('stats:topTypes', async (_event, limit: number = 5) => {
    try {
      const result = await db
        .selectFrom('locs')
        .select(['type', (eb) => eb.fn.count('locid').as('count')])
        .where('type', 'is not', null)
        .groupBy('type')
        .orderBy('count', 'desc')
        .limit(limit)
        .execute();
      return result;
    } catch (error) {
      console.error('Error getting top types:', error);
      throw error;
    }
  });

  console.log('IPC handlers registered');
}
