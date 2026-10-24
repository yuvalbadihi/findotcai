import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const origin = 'http://127.0.0.1:5191';
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    '--host',
    '127.0.0.1',
    '--port',
    '5191',
    '--strictPort',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
let serverOutput = '';
server.stdout.on('data', (chunk) => (serverOutput += chunk));
server.stderr.on('data', (chunk) => (serverOutput += chunk));
for (let attempt = 0; ; attempt++) {
  try {
    if ((await fetch(origin)).ok) break;
  } catch {}
  if (attempt >= 60 || server.exitCode !== null) {
    server.kill();
    throw new Error('Preview failed: ' + serverOutput);
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
}
process.on('exit', () => server.kill());
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
  headless: true,
});
const errors = [];
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 600 },
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install();
  const sdk = (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
    const now=Math.floor(Date.now()/1000);window.liked=false;window.calls=0;window.delayStats=false;window.statsError=null;window.invalidResponse=false;window.maintenanceCalls=0;
    window.tgEvents={};window.painted={};window.haptics=[];
    window.entry={group:{id:-1002187584621,title:'Free Market',username:'freemarket',memberCount:2356,starsPerMessage:39,metadataCheckedAt:now},capturedAt:now,windowStartedAt:now-86400,
      activity:{messages:11,posters:6,messagesPerDay:2,dailyWindowSeconds:86400,lastMessageAt:now-180},language:{status:'estimated',code:'eng',label:'English',languages:[{code:'eng',label:'English',share:100}]},
      adminSample:{complete:38,partial:0,visibleUniqueGifts:1765,valuation:{currency:'GRAM',amountNano:'302837725290326',status:'complete',checkedAt:now-3600}}};
    window.extraEntries=[];
    window.Telegram={WebApp:{initData:'test',colorScheme:'dark',ready(){},expand(){},onEvent(name,handler){window.tgEvents[name]=handler;},
      themeParams:{bg_color:'#17212b',secondary_bg_color:'#232e3c',section_bg_color:'#17212b',text_color:'#f5f5f5',hint_color:'#708499',subtitle_text_color:'#708499',link_color:'#6ab3f3',accent_text_color:'#6ab2f2',section_header_text_color:'#6ab3f3',destructive_text_color:'#ec3942'},
      isVersionAtLeast(version){const [major,minor]=version.split('.').map(Number);return major<8||(major===8&&!minor);},
      setHeaderColor(color){window.painted.header=color;},setBackgroundColor(color){window.painted.background=color;},setBottomBarColor(color){window.painted.bottomBar=color;},
      BackButton:{isVisible:false,show(){this.isVisible=true;return this;},hide(){this.isVisible=false;return this;},onClick(handler){window.tgEvents.back=handler;return this;}},
      SettingsButton:{isVisible:false,show(){this.isVisible=true;return this;},onClick(handler){window.tgEvents.settings=handler;return this;}},
      HapticFeedback:{impactOccurred(style){window.haptics.push('impact:'+style);},notificationOccurred(type){window.haptics.push('notification:'+type);},selectionChanged(){window.haptics.push('selection');}},
      Serverless:{call(name,input,callback){
      if(name==='getOtcStats'){
        window.calls++;const data=JSON.parse(JSON.stringify(window.entry));data.likes={count:4+(window.liked?1:0),likedByMe:window.liked};
        const directory={apiVersion:3,entries:[data,...JSON.parse(JSON.stringify(window.extraEntries))],capturedAt:now};
        const respond=()=>window.statsError?callback(window.statsError):callback(null,window.invalidResponse?{}:directory);
        if(window.delayStats)window.releaseStats=respond;else respond();
      }else if(name==='refreshDirectory'){window.maintenanceCalls++;const done=()=>callback(window.maintenanceError||null,{changed:!!window.maintenanceChanged});if(window.delayMaintenance)window.releaseMaintenance=done;else done();}else if(name==='setOtcLike') {window.liked=input.liked;if(window.unlist&&!input.liked){callback(null,{chatId:input.chatId,available:false,likes:null});return;}callback(null,{chatId:input.chatId,likes:{count:4+(window.liked?1:0),likedByMe:window.liked}});}
    }}}};
  `,
    });
  await page.route('https://telegram.org/js/telegram-web-app.js', sdk);
  await page.goto(origin);
  await page.waitForSelector('.otc-card:not(.skeleton)');
  assert.equal(await page.locator('#live-status,#live-label').count(), 0);
  // Updates are automatic and silent: there is no refresh control at all.
  assert.equal(await page.locator('#refresh-button').count(), 0);
  assert.equal(await page.locator('#sort').inputValue(), 'rank');
  assert.doesNotMatch(
    await page.locator('body').innerText(),
    /Live|10s|Updating|Connecting/,
  );
  // An unchanged response produces no mutations to the list or its controls.
  await page.evaluate(() => {
    window.originalCard = document.querySelector('.otc-card');
    window.originalHeart = document.querySelector('.like-button');
    window.originalImage = document.querySelector('.currency-icon');
    window.originalCycle = document.querySelector('.card-view');
    window.mutations = [];
    window.observer = new MutationObserver((records) =>
      window.mutations.push(...records.map((record) => record.type)),
    );
    window.observer.observe(document.getElementById('cards'), {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  });
  await page.clock.fastForward(10000);
  await page.waitForFunction(() => window.calls === 2);
  assert.deepEqual(await page.evaluate(() => window.mutations), []);
  assert.equal(
    await page.evaluate(
      () => window.originalCard === document.querySelector('.otc-card'),
    ),
    true,
  );
  assert.equal(await page.locator('.skeleton').count(), 0);
  // A real update patches text in place and leaves focus, images and buttons intact.
  await page.locator('.card-view').focus();
  await page.evaluate(() => {
    window.entry.activity.messagesPerDay = 3;
    window.entry.group.memberCount = 2357;
  });
  await page.clock.fastForward(10000);
  await page.waitForFunction(
    () => document.querySelector('.frequency').textContent === '3 /day',
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.originalCard === document.querySelector('.otc-card') &&
        window.originalHeart === document.querySelector('.like-button') &&
        window.originalImage === document.querySelector('.currency-icon') &&
        window.originalCycle === document.querySelector('.card-view'),
    ),
    true,
  );
  assert.equal(
    await page
      .locator('.card-view')
      .evaluate((node) => document.activeElement === node),
    true,
  );
  assert.equal(await page.locator('#status').textContent(), '');
  // Reused event handlers keep cycling through all sizes, and likes still work.
  for (const expected of ['large', 'compact', 'normal']) {
    await page.locator('.card-view').click();
    assert.equal(
      await page.locator('.otc-card').getAttribute('data-mode'),
      expected,
    );
  }
  await page.locator('.like-button').click();
  await page.waitForFunction(
    () => !document.querySelector('.like-button').disabled,
  );
  assert.equal(
    await page.locator('.like-button').getAttribute('aria-pressed'),
    'true',
  );
  // An old read must not overwrite a like completed while that read was pending.
  await page.evaluate(() => {
    window.delayStats = true;
  });
  await page.clock.fastForward(10000);
  await page.locator('.like-button').click();
  await page.evaluate(() => {
    window.releaseStats();
    window.delayStats = false;
  });
  await page.waitForFunction(
    () =>
      document.querySelector('.like-button').getAttribute('aria-pressed') ===
      'false',
  );
  await page.locator('.like-button').click();
  // Invalid successful responses retain the current list instead of clearing it.
  await page.evaluate(() => {
    window.invalidResponse = true;
    window.savedCard = document.querySelector('.otc-card');
  });
  await page.clock.fastForward(10000);
  assert.equal(
    await page.evaluate(
      () => window.savedCard === document.querySelector('.otc-card'),
    ),
    true,
  );
  assert.equal(await page.locator('#status').textContent(), '');
  await page.evaluate(() => {
    window.invalidResponse = false;
  });
  // A slow background call never shows a status, replaces the card or overlaps.
  await page.evaluate(() => {
    window.delayStats = true;
    window.mutations = [];
  });
  const beforeSlow = await page.evaluate(() => window.calls);
  await page.clock.fastForward(10000);
  await page.waitForFunction((count) => window.calls === count + 1, beforeSlow);
  assert.equal(await page.locator('#status').textContent(), '');
  await page.clock.fastForward(10000);
  assert.equal(await page.evaluate(() => window.calls), beforeSlow + 1);
  assert.deepEqual(await page.evaluate(() => window.mutations), []);
  await page.evaluate(() => {
    window.statsError = { message: 'Temporary outage' };
    window.releaseStats();
    window.delayStats = false;
  });
  assert.equal(await page.locator('#status').textContent(), '');
  assert.equal(await page.locator('.otc-card').count(), 1);
  await page.evaluate(() => {
    window.statsError = null;
  });
  await page.clock.fastForward(10000);
  // Filters, settings and scroll position survive a background change.
  await page.locator('#filter-toggle').click();
  await page.locator('[data-liked=liked]').click();
  await page.locator('#language').selectOption('eng');
  await page.locator('#settings-toggle').click();
  await page.locator('[data-density=large]').click();
  await page.locator('[data-theme-choice=light]').click();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 260 });
  await page.evaluate(() => {
    const spacer = document.createElement('div');
    spacer.style.height = '1200px';
    document.body.append(spacer);
    scrollTo(0, 160);
    window.savedCard = document.querySelector('.otc-card');
    window.savedTop = window.savedCard.getBoundingClientRect().top;
    window.entry.activity.messagesPerDay = 4;
  });
  await page.clock.fastForward(10000);
  await page.waitForFunction(
    () => document.querySelector('[data-metric=daily]').textContent === '4',
  );
  assert.ok(
    await page.evaluate(
      () =>
        Math.abs(
          document.querySelector('.otc-card').getBoundingClientRect().top -
            window.savedTop,
        ) < 1,
    ),
  );
  assert.equal(
    await page.locator('.otc-card').getAttribute('data-mode'),
    'large',
  );
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  assert.equal(await page.locator('#language').inputValue(), 'eng');
  assert.equal(
    await page.locator('[data-liked=liked]').getAttribute('aria-pressed'),
    'true',
  );
  // Structural changes reuse the current card, header controls and logo as well.
  // A lapsed verification ("paused") is internal and never labels a card.
  await page.evaluate(() => {
    window.savedImage = document.querySelector('.currency-icon');
    window.savedCycle = document.querySelector('.card-view');
    window.entry.adminSample.valuation.status = 'partial';
    window.entry.state = 'paused';
  });
  await page.clock.fastForward(10000);
  await page.waitForSelector('.partial-tag');
  assert.equal(await page.locator('.otc-card').getByText('Paused').count(), 0);
  assert.equal(
    await page.evaluate(
      () =>
        window.savedCard === document.querySelector('.otc-card') &&
        window.savedImage === document.querySelector('.currency-icon') &&
        window.savedCycle === document.querySelector('.card-view'),
    ),
    true,
  );
  // The app waits while hidden and catches up quietly when shown again.
  await page.evaluate(() => {
    window.testHidden = true;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => window.testHidden,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hiddenCalls = await page.evaluate(() => window.calls);
  await page.clock.fastForward(10000);
  assert.equal(await page.evaluate(() => window.calls), hiddenCalls);
  await page.evaluate(() => {
    window.testHidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(
    (count) => window.calls === count + 1,
    hiddenCalls,
  );
  // Reduced-motion users get the same updates without animations.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  await page.evaluate(() => {
    window.entry.activity.messagesPerDay = 5;
  });
  await page.clock.fastForward(10000);
  await page.waitForFunction(
    () => document.querySelector('[data-metric=daily]').textContent === '5',
  );
  await page.waitForFunction(
    () =>
      document.querySelector('[data-metric=daily]').getAnimations().length ===
      0,
  );
  const offlineCalls = await page.evaluate(() => window.calls);
  await context.setOffline(true);
  await page.waitForFunction(() =>
    document.getElementById('status').textContent.includes('offline'),
  );
  await page.clock.fastForward(10000);
  assert.equal(await page.evaluate(() => window.calls), offlineCalls);
  await context.setOffline(false);
  await page.waitForFunction(
    (count) => window.calls === count + 1,
    offlineCalls,
  );
  await page.waitForFunction(
    () => document.getElementById('status').textContent === '',
  );
  await page.evaluate(() => {
    window.statsError = { type: 'UNAUTHORIZED', message: 'Expired' };
  });
  await page.clock.fastForward(10000);
  await page.waitForFunction(() =>
    document.getElementById('status').textContent.includes('session expired'),
  );
  const expiredCalls = await page.evaluate(() => window.calls);
  await page.clock.fastForward(20000);
  assert.equal(await page.evaluate(() => window.calls), expiredCalls);
  // Maintenance stays independent from reads, with at most one job in flight.
  await page.reload();
  await page.waitForSelector('.otc-card:not(.skeleton)');
  await page.evaluate(()=>{window.delayMaintenance=true;});
  await page.clock.fastForward(10000);
  const maintenanceCalls=await page.evaluate(()=>window.maintenanceCalls);
  await page.clock.fastForward(10000);
  assert.equal(await page.evaluate(()=>window.maintenanceCalls),maintenanceCalls);
  await page.evaluate(()=>{
    window.entry.group.starsPerMessage=0;
    window.maintenanceChanged=true;window.delayMaintenance=false;window.releaseMaintenance();
  });
  await page.waitForFunction(()=>document.querySelector('.price').textContent==='Free');
  await page.evaluate(()=>{window.maintenanceChanged=false;});
  // Reset the saved large preference before checking each density's cycle.
  await page.locator('#settings-toggle').click();
  await page.locator('[data-density=normal]').click();
  await page.keyboard.press('Escape');
  // Every density fits narrow screens; themes stay under user control.
  for(const width of [320,390,768]) {
    await page.setViewportSize({width,height:700});
    for(const mode of ['large','compact','normal']) {
      await page.locator('.card-view').click();
      assert.equal(await page.locator('.otc-card').getAttribute('data-mode'),mode);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
  }
  await page.locator('#settings-toggle').click();
  for(const mode of ['dark','light','device']) {
    await page.locator('[data-theme-choice='+mode+']').click();
    assert.equal(await page.evaluate(()=>localStorage.getItem('otc-theme-mode')),mode);
  }
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{window.Telegram.WebApp.openTelegramLink=url=>window.openedLink=url;});
  await page.locator('#add-otc').click();
  assert.equal(await page.evaluate(()=>window.openedLink),'https://t.me/FindOTCAi?startgroup&admin=manage_chat');
  // Card group links open inside Telegram too.
  await page.locator('.group-name').click();
  assert.equal(await page.evaluate(()=>window.openedLink),'https://t.me/freemarket');
  // Telegram's header, background and bottom bar follow every theme choice.
  const chrome=()=>page.evaluate(()=>({...window.painted,page:getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),meta:document.querySelector('meta[name=theme-color]').content}));
  const keyed=(color)=>({header:'secondary_bg_color',background:'secondary_bg_color',bottomBar:'secondary_bg_color',page:color,meta:color});
  const painted=(color)=>({header:color,background:color,bottomBar:color,page:color,meta:color});
  assert.deepEqual(await chrome(),keyed('#232e3c'));
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()),'#17212b');
  await page.locator('#settings-toggle').click();
  await page.locator('[data-theme-choice=light]').click();
  assert.deepEqual(await chrome(),painted('#f4f6f8'));
  await page.locator('[data-theme-choice=dark]').click();
  assert.deepEqual(await chrome(),keyed('#232e3c'));
  // When Telegram turns Day, Night keeps the built-in palette and Device follows Telegram.
  await page.evaluate(()=>{Object.assign(window.Telegram.WebApp,{colorScheme:'light',themeParams:{bg_color:'#ffffff',secondary_bg_color:'#efeff4',section_bg_color:'#ffffff',text_color:'#000000',hint_color:'#8e8e93',link_color:'#007aff'}});window.tgEvents.themeChanged.call(window.Telegram.WebApp);});
  assert.deepEqual(await chrome(),painted('#17212b'));
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await page.locator('[data-theme-choice=device]').click();
  assert.deepEqual(await chrome(),keyed('#efeff4'));
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  // Changing a choice ticks; tapping the current one does not.
  await page.evaluate(()=>{window.haptics=[];});
  await page.locator('[data-theme-choice=device]').click();
  await page.locator('[data-density=large]').click();
  await page.locator('[data-density=normal]').click();
  assert.deepEqual(await page.evaluate(()=>window.haptics),['selection','selection']);
  // Telegram's back button closes the open panel, then hides itself.
  assert.equal(await page.evaluate(()=>window.Telegram.WebApp.BackButton.isVisible),true);
  await page.evaluate(()=>window.tgEvents.back());
  assert.ok(await page.locator('#settings').isHidden());
  assert.equal(await page.evaluate(()=>window.Telegram.WebApp.BackButton.isVisible),false);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'settings-toggle');
  // Settings in Telegram's ⋮ menu opens the panel in view from anywhere in the list.
  assert.equal(await page.evaluate(()=>window.Telegram.WebApp.SettingsButton.isVisible),true);
  await page.evaluate(()=>{window.listSpacer=document.createElement('div');window.listSpacer.style.height='2000px';document.querySelector('.directory').append(window.listSpacer);scrollTo(0,1200);window.tgEvents.settings();});
  await page.waitForFunction(()=>Math.abs(document.getElementById('settings').getBoundingClientRect().top-document.querySelector('.toolbar').getBoundingClientRect().bottom)<1);
  assert.equal(await page.evaluate(()=>window.Telegram.WebApp.BackButton.isVisible),true);
  await page.evaluate(()=>{window.tgEvents.back();window.listSpacer.remove();scrollTo(0,0);});
  assert.equal(await page.locator('html').getAttribute('data-performance'),null);
  // Values refresh every 10 seconds, but positions change only on a re-rank
  // (every three minutes) or at once when the viewer searches, filters or sorts.
  const titles=()=>page.evaluate(()=>[...document.querySelectorAll('.otc-card .group-name')].map((node)=>node.textContent));
  await page.evaluate(()=>{window.entry.rank={version:1,score:50};window.extraEntries=[{...JSON.parse(JSON.stringify(window.entry)),group:{...window.entry.group,id:-1002000000002,title:'Second Market',username:'secondmarket',memberCount:10},rank:{version:1,score:40}}];});
  await page.clock.fastForward(10000);
  await page.waitForFunction(()=>document.querySelectorAll('.otc-card').length===2);
  await page.locator('#search').fill('market');
  await page.locator('#search').fill('');
  assert.deepEqual(await titles(),['@freemarket','@secondmarket']);
  await page.evaluate(()=>{window.extraEntries[0].rank.score=90;window.extraEntries[0].activity.messagesPerDay=7;});
  await page.clock.fastForward(10000);
  await page.waitForFunction(()=>document.querySelectorAll('.otc-card .frequency')[1]?.textContent==='7 /day');
  assert.deepEqual(await titles(),['@freemarket','@secondmarket']);
  await page.clock.fastForward(180000);
  await page.waitForFunction(()=>document.querySelector('.otc-card .group-name').textContent==='@secondmarket');
  await page.locator('#filter-toggle').click();
  await page.locator('#sort').selectOption('members');
  assert.deepEqual(await titles(),['@freemarket','@secondmarket']);
  await page.locator('#sort').selectOption('rank');
  assert.deepEqual(await titles(),['@secondmarket','@freemarket']);
  await page.locator('#filter-toggle').click();
  await page.evaluate(()=>{window.extraEntries=[];delete window.entry.rank;});
  await page.clock.fastForward(10000);
  await page.waitForFunction(()=>document.querySelectorAll('.otc-card').length===1);
  // A successful unlike can remove an OTC that was just unlisted.
  await page.evaluate(()=>{window.haptics=[];});
  await page.locator('.like-button').click();
  assert.deepEqual(await page.evaluate(()=>window.haptics),['impact:light']);
  await page.evaluate(()=>{window.unlist=true;});
  await page.locator('.like-button').click();
  await page.waitForFunction(()=>document.querySelectorAll('.otc-card').length===0);
  assert.equal(await page.locator('.like-error').count(),0);
  // Low-end Android devices, as Telegram reports them, get a still interface.
  const android=await browser.newContext({viewport:{width:390,height:600},userAgent:'Mozilla/5.0 (Linux; Android 12; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Telegram-Android/11.3.3 (Google Pixel 3a; Android 12; SDK 31; LOW)'});
  const lowEnd=await android.newPage();
  lowEnd.on('pageerror',(error)=>errors.push(error.message));
  await lowEnd.route('https://telegram.org/js/telegram-web-app.js',sdk);
  await lowEnd.goto(origin);
  await lowEnd.waitForSelector('.otc-card:not(.skeleton)');
  assert.equal(await lowEnd.locator('html').getAttribute('data-performance'),'low');
  assert.equal(await lowEnd.evaluate(()=>{document.querySelector('.like-button').setAttribute('aria-busy','true');return getComputedStyle(document.querySelector('.like-button .icon')).animationName;}),'none');
  await android.close();
  assert.deepEqual(errors, []);
  console.log(
    'PASS: no live label or refresh control; 10-second background cadence; zero DOM mutations for unchanged responses; changed text patches with stable cards/buttons/images/focus; no background status or skeletons; no overlap; error retention; no paused label; rank order holds between re-ranks and follows viewer sorts at once; filters/theme/size/scroll preserved; hidden pause; reduced motion; auth stop; Telegram header/background/bottom bar follow each theme; Telegram palette when schemes match; back and Settings buttons; haptics; in-Telegram links; low-end Android stills.',
  );
} finally {
  await browser.close();
  server.kill();
}
