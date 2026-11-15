import appStoreBadge from '../badges/app-store-ar.svg';
import googlePlayBadge from '../badges/google-play-ar.png';
import { listedStores, type StoreId } from '../logic/install';
import { STORES } from '../site';

// Official Arabic badges, unaltered. Google's PNG carries its own clear space, which `.play` crops back into the CSS clear space.
const BADGES: Record<StoreId, { src: string; alt: string; width: number; height: number }> = {
  appstore: { src: appStoreBadge, alt: 'تنزيل من App Store', width: 119.66, height: 40 },
  play: { src: googlePlayBadge, alt: 'احصل عليه من Google Play', width: 154, height: 60 },
};
// Apple asks for its badge first when several stores' badges are shown together.
const BADGE_ORDER: StoreId[] = ['appstore', 'play'];

export function StoreBadges({ ids }: { ids: StoreId[] }) {
  return (
    <div class="badges">
      {BADGE_ORDER.filter((id) => listedStores(ids).includes(id)).map((id) => STORES.find((s) => s.id === id)!).map((s) => (
        <a class={s.id} href={s.url} target="_blank" rel="noopener noreferrer" key={s.id}>
          <img {...BADGES[s.id]} />
        </a>
      ))}
    </div>
  );
}
