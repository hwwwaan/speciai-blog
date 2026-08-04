// 발행 원장 + 순위 추적
//
//   우리 글이 목표 키워드에서 몇 위인지 매일 재서 원장에 쌓는다.
//   측정이 없으면 나머지는 전부 추측이다.
//
// 실행:
//   node rank.mjs --add posts/2026-08-04-접대비-한도.md   # 원장에 등록 (초고 상태)
//   node rank.mjs --publish 2026-08-04-접대비-한도 <URL>  # 발행 확정
//   node rank.mjs                                        # 전체 순위 측정
//   node rank.mjs --report                               # 측정 없이 현황만
//
// 원장: ledger.json
//
// ※ 조회수·유입검색어는 자동으로 못 가져온다 (네이버 블로그 통계는 로그인 필요, API 없음).
//   순위를 대리 지표로 쓰고, 조회수는 월 1회 손으로 넣는다.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const LEDGER = join(HERE, 'ledger.json')
const BLOG_ID = 'speciai_'

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const today = () => new Date().toISOString().slice(0, 10)

const load = () => existsSync(LEDGER)
  ? JSON.parse(readFileSync(LEDGER, 'utf8'))
  : { blogId: BLOG_ID, posts: [] }
const save = d => writeFileSync(LEDGER, JSON.stringify(d, null, 2))

const argv = process.argv.slice(2)

// ─── 등록 ───────────────────────────────────────────────────
if (argv[0] === '--add') {
  const file = argv[1]
  if (!file || !existsSync(file)) { console.error('글 파일을 넣어주세요.'); process.exit(1) }

  const raw = readFileSync(file, 'utf8')
  const fm = raw.match(/^---\n([\s\S]*?)\n---/)
  const get = k => fm?.[1].match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1].trim().replace(/^["']|["']$/g, '')

  const slug = basename(file, '.md').replace(/\.발행본$/, '')
  const ledger = load()
  if (ledger.posts.some(p => p.slug === slug)) {
    console.error(`이미 등록돼 있습니다: ${slug}`); process.exit(1)
  }

  ledger.posts.push({
    slug,
    title: get('title') || slug,
    keyword: get('keyword') || '',
    category: get('category') || '',
    file,
    status: 'draft',
    postId: null,
    publishedAt: null,
    views: null,          // 월 1회 손으로 채운다
    history: [],
  })
  save(ledger)
  console.log(`등록: ${slug}`)
  console.log(`  제목  ${get('title') || '(없음)'}`)
  console.log(`  키워드 ${get('keyword') || '(없음)'}`)
  console.log(`\n발행하면:  node rank.mjs --publish ${slug} <URL>`)
  process.exit(0)
}

// ─── 발행 확정 ──────────────────────────────────────────────
if (argv[0] === '--publish') {
  const [, slug, url] = argv
  const ledger = load()
  const post = ledger.posts.find(p => p.slug === slug)
  if (!post) { console.error(`원장에 없습니다: ${slug}`); process.exit(1) }

  post.status = 'published'
  post.publishedAt = today()
  post.postId = url?.match(/\/(\d{6,})/)?.[1] ?? null
  if (!post.postId && url) console.warn('URL 에서 글 번호를 못 찾았습니다. 순위 매칭이 느슨해집니다.')
  save(ledger)
  console.log(`발행 확정: ${slug}${post.postId ? ` (글번호 ${post.postId})` : ''}`)
  process.exit(0)
}

// ─── 검색 ───────────────────────────────────────────────────
async function search(query) {
  const url = `https://m.search.naver.com/search.naver?where=m_blog&query=${encodeURIComponent(query)}`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  const hits = [...html.matchAll(/blog\.naver\.com\/([A-Za-z0-9_-]+)\/(\d{6,})/g)]
    .map(m => `${m[1]}/${m[2]}`)
  return [...new Set(hits)]           // 노출 순서 유지
}

const ledger = load()
if (!ledger.posts.length) {
  console.log(`원장이 비어 있습니다.\n\n  node rank.mjs --add posts/<글>.md`)
  process.exit(0)
}

// ─── 현황만 ─────────────────────────────────────────────────
if (argv[0] === '--report') {
  console.log(`발행 원장 — 글 ${ledger.posts.length}건\n`)
  for (const p of ledger.posts) {
    const last = p.history.at(-1)
    const prev = p.history.at(-2)
    const arrow = last && prev && last.rank && prev.rank
      ? (last.rank < prev.rank ? ` ▲${prev.rank - last.rank}` : last.rank > prev.rank ? ` ▼${last.rank - prev.rank}` : ' —')
      : ''
    console.log(`[${p.status === 'published' ? '발행' : '초고'}] ${p.title}`)
    console.log(`   키워드 ${p.keyword || '(없음)'}`)
    console.log(`   순위   ${last?.rank ? `${last.rank}위${arrow}` : '미노출'}  (측정 ${p.history.length}회)`)
    if (p.views != null) console.log(`   조회   ${p.views.toLocaleString()}`)
    console.log()
  }
  process.exit(0)
}

// ─── 순위 측정 ──────────────────────────────────────────────
console.log(`순위 측정 — ${today()}\n`)

const date = today()
let measured = 0

for (const p of ledger.posts) {
  if (!p.keyword) { console.log(`— ${p.slug}: 목표 키워드가 없어 건너뜁니다`); continue }

  await sleep(700)
  let hits
  try { hits = await search(p.keyword) }
  catch (e) { console.error(`✗ ${p.keyword} — ${e.message}`); continue }

  // 우리 글 찾기: 글번호가 있으면 정확히, 없으면 블로그 아이디로
  const idx = hits.findIndex(h => p.postId ? h === `${BLOG_ID}/${p.postId}` : h.startsWith(`${BLOG_ID}/`))
  const rank = idx >= 0 ? idx + 1 : null

  const prev = p.history.at(-1)
  p.history = p.history.filter(h => h.date !== date)   // 같은 날 재측정이면 갱신
  p.history.push({ date, rank, top: hits.slice(0, 5) })
  measured++

  const move = prev?.rank && rank
    ? (rank < prev.rank ? ` ▲${prev.rank - rank}` : rank > prev.rank ? ` ▼${rank - prev.rank}` : ' —')
    : prev?.rank && !rank ? ' ▼이탈'
      : !prev?.rank && rank ? ' ★진입'
        : ''

  console.log(`${rank ? `${String(rank).padStart(2)}위` : '미노출'}${move.padEnd(6)} ${p.keyword}  · ${p.title.slice(0, 30)}`)

  // 우리가 미노출이면 그 자리를 누가 잡고 있는지 보여준다
  if (!rank && hits.length) {
    console.log(`        상위: ${hits.slice(0, 3).map(h => h.split('/')[0]).join(', ')}`)
  }
}

save(ledger)
console.log(`\n${'─'.repeat(50)}`)
console.log(`${measured}건 측정 → ledger.json`)

const shown = ledger.posts.filter(p => p.history.at(-1)?.rank).length
const pub = ledger.posts.filter(p => p.status === 'published').length
console.log(`발행 ${pub}건 중 ${shown}건 노출 중`)
