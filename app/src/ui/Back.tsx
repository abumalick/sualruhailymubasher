import { goBack } from '../router';
import { Icon } from './Star';

// The href is where the arrow leads when nothing of the app sits behind the page; otherwise it pops history.
export function Back({ fallback }: { fallback: string }) {
  return (
    <a
      class="back"
      href={fallback}
      aria-label="رجوع"
      onClick={(e) => {
        e.preventDefault();
        goBack(fallback);
      }}
    >
      <Icon id="i-back" />
    </a>
  );
}
