import { Capacitor } from '@capacitor/core';

// Push notifications, the background-audio service and the splash screen exist only in the mobile apps.
export const isNative = (): boolean => Capacitor.isNativePlatform();

// Screens and wording follow the mobile apps there, and in a web build made with VITE_NATIVE_UI=1
// (the store screenshots), which keeps the web's behaviour but shows the apps' screens.
export const showsNativeUI = (native: boolean, flag: string | undefined): boolean => native || flag === '1';

export const nativeUI = (): boolean => showsNativeUI(isNative(), import.meta.env.VITE_NATIVE_UI as string | undefined);
