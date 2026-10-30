import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'net.h2.albadrlessons',
  appName: 'دروس الشيخ عبد الرزاق البدر',
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
    SplashScreen: { backgroundColor: '#1c0b1a' },
  },
};

export default config;
