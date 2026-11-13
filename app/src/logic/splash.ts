export interface LaunchSplashConfig {
  launchAutoHide?: boolean;
  launchFadeOutDuration?: number;
}

// @capacitor/splash-screen on Android: with a launch fade-out, the compat SplashScreen can start the exit
// animation on the first frame, and a SplashScreen.hide() sent while it runs is ignored. When the fade ends,
// the plugin's pre-draw listener, never removed, blocks drawing for good and leaves the app on the splash.
export function launchHideCanBeLost({ launchAutoHide = true, launchFadeOutDuration = 200 }: LaunchSplashConfig) {
  return !launchAutoHide && launchFadeOutDuration > 0;
}
