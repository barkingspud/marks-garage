import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The Android app (and later iOS). It bundles the web app (dist/) and runs the core
 * itself, so it needs no server. See web/src/native/capacitor.ts.
 */
const config: CapacitorConfig = {
  // The Play Store ID: permanent once published.
  appId: 'io.github.barkingspud.cratecompanion',
  appName: 'Crate Companion',
  webDir: 'dist',
  android: {
    // Status bar and gesture area draw over the app's own background.
    backgroundColor: '#0d1621',
  },
};

export default config;
