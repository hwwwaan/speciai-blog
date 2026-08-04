// 디스코드 보고
//
//   cron 이 재놓은 순위·리서치 결과 중 **사람이 알아야 할 것만** 골라 보낸다.
//   변동이 없으면 아무것도 보내지 않는다. 매일 "변화 없음"이 오면 곧 안 보게 된다.
//
// 실행:
//   node notify.mjs            # 일간 — 순위 변동
//   node notify.mjs --weekly   # 주간 — 기회 키워드 현황
//   node notify.mjs --test     # 연결 확인
//
// 웹훅 URL 은 blog/.env 의 DISCORD_WEBHOOK_URL 에서 읽는다.
// 없으면 콘솔에 미리보기만 찍고 전송은 건너뛴다 (cron 이 실패로 죽지 않게).

import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BRAND = 0xD85A30

// ─── 설정 ───────────────────────────────────────────────────
function env(key) {
  if (process.env[key]) return process.env[key]
  const p = join(HERE, '.env')
  if (!existsSync(p)) return null
  const m = readFileSync(p, 'utf8').match(new RegExp(`^${key}\\s*=\\s*(.+)$`, 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
}

const WEBHOOK = env('DISCORD_WEBHOOK_URL')

async function send(embed) {
  if (!WEBHOOK) {
    console.log('\n[웹훅 미설정 — 보낼 내용 미리보기]\n')
    console.log(`■ ${embed.title}`)
    if (embed.description) console.log(embed.description)
    for (const f of embed.fields ?? []) console.log(`\n· ${f.name}\n${f.value}`)
    if (embed.footer) console.log(`\n${embed.footer.text}`)
    console.log(`\n설정하려면 blog/.env 에:  DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...`)
    return false
  }
  const res = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: env('DISCORD_USERNAME') || 'speciai 블로그',
      embeds: [{ color: BRAND, timestamp: new Date().toISOString(), ...embed }],
    }),
  })
  if (!res.ok) { console.error(`전송 실패 HTTP ${res.status} — ${await res.text()}`); return false }
  console.log('전송했습니다.')
  return true
}

const argv = process.argv.slice(2)

// ─── 연결 확인 ──────────────────────────────────────────────
if (argv.includes('--test')) {
  await send({
    title: '연결 확인',
    description: 'speciai.team 네이버 블로그 알림이 이 채널로 옵니다.',
    footer: { text: '순위 변동이 있는 날에만 보냅니다' },
  })
  process.exit(0)
}

const read = p => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null)

// ─── 주간 — 기회 키워드 현황 ────────────────────────────────
if (argv.includes('--weekly')) {
  const posts = read(join(HERE, 'research', 'out', 'posts.json'))
  if (!posts?.length) { console.log('리서치 결과가 없습니다. study.mjs 를 먼저 돌리세요.'); process.exit(0) }

  const year = new Date().getFullYear()
  const byKw = {}
  for (const p of posts) (byKw[p.keyword] ||= []).push(p)

  const rows = Object.entries(byKw).map(([kw, ps]) => {
    const fresh = ps.filter(p => +(p.date?.slice(0, 4) || 0) >= year - 1).length
    return { kw, cat: ps[0].cat, pct: Math.round(fresh / ps.length * 100), n: ps.length }
  }).sort((a, b) => a.pct - b.pct)

  const open = rows.filter(r => r.pct <= 40).slice(0, 8)
  const hot = rows.filter(r => r.pct === 100).length

  await send({
    title: `주간 리서치 — 키워드 ${rows.length}개 · 글 ${posts.length}건`,
    description: '**1년 이내 글 비율이 낮을수록** 아무도 갱신 안 한 자리입니다.',
    fields: [
      {
        name: '뚫을 여지가 있는 곳',
        value: open.map(r => `\`${String(r.pct).padStart(3)}%\`  [${r.cat}] ${r.kw}`).join('\n') || '없음',
      },
      {
        name: '당분간 피할 곳',
        value: `1년 이내 글이 100%인 키워드 **${hot}개** — 매일 새 글이 밀어냅니다`,
      },
    ],
    footer: { text: 'blog/research/전략.md 에 근거가 있습니다' },
  })
  process.exit(0)
}

// ─── 일간 — 순위 변동 ───────────────────────────────────────
const ledger = read(join(HERE, 'ledger.json'))
if (!ledger?.posts?.length) { console.log('원장이 비어 있습니다.'); process.exit(0) }

const moves = []
for (const p of ledger.posts) {
  const last = p.history.at(-1)
  const prev = p.history.at(-2)
  if (!last) continue

  const a = prev?.rank ?? null
  const b = last.rank ?? null
  if (a === b) continue                       // 그대로면 알리지 않는다

  let tag, delta
  if (a == null && b != null) { tag = '★'; delta = `**${b}위 진입**` }
  else if (a != null && b == null) { tag = '⚠'; delta = `**노출에서 빠짐** (직전 ${a}위)` }
  else if (b < a) { tag = '▲'; delta = `${a}위 → **${b}위** (▲${a - b})` }
  else { tag = '▼'; delta = `${a}위 → **${b}위** (▼${b - a})` }

  moves.push({ tag, text: `${tag} \`${p.keyword}\`\n${delta}\n${p.title}` })
}

if (!moves.length) {
  console.log('변동이 없어 보내지 않았습니다.')
  process.exit(0)
}

const up = moves.filter(m => m.tag === '▲' || m.tag === '★').length
const down = moves.filter(m => m.tag === '▼' || m.tag === '⚠').length

await send({
  title: `순위 변동 ${moves.length}건`,
  description: `상승·진입 ${up} · 하락·이탈 ${down}`,
  fields: moves.slice(0, 10).map(m => ({ name: '​', value: m.text })),
  footer: { text: `발행 ${ledger.posts.filter(p => p.status === 'published').length}건 추적 중` },
})
