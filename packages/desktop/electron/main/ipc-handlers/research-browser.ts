/**
 * Research Browser IPC Handlers
 * Handles research:* IPC channels for the external browser feature
 *
 * Channel naming follows CLAUDE.md convention: domain:action
 */
import { ipcMain } from 'electron';
import {
  launchResearchBrowser,
  closeResearchBrowser,
  getResearchBrowserStatus,
} from '../../services/research-browser-service';

/**
 * Register all Research Browser IPC handlers
 */
export function registerResearchBrowserHandlers(): void {
  // research:launch - Launch the Ungoogled Chromium browser
  ipcMain.handle('research:launch', async () => {
    try {
      return await launchResearchBrowser();
    } catch (error) {
      console.error('Error launching research browser:', error);
      return { success: false, error: String(error) };
    }
  });

  // research:close - Close the browser
  ipcMain.handle('research:close', async () => {
    try {
      await closeResearchBrowser();
      return { success: true };
    } catch (error) {
      console.error('Error closing research browser:', error);
      return { success: false, error: String(error) };
    }
  });

  // research:status - Get browser status
  ipcMain.handle('research:status', async () => {
    try {
      return getResearchBrowserStatus();
    } catch (error) {
      console.error('Error getting research browser status:', error);
      return { running: false };
    }
  });
}
