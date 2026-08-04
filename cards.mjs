// 블로그 본문 이미지 생성기
//
//   generate.mjs 가 심어둔 `![카드뉴스: 설명]()` 마커를 읽어서
//   각 자리에 들어갈 카드를 만들고, 본문에 경로를 꽂은 발행본을 뽑는다.
//
// 실행:
//   node cards.mjs posts/2026-08-04-접대비-한도.md
//   node cards.mjs posts/....md --max 12      # 카드 수 제한
//   node cards.mjs posts/....md --dry         # 스펙만 만들고 렌더는 안 함
//
// 결과: out/cards/<슬러그>/NN_<유형>.png  +  posts/<이름>.발행본.md
//
// ※ 카드뉴스 파이프라인(studio/카드뉴스/cardnews-white)은 인스타 세로형(1080×1350)
//   전용이고 crontab 이 도는 운영 코드라 건드리지 않는다.
//   블로그 본문은 정사각(1080)이 맞아서 여기서 따로 렌더한다.

import Anthropic from '@anthropic-ai/sdk'
import puppeteer from 'puppeteer'
import { findChrome } from '../studio/카드뉴스/cardnews-white/src/chrome.mjs'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

// ─── 브랜드 토큰 (render.mjs 와 같은 값) ────────────────────
const C = {
  ink: '#0A0A0A', warm: '#1E1712', brand: '#D85A30', brand2: '#CB603D',
  paper: '#F0F0F0', mute: '#9a9a96', line: '#2A2320',
}
const FONT = `'Pretendard','Apple SD Gothic Neo',sans-serif`
const SIZE = 1080

// ─── 인자 ───────────────────────────────────────────────────
const argv = process.argv.slice(2)
const file = argv.find(a => !a.startsWith('--'))
const maxIdx = argv.indexOf('--max')
const MAX = maxIdx >= 0 ? +argv[maxIdx + 1] : 999
const DRY = argv.includes('--dry')

if (!file || !existsSync(file)) {
  console.error('글 파일을 넣어주세요.  예)  node cards.mjs posts/2026-08-04-접대비-한도.md')
  process.exit(1)
}

// ─── 마커 뽑기 ──────────────────────────────────────────────
const raw = readFileSync(file, 'utf8')
const slug = basename(file, '.md')

// `![카드뉴스: 설명]()` — 아직 경로가 안 채워진 것만
const MARKER = /!\[(?:카드뉴스:\s*)?([^\]]+)\]\(\s*\)/g
const markers = []
let m, lastHead = ''
for (const line of raw.split('\n')) {
  if (line.startsWith('## ')) lastHead = line.slice(3).trim()
  MARKER.lastIndex = 0
  while ((m = MARKER.exec(line))) markers.push({ desc: m[1].trim(), section: lastHead, raw: m[0] })
}

if (!markers.length) {
  console.error('채울 마커가 없습니다. `![카드뉴스: 설명]()` 형식이어야 합니다.')
  process.exit(1)
}

const targets = markers.slice(0, MAX)
console.log(`마커 ${markers.length}개 발견${targets.length < markers.length ? ` → 앞 ${targets.length}개만 만듭니다` : ''}\n`)

// ─── 카드 내용 생성 ─────────────────────────────────────────
function findApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  for (const p of [join(HERE, '.env'), join(HERE, '..', 'studio', '카드뉴스', 'cardnews-white', '.env')]) {
    if (!existsSync(p)) continue
    const mm = readFileSync(p, 'utf8').match(/^ANTHROPIC_API_KEY\s*=\s*(.+)$/m)
    if (mm) return mm[1].trim().replace(/^["']|["']$/g, '')
  }
  return null
}
const apiKey = findApiKey()
if (!apiKey) { console.error('ANTHROPIC_API_KEY 를 못 찾았습니다.'); process.exit(1) }

const SCHEMA = {
  type: 'object',
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['stat', 'points', 'table', 'quote'] },
          title: { type: 'string', description: '카드 상단 제목. 18자 이내' },
          stat: {
            type: 'object',
            properties: {
              value: { type: 'string', description: '숫자만. 예 "3,600"' },
              unit: { type: 'string', description: '단위. 예 "만원"' },
              label: { type: 'string', description: '무슨 숫자인지 한 줄' },
            },
            required: ['value', 'unit', 'label'], additionalProperties: false,
          },
          points: { type: 'array', items: { type: 'string' }, description: '한 줄씩 3~4개. 각 30자 이내' },
          rows: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                k: { type: 'string', description: '왼쪽 — 항목·구간 이름 (예 "100억 이하", "기업업무추진비"). 12자 이내' },
                v: { type: 'string', description: '오른쪽 — 그 항목의 값·설명. 강조되어 보인다 (예 "0.3%", "거래처 등 외부인"). 16자 이내' },
              },
              required: ['k', 'v'], additionalProperties: false,
            },
            description: '비교표 2~5행. k 가 이름, v 가 값이다. 뒤집지 말 것',
          },
          quote: {
            type: 'object',
            properties: {
              text: { type: 'string', description: '조문 내용. 60자 이내로 요약 가능' },
              source: { type: 'string', description: '법령명 + 조번호' },
            },
            required: ['text', 'source'], additionalProperties: false,
          },
        },
        required: ['type', 'title'], additionalProperties: false,
      },
    },
  },
  required: ['cards'], additionalProperties: false,
}

const body = raw.replace(/^---[\s\S]*?\n---\n/, '')

const prompt = `아래는 speciai.team 네이버 블로그에 올릴 글입니다.
본문에 이미지가 들어갈 자리 ${targets.length}곳이 표시돼 있습니다.
각 자리에 넣을 카드 내용을 만들어 주세요.

# 글 본문

${body.slice(0, 14000)}

# 만들 카드 ${targets.length}장

${targets.map((t, i) => `${i + 1}. [${t.section || '도입'}] ${t.desc}`).join('\n')}

# 규칙

- **순서와 개수를 정확히 지키세요.** ${targets.length}장을 위 순번대로 만듭니다.
- 유형은 내용에 맞게 고릅니다.
  - \`stat\` — 금액·비율·기한처럼 숫자 하나가 핵심일 때. 가장 눈에 띕니다
  - \`points\` — 요건·절차·체크리스트를 3~4줄로 나열할 때
  - \`table\` — 구간별 요율, 이전/이후 비교처럼 짝이 있는 정보
  - \`quote\` — 법조문을 그대로 보여줄 때. source 에 조번호를 답니다
- **본문에 실제로 있는 내용만** 쓰세요. 새 사실을 만들지 마세요.
- 본문에 \`[확인 필요: ~]\` 로 표시된 미확정 수치는 **카드로 만들지 마세요.**
  그 자리는 다른 각도(요건·절차)로 채우세요.
- 글자를 빽빽하게 넣지 마세요. 카드 하나에 메시지 하나입니다.
- 제목은 18자 이내, 본문 항목은 30자 이내로 짧게.`

console.log('카드 내용 생성 중…')
const client = new Anthropic({ apiKey })
const res = await client.messages.create({
  model: 'claude-opus-5',
  max_tokens: 16000,
  output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
  messages: [{ role: 'user', content: prompt }],
})

if (res.stop_reason === 'refusal') { console.error('요청이 거부됐습니다.'); process.exit(1) }

const spec = JSON.parse(res.content.find(b => b.type === 'text').text)
const cards = spec.cards.slice(0, targets.length)
console.log(`카드 ${cards.length}장 · 유형 ${[...new Set(cards.map(c => c.type))].join(' / ')}\n`)

const OUT = join(HERE, 'out', 'cards', slug)
mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, '_spec.json'), JSON.stringify({ slug, cards }, null, 2))

if (DRY) {
  console.log(`스펙만 저장했습니다 → ${join(OUT, '_spec.json')}`)
  process.exit(0)
}

// ─── 렌더 ───────────────────────────────────────────────────
const shell = inner => `
<div style="width:${SIZE}px;height:${SIZE}px;position:relative;overflow:hidden;background:${C.ink};
  font-family:${FONT};-webkit-font-smoothing:antialiased">
  <div style="position:absolute;inset:0;
    background-image:linear-gradient(${C.brand}0F 1px,transparent 1px),
                     linear-gradient(90deg,${C.brand}0F 1px,transparent 1px);
    background-size:72px 72px"></div>
  <div style="position:absolute;width:620px;height:620px;border-radius:50%;filter:blur(120px);
    opacity:.32;background:${C.brand};right:-180px;top:-200px"></div>
  <!-- 제목과 내용을 한 덩어리로 묶어 세로 중앙에 둔다 (사이가 뜨지 않게) -->
  <div style="position:relative;height:100%;display:flex;flex-direction:column;
    justify-content:center;padding:88px 84px 190px">
    ${inner}
  </div>
  <div style="position:absolute;left:84px;bottom:64px;display:flex;align-items:center;gap:14px">
    <div style="width:40px;height:40px;border-radius:12px;
      background:linear-gradient(135deg,${C.brand},${C.brand2});color:#fff;font-size:22px;
      font-weight:800;display:flex;align-items:center;justify-content:center">S</div>
    <div style="font-size:26px;font-weight:700;color:${C.paper};letter-spacing:-.03em">
      speciai<span style="color:${C.brand}">.team</span></div>
  </div>
</div>`

const title = t => `<div style="font-size:46px;font-weight:800;color:${C.paper};
  letter-spacing:-.04em;line-height:1.3;margin-bottom:48px">${t}</div>`

const TPL = {
  stat: c => shell(title(c.title) + `
    <div>
      <div style="display:flex;align-items:baseline;gap:14px">
        <span style="font-size:180px;font-weight:800;color:${C.brand};letter-spacing:-.05em;
          line-height:.95">${c.stat?.value ?? ''}</span>
        <span style="font-size:64px;font-weight:700;color:${C.brand};letter-spacing:-.03em"
          >${c.stat?.unit ?? ''}</span>
      </div>
      <div style="margin-top:36px;font-size:34px;color:${C.mute};letter-spacing:-.025em;
        line-height:1.5;max-width:820px">${c.stat?.label ?? ''}</div>
    </div>`),

  points: c => shell(title(c.title) + `
    <div style="display:flex;flex-direction:column;gap:30px">
      ${(c.points ?? []).map((p, i) => `
        <div style="display:flex;gap:24px;align-items:flex-start">
          <div style="width:52px;height:52px;border-radius:14px;background:${C.brand}22;
            border:1.5px solid ${C.brand}66;color:${C.brand};font-size:26px;font-weight:800;
            display:flex;align-items:center;justify-content:center;flex-shrink:0">${i + 1}</div>
          <div style="font-size:36px;color:${C.paper};letter-spacing:-.03em;line-height:1.45;
            padding-top:4px">${p}</div>
        </div>`).join('')}
    </div>`),

  table: c => shell(title(c.title) + `
    <div>
      ${(c.rows ?? []).map((r, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;
          padding:30px 4px;${i ? `border-top:1px solid ${C.line}` : ''}">
          <span style="font-size:34px;color:${C.mute};letter-spacing:-.025em">${r.k}</span>
          <span style="font-size:38px;font-weight:700;color:${C.paper};letter-spacing:-.03em"
            >${r.v}</span>
        </div>`).join('')}
    </div>`),

  quote: c => shell(title(c.title) + `
    <div>
      <div style="border-left:5px solid ${C.brand};padding:8px 0 8px 36px">
        <div style="font-size:40px;color:${C.paper};letter-spacing:-.03em;line-height:1.55"
          >${c.quote?.text ?? ''}</div>
        <div style="margin-top:32px;font-size:28px;font-weight:600;color:${C.brand};
          letter-spacing:-.02em">${c.quote?.source ?? ''}</div>
      </div>
    </div>`),
}

const browser = await puppeteer.launch({ headless: true, executablePath: findChrome() })
const page = await browser.newPage()
await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 })

const made = []
for (const [i, c] of cards.entries()) {
  const html = (TPL[c.type] || TPL.points)(c)
  await page.setContent(`<html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box}</style></head><body>${html}</body></html>`, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  const name = `${String(i + 1).padStart(2, '0')}_${c.type}.png`
  writeFileSync(join(OUT, name), await page.screenshot({ type: 'png' }))
  made.push(name)
  console.log(`✓ ${name}  ${c.title}`)
}
await browser.close()

// ─── 본문에 경로 꽂기 ───────────────────────────────────────
let published = raw
targets.forEach((t, i) => {
  if (!made[i]) return
  published = published.replace(t.raw, `![${t.desc}](../out/cards/${slug}/${made[i]})`)
})
const pubPath = file.replace(/\.md$/, '.발행본.md')
writeFileSync(pubPath, published)

console.log(`\n${'─'.repeat(50)}`)
console.log(`카드 ${made.length}장 → ${OUT}`)
console.log(`발행본 → ${pubPath}`)
console.log(`\n네이버 에디터에 붙일 때는 이미지를 순서대로 올리면 됩니다.`)
