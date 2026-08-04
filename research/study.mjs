// 네이버 블로그 상위 노출 글을 읽고 구조를 뜯어본다.
//
//   검색(m.search.naver.com) → 상위 글 링크 → 본문(m.blog.naver.com) → 구조 분석
//
// 실행: node study.mjs            # keywords.json 전체
//       node study.mjs 노무        # 카테고리/키워드로 걸러서
//
// 결과: out/posts.json (글별 원본) + out/study.md (분석)
//
// ※ 서버에 부담 주지 않도록 키워드당 상위 TOP_N 개만, 요청 사이 간격을 둔다.
//   숫자를 함부로 올리지 말 것.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'out')
mkdirSync(OUT, { recursive: true })

const TOP_N = 10          // 키워드당 읽을 글 수
const GAP = 600           // 요청 간격 (ms)

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

const unesc = s => s
  .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')

const stripTags = h => unesc(
  h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
).replace(/\s+/g, ' ').trim()

// ─── 1) 검색 → 글 링크 ──────────────────────────────────────
async function searchPosts(query) {
  const html = await get(
    `https://m.search.naver.com/search.naver?where=m_blog&query=${encodeURIComponent(query)}`)
  const hits = [...html.matchAll(/blog\.naver\.com\/([A-Za-z0-9_-]+)\/(\d{6,})/g)]
    .map(m => ({ blogId: m[1], postId: m[2] }))
  // 중복 제거하되 검색 순서를 유지한다 (= 노출 순위)
  const seen = new Set(), out = []
  for (const h of hits) {
    const k = `${h.blogId}/${h.postId}`
    if (seen.has(k)) continue
    seen.add(k); out.push(h)
  }
  return out
}

// ─── 2) 본문 파싱 ───────────────────────────────────────────
function parsePost(html, meta) {
  const pick = re => { const m = html.match(re); return m ? unesc(m[1]).trim() : '' }

  const title = pick(/property="og:title" content="([^"]*)"/)
    .replace(/\s*:\s*네이버 블로그\s*$/, '')

  // 스마트에디터 본문 영역만 잘라낸다 — 없으면 페이지 전체로 폴백
  const mainM = html.match(/<div class="se-main-container">([\s\S]*?)<\/div>\s*<!--\s*\/se-main-container/)
    || html.match(/<div class="se-main-container">([\s\S]*)<\/div>/)
  const main = mainM ? mainM[1] : html
  const body = stripTags(main)

  // 문단 / 소제목 / 인용 / 이미지 / 표
  const count = re => (main.match(re) || []).length
  const paragraphs = count(/class="se-module se-module-text"/g)
  const headings = count(/se-section-sectionTitle|se-quotation|class="se-module-text se-title-text"/g)
  const images = count(/se-module-image|se-image-resource/g)
  const tables = count(/se-table|se-module-oglink/g)

  // 태그 — 모바일 페이지엔 안 실리는 경우가 많다. 없으면 빈 배열.
  const tagBlock = html.match(/tagList[\s\S]{0,2000}?<\/(?:ul|div)>/)?.[0] || ''
  const tags = [...tagBlock.matchAll(/#([\wㄱ-ㅎ가-힣]{2,20})/g)].map(m => m[1])

  // 발행일 — addDate 가 epoch(ms) 로 들어 있다. 이게 제일 정확하다.
  const epoch = html.match(/addDate="(\d{10,})"/)?.[1]
  const date = epoch
    ? new Date(+epoch).toISOString().slice(0, 10)
    : (pick(/se_publishDate[^>]*>([^<]+)</) || '')

  // 블로그명 — 속성으로 박혀 있고, og:site_name 은 "네이버 블로그 | 이름" 형태
  const blogName = pick(/blogName="([^"]*)"/)
    || pick(/property="og:site_name"\s*\n?\s*content="([^"]*)"/).replace(/^네이버 블로그\s*\|\s*/, '')
  const nickname = pick(/property="naverblog:nickname"\s*\n?\s*content="([^"]*)"/)

  return {
    ...meta, title, date, blogName, nickname,
    chars: body.length,
    paragraphs, headings, images, tables,
    imgPer1000: body.length ? +(images / body.length * 1000).toFixed(2) : 0,
    tags: [...new Set(tags)].slice(0, 15),
    head: body.slice(0, 300),          // 도입부 — 어떻게 시작하는지 보려고
    url: `https://m.blog.naver.com/${meta.blogId}/${meta.postId}`,
  }
}

// ─── 3) 수집 ────────────────────────────────────────────────
const keywords = JSON.parse(readFileSync(join(HERE, 'keywords.json'), 'utf8'))
const filter = process.argv[2]
const targets = filter ? keywords.filter(k => k.q.includes(filter) || k.cat.includes(filter)) : keywords
if (!targets.length) { console.error(`"${filter}" 에 맞는 키워드가 없습니다.`); process.exit(1) }

const all = []
for (const k of targets) {
  let links = []
  try { links = (await searchPosts(k.q)).slice(0, TOP_N) }
  catch (e) { console.error(`✗ 검색 실패 ${k.q} — ${e.message}`); continue }

  const posts = []
  for (const [i, l] of links.entries()) {
    await sleep(GAP)
    try {
      const html = await get(`https://m.blog.naver.com/${l.blogId}/${l.postId}`)
      posts.push(parsePost(html, { ...l, rank: i + 1, keyword: k.q, cat: k.cat }))
    } catch (e) {
      console.error(`  ✗ ${l.blogId}/${l.postId} — ${e.message}`)
    }
  }
  all.push(...posts)
  console.log(`✓ ${k.cat.padEnd(5)} ${k.q.padEnd(18)} ${posts.length}/${links.length}건`)
  await sleep(GAP)
}

writeFileSync(join(OUT, 'posts.json'), JSON.stringify(all, null, 2))

// ─── 4) 분석 ────────────────────────────────────────────────
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0 }
const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0
const pct = (n, d) => d ? `${Math.round(n / d * 100)}%` : '—'

const byKeyword = {}
for (const p of all) (byKeyword[p.keyword] ||= []).push(p)

let md = `# 네이버 블로그 상위 노출 글 뜯어보기\n\n`
md += `키워드 ${Object.keys(byKeyword).length}개 · 키워드당 상위 ${TOP_N}건 · 총 ${all.length}건\n`
md += `모바일 검색(\`m.search.naver.com\`) 노출 순서 기준\n\n`

md += `## 1. 글이 얼마나 긴가, 이미지는 얼마나 쓰나\n\n`
md += `| 키워드 | 건수 | 글자수(중앙) | 문단 | 소제목 | 이미지 | 이미지/1000자 |\n|---|---|---|---|---|---|---|\n`
for (const [q, ps] of Object.entries(byKeyword)) {
  md += `| ${q} | ${ps.length} | ${med(ps.map(p => p.chars)).toLocaleString()}자 `
      + `| ${avg(ps.map(p => p.paragraphs))} | ${avg(ps.map(p => p.headings))} `
      + `| ${avg(ps.map(p => p.images))} | ${(avg(ps.map(p => p.imgPer1000 * 100)) / 100).toFixed(2)} |\n`
}
const A = all
md += `| **전체** | **${A.length}** | **${med(A.map(p => p.chars)).toLocaleString()}자** `
    + `| **${avg(A.map(p => p.paragraphs))}** | **${avg(A.map(p => p.headings))}** `
    + `| **${avg(A.map(p => p.images))}** | **${(avg(A.map(p => p.imgPer1000 * 100)) / 100).toFixed(2)}** |\n`

md += `\n## 2. 제목은 어떻게 짓나\n\n`
const has = (ps, re) => ps.filter(p => re.test(p.title)).length
md += `| 키워드 | 제목 길이(중앙) | 숫자 | 질문형 | 괄호/기호 | 연도 | 정리·총정리 |\n|---|---|---|---|---|---|---|\n`
for (const [q, ps] of Object.entries(byKeyword)) {
  md += `| ${q} | ${med(ps.map(p => p.title.length))}자 `
      + `| ${pct(has(ps, /\d/), ps.length)} | ${pct(has(ps, /[?？]|까요|나요|할까|일까/), ps.length)} `
      + `| ${pct(has(ps, /[\[\]【】(){}!·~｜|]/), ps.length)} | ${pct(has(ps, /20\d\d/), ps.length)} `
      + `| ${pct(has(ps, /정리|총정리|가이드|한눈에|방법/), ps.length)} |\n`
}

md += `\n## 3. 오래된 글이 아직 버티고 있나 — 신규 블로그가 뚫을 여지\n\n`
md += `| 키워드 | 발행연도 분포 | 1년 이내 |\n|---|---|---|\n`
const THIS_YEAR = new Date().getFullYear()
for (const [q, ps] of Object.entries(byKeyword)) {
  const yrs = {}
  for (const p of ps) { const y = p.date?.slice(0, 4) || '미상'; yrs[y] = (yrs[y] || 0) + 1 }
  const fresh = ps.filter(p => +(p.date?.slice(0, 4) || 0) >= THIS_YEAR - 1).length
  md += `| ${q} | ${Object.entries(yrs).sort((a, b) => b[0].localeCompare(a[0]))
    .map(([y, c]) => `${y} ${c}`).join(' · ')} | ${pct(fresh, ps.length)} |\n`
}

md += `\n## 4. 많이 붙는 태그\n\n`
const tagCount = {}
for (const p of all) for (const t of p.tags) tagCount[t] = (tagCount[t] || 0) + 1
md += Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 30)
  .map(([t, c]) => `\`#${t}\` ${c}`).join(' · ') + '\n'

md += `\n## 5. 글별 원문\n\n`
for (const [q, ps] of Object.entries(byKeyword)) {
  md += `### ${ps[0].cat} · ${q}\n\n`
  for (const p of ps) {
    md += `**${p.rank}. ${p.title}**\n`
    md += `- ${p.blogName || p.blogId} · ${p.date || '날짜미상'} · ${p.chars.toLocaleString()}자 · 이미지 ${p.images}\n`
    md += `- 도입: ${p.head.slice(0, 160)}…\n`
    md += `- ${p.url}\n\n`
  }
}

writeFileSync(join(OUT, 'study.md'), md)
console.log(`\n원본 → ${join(OUT, 'posts.json')}`)
console.log(`분석 → ${join(OUT, 'study.md')}`)
