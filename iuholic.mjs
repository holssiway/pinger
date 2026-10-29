// 네이버 블로그 I U H O L I C (smotherguy) 제목에 '언급'이 들어간 새 글 → 텔레그램 알림
// GitHub Actions에서 매일 17:23(한국시간) 실행. 상태는 iuholic-state.json에 저장.
import fs from 'node:fs';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TEST = process.env.TEST_MESSAGE === 'true';
const BLOG_ID = 'smotherguy';
const KEYWORD = '언급';
const RSS_URL = `https://rss.blog.naver.com/${BLOG_ID}.xml`;
const STATE_FILE = 'iuholic-state.json';
const KEEPALIVE_DAYS = 45; // 60일 무활동 시 예약 실행이 꺼지는 것 방지

if (!TOKEN || !CHAT_ID) throw new Error('IUHOLIC_BOT_TOKEN / IUHOLIC_CHAT_ID secret이 없습니다.');

const decode = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const pick = (s, tag) => { const m = s.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)); return m ? decode(m[1]) : ''; };

async function fetchPosts() {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(RSS_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
      const xml = await res.text();
      return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, b]) => {
        const link = pick(b, 'link');
        const id = (link.match(/smotherguy\/(\d+)/) || [])[1];
        return { id, title: pick(b, 'title'), date: pick(b, 'pubDate') };
      }).filter((p) => p.id);
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  throw lastErr;
}

async function sendTelegram(text) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text }),
    });
    const body = await res.json().catch(() => ({}));
    if (body.ok) return true;
    console.error('텔레그램 전송 실패:', res.status, body.description);
  }
  return false;
}

const kst = (d) => new Date(Date.parse(d) + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') + ' (KST)';

const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
state.seenIds = (state.seenIds || []).map(String);

const posts = await fetchPosts();
if (!posts.length) throw new Error('RSS에서 글을 0개 읽었습니다 (구조 변경 또는 접속 차단 의심).');
console.log(`RSS 글 ${posts.length}개, 최신 ${posts[0].id} ${posts[0].title}`);

if (TEST) {
  await sendTelegram(`[테스트] GitHub Actions 연결 확인\nI U H O L I C 블로그 RSS에서 글 ${posts.length}개를 읽었습니다.\n매일 17:23(한국시간)에 확인하며, PC나 Aside가 꺼져 있어도 작동합니다.`);
}

const fresh = posts.filter((p) => !state.seenIds.includes(p.id)).sort((a, b) => Number(a.id) - Number(b.id));
let sent = 0;
let failed = 0;
for (const p of fresh) {
  if (p.title.includes(KEYWORD)) {
    const ok = await sendTelegram(`[아이유홀릭 '${KEYWORD}' 새 글]\n${p.title}\n${kst(p.date)}\nhttps://blog.naver.com/${BLOG_ID}/${p.id}`);
    if (!ok) { failed++; continue; } // 실패한 글은 다음 실행에서 재시도
    sent++;
  }
  state.seenIds.push(p.id);
}
console.log(`새 글 ${fresh.length}개, '${KEYWORD}' 알림 ${sent}개, 전송 실패 ${failed}개`);

state.seenIds = state.seenIds.slice(-300);
if (sent || !state.keepalive || Date.now() - Date.parse(state.keepalive) > KEEPALIVE_DAYS * 864e5) {
  state.keepalive = new Date().toISOString();
}
fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
if (failed) process.exitCode = 1;
