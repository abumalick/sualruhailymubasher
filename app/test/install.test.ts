import { describe, expect, it } from 'vitest';
import { installStores } from '../src/logic/install';

const UA = {
  android: 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
  // iPadOS Safari asks for desktop sites and sends a Mac user agent.
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  ipadMini: 'Mozilla/5.0 (iPad; CPU OS 16_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};

const web = (ua: string, maxTouchPoints = 0) => installStores({ nativeUI: false, ua, maxTouchPoints, dismissed: false });

describe('installStores', () => {
  it('an Android visitor is offered Google Play only', () => {
    expect(web(UA.android, 5)).toEqual(['play']);
  });

  it('an iPhone visitor is offered the App Store only, in Safari and in other browsers', () => {
    expect(web(UA.iphone, 5)).toEqual(['appstore']);
    expect(web(UA.iphoneChrome, 5)).toEqual(['appstore']);
  });

  it('an iPad is offered the App Store, even when it sends a Mac user agent', () => {
    expect(web(UA.ipad, 5)).toEqual(['appstore']);
    expect(web(UA.ipadMini, 5)).toEqual(['appstore']);
  });

  it('a desktop visitor is offered both stores, Google Play first', () => {
    expect(web(UA.windows)).toEqual(['play', 'appstore']);
    expect(web(UA.mac)).toEqual(['play', 'appstore']);
  });

  it('nothing is offered inside the mobile apps or in the store-screenshot build', () => {
    expect(installStores({ nativeUI: true, ua: UA.android, maxTouchPoints: 5, dismissed: false })).toBeNull();
    expect(installStores({ nativeUI: true, ua: UA.iphone, maxTouchPoints: 5, dismissed: false })).toBeNull();
  });

  it('nothing is offered once the visitor dismissed it', () => {
    expect(installStores({ nativeUI: false, ua: UA.android, maxTouchPoints: 5, dismissed: true })).toBeNull();
    expect(installStores({ nativeUI: false, ua: UA.windows, maxTouchPoints: 0, dismissed: true })).toBeNull();
  });
});
