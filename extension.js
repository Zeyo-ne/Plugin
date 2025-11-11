const vscode = require('vscode');



function activate(context) {
  const config = () => vscode.workspace.getConfiguration('workLifeBalance');

  const state = {
    running: true,
    startTs: Date.now(),
    accumMs: 0
  };

 
  const gs = context.globalState;
  const saved = gs.get('wlb.state');
  if (saved) {
    state.startTs = saved.startTs || Date.now();
    state.accumMs = saved.accumMs || 0;
    state.running = saved.running !== false;
  }


  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.command = 'workLifeBalance.toggleTimer';
  context.subscriptions.push(item);

  function formatElapsed(ms) {
    const s = Math.floor(ms/1000);
    const hh = Math.floor(s/3600);
    const mm = Math.floor((s%3600)/60);
    const ss = s%60;
    if (hh>0) return `${hh}ч ${mm}м`;
    return `${mm}м ${ss}с`;
  }

  function updateStatus() {
    const now = Date.now();
    const elapsed = state.accumMs + (state.running ? (now - state.startTs) : 0);
    item.text = `$(heart) WLB ${formatElapsed(elapsed)}`;
    item.show();
  }


  let lastStretchAt = gs.get('wlb.lastStretchAt') || 0;
  let lastEyeAt = gs.get('wlb.lastEyeAt') || 0;

  function saveState() {
    gs.update('wlb.state', { startTs: state.startTs, accumMs: state.accumMs, running: state.running });
  }

  function showStretchReminder() {
    const snooze = config().get('snoozeMinutes') || 10;
    vscode.window.showInformationMessage('Пора сделать разминку! Сделайте короткий перерыв на 3–5 минут.', 'Начать перерыв', `Отложить на ${snooze} мин`).then(choice => {
      if (choice === 'Начать перерыв') openExercises();
      else if (choice && choice.startsWith('Отложить')) {
        const mins = parseInt(choice.split(' ')[2]);
        lastStretchAt = Date.now() + mins*60*1000;
        gs.update('wlb.lastStretchAt', lastStretchAt);
      }
    });
  }

  function showEyeReminder() {
    vscode.window.showInformationMessage('Правило 20-20-20: посмотри на что-то на расстоянии 6 метров в течение 20 секунд.', 'Запустить таймер 20с').then(choice => {
      if (choice === 'Запустить таймер 20с') openExercises('eyetimer');
    });
  }


  let panel = null;
  function openExercises(mode) {
    if (panel) {
      panel.reveal();
      return;
    }
    panel = vscode.window.createWebviewPanel('wlb.exercises', 'Work-Life Break', vscode.ViewColumn.One, { enableScripts: true });
    panel.webview.html = getWebviewHtml(panel.webview, context.extensionUri, mode || 'exercises');
    panel.onDidDispose(() => panel = null, null, context.subscriptions);

    panel.webview.onDidReceiveMessage(msg => {
      if (msg.type === 'breakDone') {
        lastStretchAt = Date.now();
        gs.update('wlb.lastStretchAt', lastStretchAt);
      }
    }, undefined, context.subscriptions);
  }

  function getWebviewHtml(webview, extUri, mode) {
    const exercises = [
      {title:'Повороты шеи', desc:'Медленно прокатывайте шею 5× в каждую сторону.'},
      {title:'Пожимания плечами', desc:'Поднимайте и опускайте плечи 10×.'},
      {title:'Растяжка запястий', desc:'Держите каждое запястье и аккуратно тяните пальцы назад 10 секунд.'},
      {title:'Наклон вперед', desc:'Встаньте и коснитесь пальцев ног (или тянитесь) в течение 20–30 секунд.'}
    ];
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Перерыв</title>
    <style>
      body{font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial; padding:16px}
      h1{margin-top:0}
      .ex{margin:10px 0;padding:10px;border-radius:8px;border:1px solid rgba(0,0,0,0.08)}
      .btn{display:inline-block;padding:8px 12px;border-radius:6px;border:1px solid #888;cursor:pointer;margin-top:8px}
      .count{font-size:48px;margin:20px 0}
    </style>
  </head>
  <body>
    <h1>${mode==='eyetimer' ? 'Таймер 20с для глаз' : 'Быстрый перерыв для разминки'}</h1>
    ${mode==='eyetimer' ? '<div>Посмотри на объект на расстоянии примерно 6 метров в течение 20 секунд.</div><div id="count" class="count">20</div><button id="start" class="btn">Начать</button>' : ''}
    ${mode!=='eyetimer' ? '<div>Попробуйте одно или несколько из этих коротких упражнений:</div>' : ''}
    ${mode!=='eyetimer' ? exercises.map(e=>`<div class="ex"><strong>${e.title}</strong><div>${e.desc}</div></div>`).join('') : ''}
    ${mode!=='eyetimer' ? '<button id="done" class="btn">Я сделал перерыв</button>' : ''}
    <script>
      const vscode = acquireVsCodeApi ? acquireVsCodeApi() : null;
      const startBtn = document.getElementById('start');
      const countEl = document.getElementById('count');
      if (startBtn) {
        startBtn.addEventListener('click', ()=>{
          let t = 20;
          countEl.textContent = t;
          const iv = setInterval(()=>{
            t--;
            countEl.textContent = t;
            if (t<=0) { clearInterval(iv); if (vscode) vscode.postMessage({type:'breakDone'}); alert('20 секунд прошло — молодец!'); }
          },1000);
        });
      }
      const doneBtn = document.getElementById('done');
      if (doneBtn) doneBtn.addEventListener('click', ()=>{ if (vscode) vscode.postMessage({type:'breakDone'}); alert('Спасибо — перерыв зафиксирован'); });
    </script>
  </body>
</html>`;
  }


  context.subscriptions.push(vscode.commands.registerCommand('workLifeBalance.openExercises', () => openExercises()));
  context.subscriptions.push(vscode.commands.registerCommand('workLifeBalance.toggleTimer', () => {
    state.running = !state.running;
    if (state.running) {
      state.startTs = Date.now();
    } else {
      state.accumMs += Date.now() - state.startTs;
    }
    saveState();
  }));
  context.subscriptions.push(vscode.commands.registerCommand('workLifeBalance.resetTimer', () => {
    state.accumMs = 0; state.startTs = Date.now(); state.running = true; saveState(); vscode.window.showInformationMessage('Таймер Work-Life сброшен.');
  }));


  setInterval(()=>{
    updateStatus();
    const now = Date.now();
    const elapsedMs = state.accumMs + (state.running ? (now - state.startTs) : 0);
    const remindMs = 1 * 60 * 1000;
    const eyeMs = 2 * 60 * 1000;

    if (now - lastStretchAt > remindMs && elapsedMs>0 && state.running) {
      lastStretchAt = now;
      gs.update('wlb.lastStretchAt', lastStretchAt);
      showStretchReminder();
    }

    if (now - lastEyeAt > eyeMs && elapsedMs>0 && state.running) {
      lastEyeAt = now;
      gs.update('wlb.lastEyeAt', lastEyeAt);
      showEyeReminder();
    }
  }, 1000);


  context.subscriptions.push({ dispose: () => saveState() });

  updateStatus();
}

function deactivate() {
  //. 
}

module.exports = { activate, deactivate };
