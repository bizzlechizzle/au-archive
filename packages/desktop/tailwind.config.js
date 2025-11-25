import { skeleton } from '@skeletonlabs/tw-plugin';

export default {
  content: [
    './index.html',
    './src/**/*.{svelte,js,ts}',
    './node_modules/@skeletonlabs/skeleton/**/*.{html,js,svelte,ts}'
  ],
  theme: {
    extend: {
      colors: {
        accent: '#b9975c',
        background: '#fffbf7',
        foreground: '#454545',
        primary: '#2563eb',
        secondary: '#64748b',
        // DECISION-010: Official brand colors
        danger: '#99221E',      // Error/warning red
        success: '#19612E',     // Verified/success green
        verified: '#19612E',    // Alias for verification badges
        unverified: '#9ca3af',  // Gray for unverified states (DECISION-013)
        error: '#99221E',       // Alias for error states
      },
      fontFamily: {
        heading: ['Roboto Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        body: ['Lora', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [skeleton],
};
