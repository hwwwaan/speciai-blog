// 상위 노출 글의 본문을 "구조 그대로" 뽑는다.
//
// study.mjs 가 숫자(글자수·이미지수)를 셌다면, 이건 실제 뼈대를 본다.
//   무엇으로 열고 → 소제목을 어떻게 달고 → 이미지를 어디에 끼우고 → 어떻게 닫는지
//
// 실행: node extract.mjs                    # posts.json 에서 학습 대상 자동 선별
//       node extract.mjs rct190/223964346479  # 특정 글 하나
//
// 결과: out/corpus/<blogId>_<postId>.md  (사람이 읽는 형태)
//       out/corpus/_index.json           (구조 시퀀스 집계용)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'out')
const CORPUS = join(OUT, 'corpus')
mkdirSync(CORPUS, { recursive: true })

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const NAMED = { quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', middot: '·', hellip: '…', amp: '&' }
const unesc = s => s
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&(\w+);/g, (m, n) => NAMED[n] ?? m)
const text = h => unesc(h.replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ')
  .replace(/\s*\n\s*/g, '\n').trim()

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

// ─── 본문을 컴포넌트 순서대로 분해 ──────────────────────────
// 스마트에디터(SE-ONE)는 본문을 se-component 단위로 쌓는다. 그 순서가 곧 글의 뼈대다.
function decompose(html) {
  const m = html.match(/<div class="se-main-container">([\s\S]*)<\/div>/)
  if (!m) return []
  const main = m[1]

  const blocks = []
  // se-component 하나씩 잘라낸다
  const re = /<div class="se-component ([^"]*?)"[\s\S]*?(?=<div class="se-component |$)/g
  for (const c of main.matchAll(re)) {
    const cls = c[1], chunk = c[0]

    let type = 'etc'
    if (/se-text/.test(cls)) type = 'text'
    else if (/se-image/.test(cls)) type = 'image'
    else if (/se-quotation/.test(cls)) type = 'quote'
    else if (/se-table/.test(cls)) type = 'table'
    else if (/se-horizontalLine/.test(cls)) type = 'hr'
    else if (/se-oglink|se-placesMap|se-video/.test(cls)) type = 'embed'
    else if (/se-sectionTitle/.test(cls)) type = 'heading'
    else if (/se-material|se-code/.test(cls)) type = 'box'

    if (type === 'image' || type === 'hr' || type === 'embed') {
      blocks.push({ type, text: '' })
      continue
    }

    // 텍스트 계열은 문단별로 쪼갠다
    const paras = [...chunk.matchAll(/<p class="se-text-paragraph[^"]*"[\s\S]*?<\/p>/g)]
      .map(p => text(p[0])).filter(Boolean)

    if (!paras.length) { const t = text(chunk); if (t) blocks.push({ type, text: t }); continue }

    for (const p of paras) {
      // 굵게/큰 글씨 문단은 소제목으로 본다
      const isHead = type === 'quote' || type === 'heading'
        || (p.length < 40 && /^[▶▪◆■●□◇★☆\d\-–—\[「【]/.test(p))
      blocks.push({ type: isHead ? 'heading' : type, text: p })
    }
  }
  return blocks
}

function toMarkdown(meta, blocks) {
  let md = `# ${meta.title}\n\n`
  md += `> ${meta.blogName || meta.blogId} · ${meta.date} · ${meta.url}\n`
  md += `> 검색어 「${meta.keyword}」 ${meta.rank}위\n\n---\n\n`
  for (const b of blocks) {
    if (b.type === 'image') { md += `\n\`[이미지]\`\n\n`; continue }
    if (b.type === 'hr') { md += `\n---\n\n`; continue }
    if (b.type === 'embed') { md += `\n\`[링크/영상]\`\n\n`; continue }
    if (b.type === 'table') { md += `\n\`[표]\` ${b.text.slice(0, 200)}\n\n`; continue }
    if (b.type === 'heading') { md += `\n## ${b.text}\n\n`; continue }
    if (b.type === 'quote') { md += `\n> ${b.text}\n\n`; continue }
    md += `${b.text}\n\n`
  }
  return md
}

// 구조를 한 줄 기호열로 — 리듬이 한눈에 보인다
const SYM = { text: 'T', image: 'I', heading: 'H', quote: 'Q', table: 'B', hr: '-', embed: 'L', box: 'X', etc: '.' }
const sequence = blocks => blocks.map(b => SYM[b.type] || '.').join('')

// ─── 대상 선정 ──────────────────────────────────────────────
const arg = process.argv[2]
let targets = []

if (arg && arg.includes('/')) {
  const [blogId, postId] = arg.split('/')
  targets = [{ blogId, postId, title: '', keyword: '직접지정', rank: 0 }]
} else {
  const posts = JSON.parse(readFileSync(join(OUT, 'posts.json'), 'utf8'))
  const PRO = /노무사|세무사|변호사|회계사|법무법인|세무법인|노무법인|법률사무소|컨설팅/
  // 키워드마다 ① 1위 글 ② 전문가 블로그 중 최상위 — 둘을 비교하려고 함께 담는다
  const byKw = {}
  for (const p of posts) (byKw[p.keyword] ||= []).push(p)
  for (const ps of Object.values(byKw)) {
    const top = ps.find(p => p.rank === 1) || ps[0]
    const pro = ps.find(p => PRO.test(p.blogName + p.title) && p !== top)
    for (const t of [top, pro]) if (t && !targets.some(x => x.postId === t.postId)) targets.push(t)
  }
}

console.log(`대상 ${targets.length}건\n`)

const index = []
for (const t of targets) {
  await sleep(600)
  const url = `https://m.blog.naver.com/${t.blogId}/${t.postId}`
  try {
    const html = await get(url)
    const blocks = decompose(html)
    if (!blocks.length) { console.error(`  ✗ ${t.blogId} — 본문 파싱 실패`); continue }

    const title = t.title
      || unesc(html.match(/property="og:title" content="([^"]*)"/)?.[1] || '')
        .replace(/\s*:\s*네이버 블로그\s*$/, '')
    const meta = { ...t, title, url }
    const file = `${t.blogId}_${t.postId}.md`
    writeFileSync(join(CORPUS, file), toMarkdown(meta, blocks))

    const seq = sequence(blocks)
    const chars = blocks.filter(b => b.type === 'text').reduce((s, b) => s + b.text.length, 0)
    index.push({
      file, ...meta, seq, chars,
      counts: Object.fromEntries(Object.entries(SYM)
        .map(([k, v]) => [k, (seq.match(new RegExp(v === '-' ? '\\-' : v, 'g')) || []).length])
        .filter(([, n]) => n)),
      opener: blocks.find(b => b.type === 'text')?.text.slice(0, 120) || '',
      closer: [...blocks].reverse().find(b => b.type === 'text')?.text.slice(0, 120) || '',
      headings: blocks.filter(b => b.type === 'heading').map(b => b.text).slice(0, 12),
    })
    console.log(`✓ ${t.keyword.padEnd(16)} ${title.slice(0, 30)}`)
  } catch (e) {
    console.error(`  ✗ ${t.blogId}/${t.postId} — ${e.message}`)
  }
}

writeFileSync(join(CORPUS, '_index.json'), JSON.stringify(index, null, 2))
console.log(`\n본문 ${index.length}건 → ${CORPUS}`)
console.log(`구조 색인 → ${join(CORPUS, '_index.json')}`)
