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

// 글쓰기-규칙.md 의 판 번호. 규칙을 고칠 때 같이 올린다.
//
//   왜 기록하나 — 2026-08-09 에 규칙을 2판으로 갈아엎었다(문단 46자, 소제목 5~6,
//   검색어 통째로 안 쓰기). 그런데 이건 상위 글을 관찰해 세운 «가설» 이지
//   우리 글로 검증한 게 아니다. 1판으로 쓴 글 4편이 이미 있으니, 판을 기록해 두면
//   순위가 쌓였을 때 «어느 쪽이 실제로 먹혔는가» 를 대조할 수 있다.
//
//   규칙을 지켰는지가 아니라 실제 모양을 재서 남기는 이유도 같다.
//   규칙은 틀릴 수 있고, 답은 순위에만 있다.
const RULESET = 2

const 모양재기 = (raw, keyword) => {
  const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '')
  const 문단 = body.split('\n').map(s => s.trim())
    .filter(s => s && !/^[!|#>\-*]/.test(s))
  const 본문 = body.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  const 낱말 = keyword.split(/\s+/).filter(t => t.length >= 2)
  const 세기 = re => (body.match(re) || []).length
  return {
    chars: 본문.replace(/\s/g, '').length,
    images: 세기(/^!\[/gm),
    headings: 세기(/^## /gm),
    paragraphs: 문단.length,
    paraLen: 문단.length ? Math.round(문단.reduce((s, p) => s + p.length, 0) / 문단.length) : 0,
    tables: 세기(/^\|/gm),
    titleLen: (raw.match(/^title:\s*(.+)$/m)?.[1] || '').trim().length,
    // 검색어를 통째로 쓴 횟수 — 상위 글은 대개 0회다
    exactKeyword: keyword ? 세기(new RegExp(keyword.replace(/\s+/g, '\\s*'), 'g')) : 0,
    // 핵심 낱말 하나를 몇 번 썼나 — 상위 글 중앙값 16회
    coreWord: 낱말.length ? Math.max(...낱말.map(t => 세기(new RegExp(t, 'g')))) : 0,
  }
}

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

  const shape = 모양재기(raw, get('keyword') || '')

  ledger.posts.push({
    slug,
    title: get('title') || slug,
    keyword: get('keyword') || '',
    category: get('category') || '',
    file,
    ruleset: RULESET,     // 어느 판 규칙으로 썼는지. 순위가 쌓이면 판끼리 비교한다
    shape,                // 발행 시점의 실제 모양. 규칙을 지켰는지가 아니라 «무엇이 통했는지» 를 본다
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
  console.log(`  모양  ${shape.chars}자 · 소제목 ${shape.headings} · 이미지 ${shape.images} · 문단 ${shape.paraLen}자 · 핵심낱말 ${shape.coreWord}회  (규칙 ${RULESET}판)`)
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
    if (p.shape) console.log(`   모양   ${p.shape.chars}자 · 소제목 ${p.shape.headings} · 문단 ${p.shape.paraLen}자 · 핵심낱말 ${p.shape.coreWord}회  (규칙 ${p.ruleset ?? '?'}판)`)
    if (p.views != null) console.log(`   조회   ${p.views.toLocaleString()}`)
    console.log()
  }

  // ─── 판 비교 ───
  // 규칙 2판(2026-08-09)은 상위 글 관찰로 세운 가설이다. 우리 글로 검증된 게 아니다.
  // 순위가 붙은 글이 판마다 2편 이상 쌓이면 여기서 대조한다.
  const 판 = {}
  for (const p of ledger.posts) {
    const r = p.history.at(-1)?.rank
    if (r) (판[p.ruleset ?? 0] ??= []).push(r)
  }
  const 판목록 = Object.keys(판).filter(k => 판[k].length >= 2)
  if (판목록.length >= 2) {
    console.log('── 규칙 판별 성적 ──')
    for (const k of 판목록) {
      const a = [...판[k]].sort((x, y) => x - y)
      console.log(`  ${k}판  ${a.length}편 · 중앙 ${a[a.length >> 1]}위 · 최고 ${a[0]}위`)
    }
    console.log('\n  ※ 편수가 적으면 우연입니다. 판별로 4편 이상 쌓인 뒤에 판단하세요.')
  } else {
    const 미노출 = ledger.posts.filter(p => !p.history.at(-1)?.rank).length
    console.log(`판 비교는 아직 못 합니다 — 순위가 붙은 글이 부족합니다 (미노출 ${미노출}편).`)
    console.log(`발행하고 며칠 지나야 비교가 됩니다.`)
  }
  process.exit(0)
}

// ─── 순위 측정 ──────────────────────────────────────────────
console.log(`순위 측정 — ${today()}\n`)

const date = today()
let measured = 0

for (const p of ledger.posts) {
  if (!p.keyword) { console.log(`— ${p.slug}: 목표 키워드가 없어 건너뜁니다`); continue }
  // 같은 키워드를 새 초고가 대체했으면 옛 초고는 안 잰다.
  // 둘 다 올리면 우리끼리 중복 문서가 되므로 발행 대상이 아니다.
  if (p.status === 'superseded') { console.log(`— ${p.slug}: 대체됨 (${p.supersededBy})`); continue }

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
