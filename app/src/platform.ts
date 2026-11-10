import { Capacitor } from '@capacitor/core';

// Push notifications, the background-audio service and the splash screen exist only in the mobile apps.
export const isNative = (): boolean => Capacitor.isNativePlatform();
