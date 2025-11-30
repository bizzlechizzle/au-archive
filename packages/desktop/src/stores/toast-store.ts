/**
 * Toast notification store
 * FIX 4.6: Provides toast/snackbar notifications for user feedback
 * OPT-018: Timer cleanup to prevent memory leaks
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
  // OPT-018: Track timers for cleanup
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  return {
    subscribe,

    /**
     * Show a toast notification
     */
    show(message: string, type: Toast['type'] = 'info', duration = 5000): string {
      const id = crypto.randomUUID();
      update(toasts => [...toasts, { id, message, type, duration }]);

      if (duration > 0) {
        // OPT-018: Store timer reference for cleanup
        const timer = setTimeout(() => this.dismiss(id), duration);
        timers.set(id, timer);
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
      // OPT-018: Clear timer when toast is dismissed
      const timer = timers.get(id);
      if (timer) {
        clearTimeout(timer);
        timers.delete(id);
      }
      update(toasts => toasts.filter(t => t.id !== id));
    },

    /**
     * Clear all toasts
     */
    clear(): void {
      // OPT-018: Clear all timers when clearing toasts
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
      update(() => []);
    },
  };
}

export const toasts = createToastStore();
