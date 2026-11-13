import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.albadrmubasher.app',
  appName: 'البدر مباشر',
  webDir: 'dist',
  experimental: {
    ios: {
      spm: {
        packageOptions: {
          '@capacitor-firebase/messaging': { symlink: true },
        },
      },
    },
  },
  plugins: {
    CapacitorHttp: { enabled: true },
    SplashScreen: { backgroundColor: '#1c0b1a', launchAutoHide: false, launchFadeOutDuration: 0 },
  },
};

export default config;
