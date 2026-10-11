// 学习系统自检 v1.0（配套 学习记录 V3.1 / 学习周报 V3.1 · 模块 v3.1.2）
// 用法：在 Scriptable 应用中直接运行本脚本。
// 它会检查模块与数据状态，并发送一条测试通知（用于验证点击跳转）。
// 结果会复制到剪贴板并弹出显示，截图或粘贴发回 Minis 即可。

const L = [];
const ok = m => L.push('✅ ' + m);
const no = m => L.push('❌ ' + m);
const info = m => L.push('ℹ️ ' + m);
let mod = null;

(async () => {
try {
  let iosv = '未知';
  try { iosv = Device.systemVersion(); } catch (e) {}
  let scv = '未知';
  try { if (typeof Device.scriptableVersion === 'function') scv = Device.scriptableVersion(); } catch (e) {}
  L.push('学习系统自检 · ' + new Date().toLocaleString('zh-CN', { hour12: false }));
  L.push('iOS ' + iosv + ' · Scriptable ' + scv);
  L.push('');

  // 1) 模块文件是否就位
  try {
    const fm = FileManager.iCloud();
    const dir = fm.documentsDirectory();
    for (const name of ['StudyTracker V3.js', 'StudyTracker V3 报告.js']) {
      const p = fm.joinPath(dir, name);
      if (fm.fileExists(p)) {
        try { await fm.downloadFileFromiCloud(p); } catch (e) {}
        ok('iCloud/Scriptable 找到 ' + name + '（' + fm.fileSize(p) + ' 字节）');
      } else {
        const alt = fm.joinPath(dir, name.replace(/ /g, '%20'));
        if (fm.fileExists(alt)) no('文件名错误：' + name.replace(/ /g, '%20') + ' 需改回带空格的 ' + name);
        else no('iCloud/Scriptable 缺少 ' + name);
      }
    }
  } catch (e) { no('iCloud 检查失败：' + e.message); }
  try {
    const fm = FileManager.local();
    const dir = fm.documentsDirectory();
    for (const name of ['StudyTracker V3.js', 'StudyTracker V3 报告.js']) {
      if (fm.fileExists(fm.joinPath(dir, name))) ok('本地 Scriptable 目录也找到 ' + name);
    }
  } catch (e) {}

  // 2) 模块能否导入 + 函数是否齐全
  try {
    mod = importModule('StudyTracker V3');
    const need = ['run', 'recordEvent', 'recordPlan', 'verifyHistory', 'recordCommit'];
    const missing = need.filter(k => typeof mod[k] !== 'function');
    if (missing.length) no('模块函数缺失：' + missing.join('、'));
    else ok('模块导入成功（版本 ' + (mod.version || '未知（建议替换为 v3.1.2）') + '）');
  } catch (e) { no('importModule 失败：' + (e && e.message || e)); }

  // 3) Base64 传输能力（V3.1.1 传参方式依赖它）
  try {
    const t = Data.fromBase64String('5L2g5aW9').toRawString();
    if (t === '你好') ok('Base64 数据解码功能正常');
    else no('Base64 解码异常：' + t);
  } catch (e) { no('Base64 解码失败：' + e.message); }

  // 4) 本地状态与缓存
  if (mod && mod.bridge) {
    try {
      const s = mod.bridge.store();
      s.fm.writeString(s.path('selftest-probe.txt'), 'ok-' + Date.now());
      const back = s.fm.readString(s.path('selftest-probe.txt'));
      if (back && back.indexOf('ok-') === 0) ok('本地存储读写正常');
      else no('本地存储读回不一致');
    } catch (e) { no('本地存储异常：' + e.message); }
    try {
      const s = mod.bridge.store();
      const mirror = await mod.bridge.read(s, 'sessions-mirror.txt', '');
      if (mirror.trim()) {
        const parsed = mod.core.parse(mirror);
        ok('镜像缓存：' + parsed.records.length + ' 条记录 · 合计 ' + mod.core.dur(mod.core.sum(parsed.records)));
        if (parsed.issues.length) info('镜像中有 ' + parsed.issues.length + ' 行无法统计（报告内可查看原因）');
      } else {
        info('镜像缓存为空：还没成功同步过。手动运行一次「学习周报 V3.1」即可写入。');
      }
      const sync = await mod.bridge.readJSON(s, 'last-sync.json', null);
      if (sync && sync.when) info('上次同步：' + new Date(sync.when).toLocaleString('zh-CN', { hour12: false }) + '（有效 ' + sync.valid + ' 条）');
      const pend = await mod.bridge.read(s, 'record-pending.json', '');
      if (pend) info('发现未完成的记录事务：下次开始/结束学习会自动恢复，无需处理。');
      const sent = await mod.bridge.readJSON(s, 'sent-weeks.json', null);
      if (sent && sent.sent && sent.sent.length) info('历史周报已发送标记：' + sent.sent.length + ' 周（最新 ' + sent.sent[sent.sent.length - 1] + '）');
    } catch (e) { no('状态检查异常：' + e.message); }
  }

  // 5) 通知与点击跳转测试
  try {
    const monday = mod && mod.core ? mod.core.weekStart(mod.core.dateKey(new Date())) : null;
    const lastMonday = monday && mod.core ? mod.core.addDays(monday, -7) : null;
    const url = 'scriptable:///run/' + encodeURIComponent('StudyTracker V3 报告') + (lastMonday ? '?week=' + lastMonday : '');
    const n = new Notification();
    n.identifier = 'StudyTrackerV3-selftest';
    n.title = '学习系统自检';
    n.subtitle = '点开验证跳转';
    n.body = '请点击这条通知：应打开「学习周报」界面。';
    n.openURL = url;
    await n.schedule();
    ok('测试通知已发送 → 请稍候点击它，确认能打开报告界面');
    info('目标链接：' + url);
  } catch (e) { no('测试通知失败：' + (e && e.message || e) + '（请在系统弹窗里允许通知）'); }

  L.push('');
  L.push('下一步：');
  L.push('1) 若上面有 ❌，先按提示处理再重新自检；');
  L.push('2) 收到「学习系统自检」通知后点开它：能出现学习周报界面 = 通知与跳转链路 OK；');
  L.push('3) 最后切一次「学习」专注模式，看是否有红色报错（有的话截图发给 Minis）。');
} catch (e) {
  no('自检异常终止：' + (e && e.message || e));
}

const text = L.join('\n');
try { Pasteboard.copy(text); } catch (e) {}
try { await QuickLook.present(text); } catch (e) {}
})();
