/**
 * Toast notification store
 * FIX 4.6: Provides toast/snackbar notifications for user feedback
 */
import { writable } from 'svelte/store';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration: number;
}

function createToastStore() {
  const { subscribe, update } = writable<Toast[]>([]);

  return {
    subscribe,

    /**
     * Show a toast notification
     */
    show(message: string, type: Toast['type'] = 'info', duration = 5000): string {
      const id = crypto.randomUUID();
      update(toasts => [...toasts, { id, message, type, duration }]);

      if (duration > 0) {
        setTimeout(() => this.dismiss(id), duration);
      }

      return id;
    },

    /**
     * Show success toast (green, 5s)
     */
    success(message: string, duration = 5000): string {
      return this.show(message, 'success', duration);
    },

    /**
     * Show error toast (red, 10s - longer for errors)
     */
    error(message: string, duration = 10000): string {
      return this.show(message, 'error', duration);
    },

    /**
     * Show warning toast (yellow, 7s)
     */
    warning(message: string, duration = 7000): string {
      return this.show(message, 'warning', duration);
    },

    /**
     * Show info toast (blue, 5s)
     */
    info(message: string, duration = 5000): string {
      return this.show(message, 'info', duration);
    },

    /**
     * Dismiss a specific toast
     */
    dismiss(id: string): void {
      update(toasts => toasts.filter(t => t.id !== id));
    },

    /**
     * Clear all toasts
     */
    clear(): void {
      update(() => []);
    },
  };
}

export const toasts = createToastStore();
