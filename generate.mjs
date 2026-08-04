// speciai.team 네이버 블로그 글 생성기
//
//   리서치로 뽑은 글쓰기 규칙 + 같은 주제 상위 글의 뼈대 + 웹 검색을 물려서
//   네이버 상위 노출 규격에 맞는 초고를 쓴다.
//
// 실행:
//   node generate.mjs "접대비 한도"                  # 주제만
//   node generate.mjs "접대비 한도" --cat 세무        # 카테고리 지정
//   node generate.mjs --list                        # 추천 주제 (전략.md 기준)
//
// 결과: posts/<날짜>-<슬러그>.md
//
// ※ 법률·세무 글이라 웹 검색을 켜서 최신 기준을 확인하게 한다.
//   그래도 초고다. 발행 전에 전문가 검토를 반드시 거친다.

import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const RESEARCH = join(HERE, 'research')
const POSTS = join(HERE, 'posts')
mkdirSync(POSTS, { recursive: true })

// ─── API 키 ─────────────────────────────────────────────────
// 환경변수 → blog/.env → 카드뉴스 .env 순으로 찾는다.
function findApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  const candidates = [
    join(HERE, '.env'),
    join(HERE, '..', 'studio', '카드뉴스', 'cardnews-white', '.env'),
  ]
  for (const p of candidates) {
    if (!existsSync(p)) continue
    const m = readFileSync(p, 'utf8').match(/^ANTHROPIC_API_KEY\s*=\s*(.+)$/m)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return null
}

const apiKey = findApiKey()
if (!apiKey) {
  console.error(`
ANTHROPIC_API_KEY 를 못 찾았습니다. 아래 중 하나로 넣어주세요.

  export ANTHROPIC_API_KEY=sk-ant-...        (셸)
  echo 'ANTHROPIC_API_KEY=sk-ant-...' > ${join(HERE, '.env')}
`)
  process.exit(1)
}

const client = new Anthropic({ apiKey })

// ─── 인자 ───────────────────────────────────────────────────
const argv = process.argv.slice(2)
if (argv.includes('--list')) {
  console.log(`
전략.md 가 추천한 첫 5개 주제입니다. 오래된 글이 상위를 지키는 키워드 순.

  node generate.mjs "접대비 한도"            # 1년 이내 글 10% — 최우선
  node generate.mjs "주휴수당 계산"          # 30%
  node generate.mjs "표준근로계약서 작성"     # 40%
  node generate.mjs "중대재해처벌법 중소기업" # 38%
  node generate.mjs "5인 미만 사업장 연차"    # 60%

전체 근거는 research/전략.md 를 보세요.
`)
  process.exit(0)
}

const catIdx = argv.indexOf('--cat')
const category = catIdx >= 0 ? argv[catIdx + 1] : null
const topic = argv.filter((a, i) => !a.startsWith('--') && i !== catIdx + 1)[0]

if (!topic) {
  console.error('주제를 넣어주세요.  예)  node generate.mjs "접대비 한도"\n추천 주제는 --list')
  process.exit(1)
}

// ─── 참고자료 모으기 ────────────────────────────────────────
const read = p => (existsSync(p) ? readFileSync(p, 'utf8') : '')

const rules = read(join(RESEARCH, '글쓰기-규칙.md'))
if (!rules) {
  console.error('research/글쓰기-규칙.md 가 없습니다. 먼저 리서치를 돌려주세요.')
  process.exit(1)
}

// 같은 주제로 수집해 둔 상위 글이 있으면 뼈대 참고용으로 붙인다
function findCorpus(topic) {
  const dir = join(RESEARCH, 'out', 'corpus')
  if (!existsSync(dir)) return []
  const index = existsSync(join(dir, '_index.json'))
    ? JSON.parse(readFileSync(join(dir, '_index.json'), 'utf8'))
    : []
  const words = topic.split(/\s+/).filter(w => w.length > 1)
  const hits = index
    .filter(x => words.some(w => (x.keyword || '').includes(w) || (x.title || '').includes(w)))
    .slice(0, 3)
  return hits.map(h => ({
    title: h.title,
    seq: h.seq,
    body: read(join(dir, h.file)).slice(0, 6000),
  })).filter(h => h.body)
}

const corpus = findCorpus(topic)

// 그 키워드의 경쟁 상황 (study.md 에서 해당 줄만)
const study = read(join(RESEARCH, 'out', 'study.md'))
const studyLines = study.split('\n').filter(l => topic.split(/\s+/).some(w => l.includes(w)))
  .filter(l => l.startsWith('|')).slice(0, 6).join('\n')

// ─── 프롬프트 ───────────────────────────────────────────────
const SYSTEM = `당신은 speciai.team 의 콘텐츠 담당자입니다.

speciai.team 은 중소기업·스타트업을 위한 AI 법률·세무·노무 컴플라이언스 어드바이저리입니다.
독자는 직원 5~50명 규모 회사의 대표나 관리 담당자입니다. 법을 전공하지 않았고,
규정을 몰라서 과태료를 맞는 상황을 가장 두려워합니다.

아래는 네이버 블로그 상위 노출 글 174건을 수집해 분석한 규칙입니다.
이 규격을 지켜야 검색에 걸립니다. 그대로 따르세요.

${rules}

---

# 정확성 — 이게 우리가 이기는 지점입니다

상위 노출 글의 78%가 비전문가 블로그라 법 개정을 못 따라갑니다.
우리는 정확도로 갈립니다. 반드시:

- **웹 검색으로 현행 기준을 확인하고 쓰세요.** 기억에 의존하지 마세요.
  세법·노동법은 매년 바뀝니다. 금액·요율·기준일은 특히 위험합니다.
- 법조문은 **조번호까지** 밝혀 인용하세요. (예: 근로기준법 제60조 제1항)
- 확인 못 한 수치는 **쓰지 마세요.** 빈칸으로 두고 \`[확인 필요: ~]\` 로 표시하세요.
  지어내는 것보다 비워두는 게 낫습니다.
- 글 안에 **기준일을 명시**하세요. ("2026년 8월 기준")
- 단정할 수 없는 건 단정하지 마세요. "사안에 따라 달라질 수 있습니다"

# 출력 형식 — 이 골격을 그대로 채우세요

응답은 **아래 골격 그대로** 나와야 합니다. 파일에 그대로 저장되기 때문입니다.
앞에 리서치 요약이나 설명을 붙이지 말고, 전체를 코드블록으로 감싸지도 마세요.

\`\`\`
---
title: 제목 (30~38자, 숫자 포함)
category: 법률 | 세무 | 노무 | 컴플라이언스 사례
keyword: 노린 검색어
tags: [태그, 12개, 쉼표로]
sources:
  - 참고한 법령·자료 (조번호까지)
checks:
  - 발행 전 전문가가 확인해야 할 항목
---

![카드뉴스: 대표 이미지 설명]()

(도입 문단부터 본문 시작)
\`\`\`

**여는 \`---\` 와 닫는 \`---\` 사이의 여섯 필드를 절대 빠뜨리지 마세요.**
제목만 있고 나머지가 없거나, \`---\` 만 찍고 바로 본문으로 넘어가면 파일이 깨집니다.

**분량은 본문 기준 2,800~3,300자입니다.** 이보다 짧으면 얕아 보여 검색에서 밀리고,
길면 이탈률이 올라갑니다. 짧게 끝내지 말고 이 범위를 채우세요.
대신 곁가지로 늘리지 말고 **독자가 당장 판단하는 데 필요한 것**으로 채웁니다 —
요건, 금액, 절차, 예외, 그리고 "우리 회사는 어디에 해당하는가".

본문 규칙:
- 소제목은 \`## 1. ~\` 형식
- 이미지가 들어갈 자리마다 \`![카드뉴스: 무엇을 보여줄지 한 줄]()\` 를 넣으세요.
  100자마다 하나 꼴, 총 18~20개입니다. 카드뉴스 파이프라인이 이걸 보고 만듭니다.
- 표는 마크다운 표로
- 마지막에 요약 → CTA → 출처·면책 → 해시태그 순

CTA 는 이 형식을 씁니다:
> 우리 회사에 어떻게 적용되는지 헷갈리신다면 speciai.team 의 무료 컴플라이언스 진단으로
> 확인해 보세요. 근로계약서·취업규칙을 함께 보고 빠진 부분을 짚어드립니다.`

let userMsg = `주제: **${topic}**\n`
if (category) userMsg += `카테고리: ${category}\n`

if (studyLines) {
  userMsg += `\n## 이 키워드의 경쟁 상황 (우리 리서치 데이터)\n\n${studyLines}\n`
}

if (corpus.length) {
  userMsg += `\n## 현재 상위 노출 중인 글 ${corpus.length}건 — 뼈대 참고용\n\n`
  userMsg += `구성을 참고하되 **문장을 베끼지 마세요.** 이들 대부분은 낡은 기준을 씁니다.\n\n`
  for (const c of corpus) {
    userMsg += `### ${c.title}\n구조: \`${c.seq.slice(0, 60)}\`\n\n${c.body}\n\n---\n\n`
  }
}

userMsg += `
## 지금 할 일

1. 웹 검색으로 **${topic}** 의 현행 기준을 확인하세요. 관련 법령 조문, 최근 개정 사항,
   적용 대상과 예외를 찾으세요. 2026년 기준인지 반드시 확인하세요.
2. 확인한 내용으로 규격에 맞는 글을 쓰세요.
3. 검색으로 확정하지 못한 수치나 기준은 \`[확인 필요: ~]\` 로 남기고
   프론트매터의 \`checks\` 에도 적으세요.

바로 시작하세요.`

// ─── 생성 ───────────────────────────────────────────────────
console.log(`주제: ${topic}`)
console.log(`참고: 규칙 ${rules.length.toLocaleString()}자`
  + (corpus.length ? ` · 상위글 ${corpus.length}건` : ' · 상위글 없음(리서치 먼저 돌리면 품질이 올라갑니다)'))
console.log(`웹 검색으로 현행 기준 확인 중…\n`)

const messages = [{ role: 'user', content: userMsg }]
let full = ''

for (let round = 0; round < 5; round++) {
  const stream = client.messages.stream({
    model: 'claude-opus-5',
    max_tokens: 32000,
    output_config: { effort: 'high' },
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 12 }],
    messages,
  })

  stream.on('text', t => process.stdout.write(t))

  const msg = await stream.finalMessage()

  if (msg.stop_reason === 'refusal') {
    console.error('\n\n요청이 거부됐습니다. 주제를 다시 잡아주세요.')
    process.exit(1)
  }

  full = msg.content.filter(b => b.type === 'text').map(b => b.text).join('')

  // 서버 툴이 반복 한도에 걸리면 이어서 요청한다
  if (msg.stop_reason === 'pause_turn') {
    messages.push({ role: 'assistant', content: msg.content })
    continue
  }
  break
}

// ─── 정리 ───────────────────────────────────────────────────
// 지시해도 앞에 설명을 붙이거나 코드블록으로 감싸는 경우가 있어 안전망을 둔다.
function tidy(text) {
  let t = text.trim()
  // ```markdown … ``` 로 감쌌으면 안쪽만 꺼낸다
  const fenced = t.match(/```(?:markdown|md)?\s*\n([\s\S]*?)\n```/)
  if (fenced && fenced[1].trimStart().startsWith('---')) t = fenced[1]
  // 프론트매터 앞에 붙은 잡설을 잘라낸다
  const fm = t.indexOf('\n---\n')
  if (!t.startsWith('---') && fm > -1) t = t.slice(fm + 1)
  return t.trim() + '\n'
}

full = tidy(full)

// ─── 저장 ───────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10)
const slug = topic.replace(/\s+/g, '-').replace(/[^\wㄱ-ㅎ가-힣-]/g, '')
const dest = join(POSTS, `${today}-${slug}.md`)
writeFileSync(dest, full)

// 프론트매터는 첫 줄의 --- 부터 다음 --- 줄까지. 본문 중간의 구분선에 걸리지 않게 줄 단위로 자른다
const hasFm = /^---\n[\s\S]*?\n---\n/.test(full)
const chars = full.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').length
const images = (full.match(/!\[/g) || []).length
const heads = (full.match(/^## /gm) || []).length
const checks = (full.match(/\[확인 필요[^\]]*\]/g) || []).length

console.log(`\n\n${'─'.repeat(50)}`)
console.log(`저장 → ${dest}`)
console.log(`본문 ${chars.toLocaleString()}자 · 이미지 자리 ${images} · 소제목 ${heads}`)
console.log(`목표   2,800자 내외 · 이미지 20 · 소제목 6`)
if (!hasFm) console.log(`\n⚠ 프론트매터가 없습니다 — rank.mjs 가 키워드를 못 읽습니다. 다시 생성하세요.`)
if (checks) console.log(`\n⚠ 확인이 필요한 항목 ${checks}건이 본문에 표시돼 있습니다.`)
console.log(`\n초고입니다. 발행 전에 전문가 검토를 거치세요.`)
