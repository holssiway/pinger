# pinger

광주시문화재단 공연·전시안내(https://www.nsart.or.kr/perform.do)에 새 공연이 올라오면 텔레그램으로 알려주는 GitHub Actions.

- 실행: 매일 14:00 (한국시간), `.github/workflows/check.yml`
- 상태: `state.json` (이미 알린 공연 pfrmId)
- Secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- 수동 실행: Actions → nsart-check → Run workflow (테스트 메시지 옵션)
