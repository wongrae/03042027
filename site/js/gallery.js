// Full gallery page: only exists from the wedding day (Phase 3). Before that,
// nothing is rendered or requested and the visitor is sent to the landing page.
import { config } from './config.js';
import { getPhase, PHASE_WEDDING } from './phase.js';
import { syncClock } from './clock.js';
import { pageNowMs } from './page-now.js';

(async () => {
  const clock = await syncClock({ timeoutMs: 2000 });
  if (getPhase(pageNowMs(clock), config) !== PHASE_WEDDING) {
    window.location.replace('../');
    return;
  }
  document.getElementById('root').append(document.getElementById('tpl-page').content.cloneNode(true));
})();
