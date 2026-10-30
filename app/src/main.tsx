import { render } from 'preact';
import '@fontsource/aref-ruqaa/400.css';
import '@fontsource/aref-ruqaa/700.css';
import '@fontsource/amiri/400.css';
import '@fontsource/amiri/700.css';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './App';
import { initPush } from './push';
import { initChrome } from './chrome';
import { startRefreshLoop } from './refresh';

render(<App />, document.getElementById('app')!);
void initPush();
void startRefreshLoop();
initChrome();
