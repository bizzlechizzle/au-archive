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
        // Base colors
        accent: '#B9975C',      // Camel (Gold main)
        background: '#FFFBF7',  // Porcelain
        foreground: '#454545',  // Gunmetal

        // Semantic aliases
        primary: '#B9975C',     // Camel (Gold main)
        secondary: '#7A7A7A',   // Grey (light gunmetal)
        danger: '#AE1C09',      // Oxidized Iron
        success: '#286736',     // Dark Emerald
        verified: '#286736',    // Dark Emerald
        unverified: '#7A7A7A',  // Grey
        error: '#AE1C09',       // Oxidized Iron

        // Full brand palette with variants
        // Gray/Black
        gray: {
          DEFAULT: '#454545',   // Gunmetal
          light: '#7A7A7A',     // Grey
          dark: '#1F1F1F',      // Carbon Black
        },
        // White
        white: {
          DEFAULT: '#FFFBF7',   // Porcelain
          light: '#FFFFFF',     // White
          dark: '#FFEBD6',      // Antique White
        },
        // Gold (Main Accent)
        gold: {
          DEFAULT: '#B9975C',   // Camel
          light: '#D4BF9B',     // Pale Oak
          dark: '#725A31',      // Olive Bark
        },
        // Red (Error/Danger)
        red: {
          DEFAULT: '#AE1C09',   // Oxidized Iron
          light: '#F5533D',     // Tomato
          dark: '#741306',      // Molten Lava
        },
        // Green (Success/Verified)
        green: {
          DEFAULT: '#286736',   // Dark Emerald
          light: '#39934D',     // Sea Green
          dark: '#173B1F',      // Deep Forest
        },
        // Blue (REFERENCE PINS ONLY)
        blue: {
          DEFAULT: '#49696E',   // Blue Slate
          light: '#91B1B6',     // Cool Steel
          dark: '#314649',      // Dark Slate Gray
        },
      },
      fontFamily: {
        heading: ['Roboto Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        body: ['Lora', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [skeleton],
};
