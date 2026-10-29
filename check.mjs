// 광주시문화재단 공연·전시안내 새 공연 → 텔레그램 알림
// GitHub Actions에서 매일 실행. 상태는 state.json에 저장.
import fs from 'node:fs';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TEST = process.env.TEST_MESSAGE === 'true';
const LIST_URL = 'https://www.nsart.or.kr/perform.do';
const DETAIL_URL = 'https://www.nsart.or.kr/perform.do?act=detail&pfrmId=';
const STATE_FILE = 'state.json';
const KEEPALIVE_DAYS = 45; // 60일 무활동 시 예약 실행이 꺼지는 것 방지

if (!TOKEN || !CHAT_ID) throw new Error('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID secret이 없습니다.');

const decode = (s) => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const pick = (s, re) => { const m = s.match(re); return m ? decode(m[1]) : ''; };

async function fetchPerformances() {
  const items = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(`${LIST_URL}?searchGuideType=ING&orderBy=DATE&pageIndex=${page}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`공연 페이지 HTTP ${res.status}`);
    const html = await res.text();
    let added = 0;
    for (const b of html.split('<div class="item">').slice(1)) {
      const m = b.match(/pfrmId=(\d+)/);
      if (!m || items.some((x) => x.id === m[1])) continue;
      added++;
      items.push({
        id: m[1],
        type: pick(b, /class="more type_[^"]*">([^<]*)</),
        genre: pick(b, /<b>([^<]*)<\/b>/),
        title: pick(b, /class="tit">([\s\S]*?)<\/span>/),
        date: pick(b, /class="date"><i class="label">일시<\/i>([\s\S]*?)<\/span>/),
        price: pick(b, /class="price"><i class="label">가격<\/i>([\s\S]*?)<\/span>/),
        place: pick(b, /class="place"><i class="label">장소<\/i>([\s\S]*?)<\/span>/),
      });
    }
    if (!added || !html.includes(`pageIndex=${page + 1}`)) break;
  }
  return items;
}

async function sendTelegram(text) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text }),
  });
  const body = await res.json().catch(() => ({}));
  if (!body.ok) console.error('텔레그램 전송 실패:', res.status, body.description);
  return !!body.ok;
}

const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
state.seenIds = (state.seenIds || []).map(String);

const items = await fetchPerformances();
if (!items.length) throw new Error('공연 목록을 0개 읽었습니다 (사이트 구조 변경 또는 접속 차단 의심).');
console.log(`진행중 공연 ${items.length}개: ${items.map((i) => i.id).join(', ')}`);

if (TEST) {
  await sendTelegram(`✅ GitHub Actions 연결 확인\n광주시문화재단 공연 페이지에서 진행중 공연 ${items.length}개를 읽었습니다.\n매일 14시(한국시간)에 확인하며, PC가 꺼져 있어도 작동합니다.`);
}

const fresh = items.filter((i) => !state.seenIds.includes(i.id)).sort((a, b) => Number(a.id) - Number(b.id));
let failed = 0;
for (const i of fresh) {
  const lines = ['🎭 광주시문화재단 새 공연', `[${[i.type, i.genre].filter(Boolean).join('/')}] ${i.title}`, `일시: ${i.date}`];
  if (i.price) lines.push(`가격: ${i.price}`);
  lines.push(`장소: ${i.place}`, DETAIL_URL + i.id);
  if (await sendTelegram(lines.join('\n'))) state.seenIds.push(i.id); else failed++;
}
console.log(`새 공연 ${fresh.length}개, 전송 실패 ${failed}개`);

state.seenIds = state.seenIds.slice(-500);
if (fresh.length || !state.keepalive || Date.now() - Date.parse(state.keepalive) > KEEPALIVE_DAYS * 864e5) {
  state.keepalive = new Date().toISOString();
}
fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
if (failed) process.exitCode = 1;
