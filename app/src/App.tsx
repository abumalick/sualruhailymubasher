import { useRoute } from './router';
import { NavBar } from './ui/NavBar';
import { Defs } from './ui/Star';

export function App() {
  document.documentElement.dir = 'rtl';
  document.documentElement.lang = 'ar';
  const route = useRoute();
  return (
    <div class="shell">
      <Defs />
      <div class="scroll">
        <div class="head">
          <div class="name">
            <h2>عبد الرزاق البدر</h2>
            <small>الدروس العلمية · المدينة النبوية</small>
          </div>
        </div>
        <main data-route={route.name} />
      </div>
      <NavBar route={route} />
    </div>
  );
}
