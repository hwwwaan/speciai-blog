// 네이버 블로그 검색 API 로 키워드별 상위 노출 글을 수집·분석한다.
//
// 준비: 같은 폴더에 .env 를 만들고
//   NAVER_CLIENT_ID=...
//   NAVER_CLIENT_SECRET=...
//
// 실행: node naver-search.mjs              # keywords.json 전체
//       node naver-search.mjs 주휴수당      # 키워드 하나만
//
// 결과: out/raw-<날짜없음>.json (원본) + out/report.md (분석)
//   ※ API 는 제목·요약·링크·발행일만 준다. 본문과 디자인은 안 나온다.
//     그건 Chrome 확장 권한을 연 뒤에 직접 봐야 한다.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'out')
mkdirSync(OUT, { recursive: true })

// ─── .env 읽기 ──────────────────────────────────────────────
const envPath = join(HERE, '.env')
if (!existsSync(envPath)) {
  console.error(`
.env 가 없습니다. ${envPath} 를 만들고 아래 두 줄을 넣어주세요.

  NAVER_CLIENT_ID=발급받은_ID
  NAVER_CLIENT_SECRET=발급받은_시크릿

발급: developers.naver.com → Application → 애플리케이션 등록
      → 사용 API 에서 "검색" 선택 → 등록하면 바로 나옵니다 (무료, 일 25,000회)
`)
  process.exit(1)
}
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const ID = env.NAVER_CLIENT_ID, SECRET = env.NAVER_CLIENT_SECRET
if (!ID || !SECRET) { console.error('.env 에 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 이 필요합니다.'); process.exit(1) }

// ─── 키워드 ─────────────────────────────────────────────────
const keywords = JSON.parse(readFileSync(join(HERE, 'keywords.json'), 'utf8'))
const filter = process.argv[2]
const targets = filter
  ? keywords.filter(k => k.q.includes(filter) || k.cat.includes(filter))
  : keywords

if (!targets.length) { console.error(`"${filter}" 에 해당하는 키워드가 없습니다.`); process.exit(1) }

// ─── 수집 ───────────────────────────────────────────────────
const strip = s => s.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')

async function search(query, display = 100) {
  const url = `https://openapi.naver.com/v1/search/blog.json`
    + `?query=${encodeURIComponent(query)}&display=${display}&sort=sim`
  const res = await fetch(url, {
    headers: { 'X-Naver-Client-Id': ID, 'X-Naver-Client-Secret': SECRET }
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  const json = await res.json()
  return json.items.map((it, i) => ({
    rank: i + 1,
    title: strip(it.title),
    desc: strip(it.description),
    link: it.link,
    blogger: it.bloggername,
    bloggerLink: it.bloggerlink,
    date: it.postdate,            // YYYYMMDD
  }))
}

const collected = []
for (const k of targets) {
  try {
    const items = await search(k.q)
    collected.push({ ...k, items })
    console.log(`✓ ${k.cat.padEnd(6)} ${k.q.padEnd(18)} ${items.length}건`)
  } catch (e) {
    console.error(`✗ ${k.q} — ${e.message}`)
  }
  await new Promise(r => setTimeout(r, 120))   // API 예의상 간격
}

writeFileSync(join(OUT, 'raw.json'), JSON.stringify(collected, null, 2))

// ─── 분석 ───────────────────────────────────────────────────
// 제목이 어떻게 생겼는지, 누가 장악했는지, 얼마나 최신인지 — 이 셋만 본다.

const pct = (n, d) => d ? `${Math.round(n / d * 100)}%` : '—'

function analyzeTitles(items) {
  const n = items.length
  const has = re => items.filter(i => re.test(i.title)).length
  const lens = items.map(i => i.title.length).sort((a, b) => a - b)
  return {
    n,
    lenMed: lens[Math.floor(n / 2)] ?? 0,
    lenMin: lens[0] ?? 0,
    lenMax: lens[n - 1] ?? 0,
    num: has(/\d/),                          // 숫자 포함
    question: has(/[?？]|까요|나요|할까|일까/), // 질문형
    bracket: has(/[\[\]【】(){}]/),            // 괄호 사용
    year: has(/20\d\d년?/),                   // 연도 명시
    howto: has(/방법|정리|총정리|가이드|한눈에/),
  }
}

function topBloggers(items, k = 5) {
  const c = {}
  for (const i of items) c[i.blogger] = (c[i.blogger] || 0) + 1
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, k)
}

function recency(items) {
  const ys = items.map(i => i.date?.slice(0, 4)).filter(Boolean)
  const c = {}
  for (const y of ys) c[y] = (c[y] || 0) + 1
  return Object.entries(c).sort((a, b) => b[0].localeCompare(a[0]))
}

let md = `# 네이버 블로그 상위 노출 분석\n\n`
md += `키워드 ${collected.length}개 · 키워드당 상위 100건 · 정렬 \`sim\`(정확도)\n\n`
md += `> API 는 제목·요약·링크·발행일만 줍니다. 본문 구성과 디자인은 이 데이터로 알 수 없습니다.\n\n`

md += `## 1. 제목은 어떻게 생겼나\n\n`
md += `| 키워드 | 건수 | 제목 길이(중앙) | 숫자 | 질문형 | 괄호 | 연도 | 정리/가이드 |\n`
md += `|---|---|---|---|---|---|---|---|\n`
for (const k of collected) {
  const a = analyzeTitles(k.items)
  md += `| ${k.q} | ${a.n} | ${a.lenMed}자 (${a.lenMin}~${a.lenMax}) `
      + `| ${pct(a.num, a.n)} | ${pct(a.question, a.n)} | ${pct(a.bracket, a.n)} `
      + `| ${pct(a.year, a.n)} | ${pct(a.howto, a.n)} |\n`
}

md += `\n## 2. 누가 장악하고 있나\n\n`
for (const k of collected) {
  const top = topBloggers(k.items)
  if (!top.length) continue
  md += `**${k.q}** — ${top.map(([b, c]) => `${b} (${c})`).join(' · ')}\n\n`
}

md += `\n## 3. 최신성이 얼마나 중요한가\n\n`
md += `| 키워드 | 발행연도 분포 (상위 100건) |\n|---|---|\n`
for (const k of collected) {
  md += `| ${k.q} | ${recency(k.items).map(([y, c]) => `${y}년 ${c}`).join(' · ')} |\n`
}

md += `\n## 4. 상위 10개 제목 원문\n\n`
md += `제목 짓는 감을 잡는 용도입니다. 그대로 베끼면 안 됩니다.\n\n`
for (const k of collected) {
  md += `### ${k.cat} · ${k.q}\n\n`
  for (const i of k.items.slice(0, 10)) {
    md += `${i.rank}. ${i.title} — *${i.blogger}* (${i.date})\n`
  }
  md += `\n`
}

writeFileSync(join(OUT, 'report.md'), md)
console.log(`\n원본 → ${join(OUT, 'raw.json')}`)
console.log(`분석 → ${join(OUT, 'report.md')}`)
