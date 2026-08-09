// 무엇이 순위를 가르는가 — study.mjs 가 모은 데이터를 순위 기준으로 다시 본다.
//
//   study.mjs 는 상위 노출 글의 «평균» 을 냈다. 그런데 평균은 답이 아니다.
//   1위 글과 10위 글이 뭐가 다른지를 봐야 «따라 할 것» 이 나온다.
//
//   함정이 하나 있다. 키워드마다 판이 다르다 — 「퇴직금 계산」 은 원래 글이 길고
//   「권고사직 코드」 는 원래 짧다. 이걸 뭉뚱그려 평균 내면 키워드 차이를
//   순위 차이로 착각한다. 그래서 «같은 키워드 안에서» 상위3 vs 하위3 을 짝지어 본다.
//
//   실제로 2026-08-09 분석에서 뭉뚱그린 비교는 "상위권이 최신 글이다(86% vs 67%)" 라고
//   했지만, 짝비교로 보니 차이가 0 이었다. 최신 키워드에 최신 글이 몰려 있었을 뿐이다.
//
// 실행:
//   node 순위분석.mjs            # 전체
//   node 순위분석.mjs --본문      # corpus 본문까지 뜯어서 문장 리듬·키워드 반복
//
// 재료: out/posts.json (study.mjs), out/corpus/*.md (extract.mjs)
// 결과: 화면 출력. 결론은 사람이 읽고 글쓰기-규칙.md 에 반영한다.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'out')
const 본문까지 = process.argv.includes('--본문')

const posts = Object.values(JSON.parse(readFileSync(join(OUT, 'posts.json'), 'utf8')))
  .filter(p => p && p.rank)

const med = a => { const s = [...a].filter(x => x != null).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null }
const pct = (g, f) => g.length ? (g.filter(f).length / g.length * 100) : 0
const 부호검정 = (이긴수, 전체) => 전체 ? (이긴수 - 전체 / 2) / Math.sqrt(전체 / 4) : 0

console.log(`\n순위 분석 — 상위 노출 ${posts.length}건 · 키워드 ${new Set(posts.map(p => p.keyword)).size}개\n`)

// ─────────────────────────────────────────────────────────
// 1. 뭉뚱그린 비교 — 이건 착시가 섞인다. 아래 2번과 반드시 같이 본다.
// ─────────────────────────────────────────────────────────
console.log('━━ 1. 순위 구간별 (키워드 차이가 섞여 있음, 참고용) ━━\n')
console.log('구간      건수   글자 이미지 소제목 문단   밀도  표비율 제목  숫자  1년내')
for (const [name, lo, hi] of [['1~3위', 1, 3], ['4~7위', 4, 7], ['8~10위', 8, 10]]) {
  const g = posts.filter(p => p.rank >= lo && p.rank <= hi)
  if (!g.length) continue
  console.log([
    name.padEnd(8), String(g.length).padStart(4),
    String(med(g.map(p => p.chars))).padStart(6),
    String(med(g.map(p => p.images))).padStart(5),
    String(med(g.map(p => p.headings))).padStart(5),
    String(med(g.map(p => p.paragraphs))).padStart(4),
    med(g.map(p => p.imgPer1000)).toFixed(1).padStart(6),
    pct(g, p => p.tables > 0).toFixed(0).padStart(5) + '%',
    String(med(g.map(p => p.title.length))).padStart(4),
    pct(g, p => /[0-9]/.test(p.title)).toFixed(0).padStart(4) + '%',
    pct(g, p => p.date >= 최근1년()).toFixed(0).padStart(5) + '%',
  ].join(' '))
}

function 최근1년() {
  // posts.json 의 최신 수집일 기준으로 1년 전. Date.now() 를 안 쓰는 이유는
  // 데이터가 낡았을 때 "전부 옛날 글" 로 잘못 나오는 걸 막기 위해서다.
  const 최신 = posts.map(p => p.date).filter(Boolean).sort().at(-1) || '2026-01-01'
  const [y, m, d] = 최신.split('-').map(Number)
  return `${y - 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// ─────────────────────────────────────────────────────────
// 2. 짝비교 — 같은 키워드 안에서 상위3 vs 하위3. 이게 진짜다.
// ─────────────────────────────────────────────────────────
const 키워드별 = {}
for (const p of posts) (키워드별[p.keyword] ??= []).push(p)

const 항목 = [
  ['글자수', p => p.chars], ['이미지', p => p.images], ['소제목', p => p.headings],
  ['문단수', p => p.paragraphs], ['이미지밀도', p => p.imgPer1000], ['제목길이', p => p.title.length],
]
const 차이 = Object.fromEntries(항목.map(([n]) => [n, []]))
const 비율항목 = { '표 있는 글': p => p.tables > 0, '1년내 글': p => p.date >= 최근1년(), '제목에 숫자': p => /[0-9]/.test(p.title) }
const 비율차이 = Object.fromEntries(Object.keys(비율항목).map(n => [n, []]))
let 짝 = 0

for (const kw in 키워드별) {
  const g = 키워드별[kw]
  const 상 = g.filter(p => p.rank <= 3), 하 = g.filter(p => p.rank >= 8)
  if (상.length < 2 || 하.length < 2) continue
  짝++
  for (const [n, f] of 항목) {
    const a = med(상.map(f)), b = med(하.map(f))
    if (a != null && b) 차이[n].push((a - b) / b * 100)
  }
  for (const n in 비율항목) 비율차이[n].push(pct(상, 비율항목[n]) - pct(하, 비율항목[n]))
}

console.log(`\n━━ 2. 같은 키워드 안에서 상위3 vs 하위3 (키워드 ${짝}개) ━━\n`)
console.log('항목          상위가 이만큼 더   더 큰 키워드   z      판정')
const 판정 = z => Math.abs(z) < 2 ? '차이 없음' : (z > 0 ? '유의: 상위가 많다' : '유의: 상위가 적다')
for (const [n] of 항목) {
  const a = 차이[n]; if (!a.length) continue
  const 이김 = a.filter(x => x > 0).length, z = 부호검정(이김, a.length)
  console.log(`${n.padEnd(11)} ${(med(a) > 0 ? '+' : '') + med(a).toFixed(1).padStart(6)}%  ${String(이김).padStart(3)}/${String(a.length).padEnd(4)} ${z.toFixed(2).padStart(6)}  ${판정(z)}`)
}
for (const n in 비율차이) {
  const a = 비율차이[n]; if (!a.length) continue
  const 이김 = a.filter(x => x > 0).length, z = 부호검정(이김, a.length)
  console.log(`${n.padEnd(11)} ${(med(a) > 0 ? '+' : '') + med(a).toFixed(0).padStart(6)}%p ${String(이김).padStart(3)}/${String(a.length).padEnd(4)} ${z.toFixed(2).padStart(6)}  ${판정(z)}`)
}

// ─────────────────────────────────────────────────────────
// 3. 블로그 지수 — 같은 블로그가 여러 키워드에서 상위를 먹는가
// ─────────────────────────────────────────────────────────
const 상위3 = posts.filter(p => p.rank <= 3)
const 강자키워드 = {}, 전체키워드 = {}, 이름 = {}
for (const p of posts) { (전체키워드[p.blogId] ??= new Set()).add(p.keyword); 이름[p.blogId] = p.blogName }
for (const p of 상위3) (강자키워드[p.blogId] ??= new Set()).add(p.keyword)

const 순위 = Object.entries(강자키워드).map(([b, s]) => [b, s.size]).sort((a, b) => b[1] - a[1])
const 강자 = new Set(순위.filter(([, c]) => c >= 2).map(([b]) => b))
const 점유 = 순위.filter(([, c]) => c >= 2).reduce((s, [, c]) => s + c, 0)

console.log(`\n━━ 3. 블로그 지수 효과 ━━\n`)
console.log(`  전체 등장 블로그        ${Object.keys(전체키워드).length}곳`)
console.log(`  2개+ 키워드에서 상위3   ${강자.size}곳`)
console.log(`  이들이 먹은 상위3 자리  ${점유}/${상위3.length} (${(점유 / 상위3.length * 100).toFixed(0)}%)\n`)
for (const [b, c] of 순위.slice(0, 10))
  console.log(`  ${String(c).padStart(2)}개 키워드  ${b.padEnd(16)} ${(이름[b] || '').slice(0, 26)}`)

// ─────────────────────────────────────────────────────────
// 4. 강자 블로그는 뭘 다르게 하는가
// ─────────────────────────────────────────────────────────
const A = posts.filter(p => 강자.has(p.blogId)), B = posts.filter(p => !강자.has(p.blogId))
console.log(`\n━━ 4. 강자 ${A.length}건 vs 나머지 ${B.length}건 ━━\n`)
const 줄 = (n, f, suf = '') => console.log(`  ${n.padEnd(16)} ${String(f(A)).padStart(7)}${suf}  ${String(f(B)).padStart(7)}${suf}`)
줄('글자수', g => med(g.map(p => p.chars)))
줄('이미지', g => med(g.map(p => p.images)))
줄('소제목', g => med(g.map(p => p.headings)))
줄('제목 길이', g => med(g.map(p => p.title.length)))
for (const [n, f] of [['표 쓰는 글', p => p.tables > 0], ['제목에 숫자', p => /[0-9]/.test(p.title)],
  ['제목에 연도', p => /20[0-9][0-9]/.test(p.title)], ['정리·총정리', p => /정리|가이드|총정리/.test(p.title)],
  ['1년내 글', p => p.date >= 최근1년()]])
  줄(n, g => pct(g, f).toFixed(0), '%')

// ─────────────────────────────────────────────────────────
// 5. 본문 — 문장 리듬과 키워드 반복 (--본문)
// ─────────────────────────────────────────────────────────
if (!본문까지) {
  console.log(`\n본문 분석까지 보려면:  node 순위분석.mjs --본문`)
  console.log(`(먼저 extract.mjs 로 corpus 를 모아야 합니다)\n`)
  process.exit(0)
}

const CORPUS = join(OUT, 'corpus')
if (!existsSync(CORPUS)) { console.log('\ncorpus 가 없습니다. node extract.mjs 를 먼저 돌리세요.\n'); process.exit(0) }

const 메타 = {}
for (const p of posts) 메타[`${p.blogId}_${p.postId}`] = p

const 본문통계 = []
for (const f of readdirSync(CORPUS).filter(f => f.endsWith('.md'))) {
  const m = 메타[f.replace(/\.md$/, '')]
  if (!m || !강자.has(m.blogId) || m.rank > 2) continue
  const raw = readFileSync(join(CORPUS, f), 'utf8')
  const body = raw.replace(/^---[\s\S]*?\n---\n/, '')
  const 문단 = body.split('\n').map(s => s.replace(/​/g, '').trim())
    .filter(s => s && !/^[#|>!\[\-*]/.test(s))
  const 문장 = 문단.flatMap(p => p.split(/(?<=[.!?])\s+|(?<=니다\.)\s*/)).map(s => s.trim()).filter(s => s.length > 3)
  const 낱말 = m.keyword.split(/\s+/).filter(t => t.length >= 2)
  const 통째 = (body.match(new RegExp(m.keyword.replace(/\s+/g, '\\s*'), 'g')) || []).length
  const 핵심 = Math.max(0, ...낱말.map(t => (body.match(new RegExp(t, 'g')) || []).length))
  본문통계.push({
    rank: m.rank, blog: m.blogName, kw: m.keyword, chars: m.chars,
    문단길이: Math.round(문단.reduce((s, p) => s + p.length, 0) / (문단.length || 1)),
    문장길이: Math.round(문장.reduce((s, p) => s + p.length, 0) / (문장.length || 1)),
    문단수: 문단.length,
    한문장문단: 문단.filter(p => (p.match(/[.!?]|니다/g) || []).length <= 1).length / (문단.length || 1),
    통째, 핵심, 핵심밀도: 핵심 / (m.chars / 1000),
  })
}

if (!본문통계.length) { console.log('\n강자 블로그 1~2위 본문이 corpus 에 없습니다.\n'); process.exit(0) }

console.log(`\n━━ 5. 강자 블로그 1~2위 본문 ${본문통계.length}편 ━━\n`)
console.log(`  문단 평균 길이    ${med(본문통계.map(r => r.문단길이))}자`)
console.log(`  문장 평균 길이    ${med(본문통계.map(r => r.문장길이))}자`)
console.log(`  문단 수          ${med(본문통계.map(r => r.문단수))}개`)
console.log(`  한 문장짜리 문단   ${(med(본문통계.map(r => r.한문장문단)) * 100).toFixed(0)}%`)
console.log(`\n  검색어를 통째로 반복  ${med(본문통계.map(r => r.통째))}회`)
console.log(`    0회인 글          ${본문통계.filter(r => r.통째 === 0).length}/${본문통계.length}`)
console.log(`  핵심 낱말 하나 반복   ${med(본문통계.map(r => r.핵심))}회 (1000자당 ${med(본문통계.map(r => r.핵심밀도)).toFixed(1)}회)`)
