// 블로그 소재 발굴 — 사람들이 실제로 검색하는 말을 긁어온다.
//
//   네이버 자동완성은 실제 검색 수요를 그대로 보여준다.
//   씨앗 단어를 넣으면 거기서 갈라져 나온 실검색어를 2단계까지 넓힌다.
//
// 실행: node topics.mjs           # 수집 + 선별
//       node topics.mjs --raw     # 선별 없이 수집만 (LLM 호출 안 함)
//
// 결과: out/소재풀.json  (선별 전 전량)
//       out/소재.json    (우리 업종에 맞게 골라낸 것)

import Anthropic from '@anthropic-ai/sdk'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'out')
mkdirSync(OUT, { recursive: true })

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ─── 씨앗 ───────────────────────────────────────────────────
// 짧을수록 넓게 갈라진다. 긴 문장을 넣으면 그 가지만 나온다.
const SEEDS = {
  노무: ['주휴수당', '연차', '퇴직금', '근로계약서', '4대보험', '취업규칙', '해고',
    '임금체불', '수습기간', '포괄임금', '연장근로', '직장내 괴롭힘', '육아휴직', '권고사직'],
  세무: ['법인세', '부가세', '세무조사', '접대비', '기업업무추진비', '가지급금',
    '법인전환', '세액공제', '원천징수', '인건비', '증빙', '종합소득세', '절세'],
  법률: ['근로기준법', '개인정보처리방침', '이용약관', '하도급', '상표등록',
    '주주간계약서', '스톡옵션', '투자계약서', '비밀유지계약', '전자상거래법'],
  컴플라: ['중대재해처벌법', '개인정보보호법', '산업안전보건법', '성희롱 예방교육',
    '컴플라이언스', '과태료'],
}

// 사업자 관점으로 좁히는 접두어 — 같은 단어도 검색 의도가 갈린다
const PREFIXES = ['사업자', '법인', '중소기업', '스타트업', '5인 미만']

// ─── 자동완성 ───────────────────────────────────────────────
async function suggest(query) {
  const url = 'https://ac.search.naver.com/nx/ac'
    + `?q=${encodeURIComponent(query)}&st=100&r_format=json&r_enc=UTF-8&q_enc=UTF-8&frm=nv`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!res.ok) return []
    const json = await res.json()
    return (json.items?.[0] ?? []).map(x => x[0]).filter(Boolean)
  } catch { return [] }
}

// ─── 수집 ───────────────────────────────────────────────────
const pool = new Map()   // 검색어 → {cat, from, depth}
const add = (q, cat, from, depth) => {
  const k = q.trim()
  if (!k || pool.has(k)) return
  pool.set(k, { q: k, cat, from, depth })
}

console.log('1단계 — 씨앗에서 갈라진 실검색어를 모읍니다\n')

for (const [cat, seeds] of Object.entries(SEEDS)) {
  let n = 0
  for (const seed of seeds) {
    await sleep(150)
    for (const s of await suggest(seed)) { add(s, cat, seed, 1); n++ }

    // 사업자 관점 접두어를 붙여 한 번 더 — 검색 의도가 달라진다
    for (const p of PREFIXES.slice(0, 3)) {
      await sleep(150)
      for (const s of await suggest(`${p} ${seed}`)) { add(s, cat, `${p} ${seed}`, 1); n++ }
    }
  }
  console.log(`  ${cat.padEnd(4)} 씨앗 ${seeds.length}개 → ${n}건`)
}

console.log(`\n2단계 — 1단계 결과를 다시 씨앗으로 넣어 한 겹 더 넓힙니다`)

// 짧고 씨앗과 다른 것만 2차 확장 (너무 긴 건 이미 롱테일이라 더 안 갈라진다)
const round2 = [...pool.values()].filter(x => x.q.length <= 12).slice(0, 120)
for (const [i, item] of round2.entries()) {
  await sleep(150)
  for (const s of await suggest(item.q)) add(s, item.cat, item.q, 2)
  if ((i + 1) % 40 === 0) console.log(`  ${i + 1}/${round2.length} …`)
}

const all = [...pool.values()]
writeFileSync(join(OUT, '소재풀.json'), JSON.stringify(all, null, 2))
console.log(`\n수집 ${all.length}건 → out/소재풀.json`)

if (process.argv.includes('--raw')) process.exit(0)

// ─── 선별 ───────────────────────────────────────────────────
// 같은 검색어라도 누가 찾느냐가 다르다. 우리 독자는 "돈 주는 쪽"이다.
function findApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  for (const p of [join(HERE, '..', '.env'),
    join(HERE, '..', '..', 'studio', '카드뉴스', 'cardnews-white', '.env')]) {
    if (!existsSync(p)) continue
    const m = readFileSync(p, 'utf8').match(/^ANTHROPIC_API_KEY\s*=\s*(.+)$/m)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return null
}
const apiKey = findApiKey()
if (!apiKey) { console.error('\nANTHROPIC_API_KEY 없음 — 수집분만 저장했습니다.'); process.exit(0) }

const SCHEMA = {
  type: 'object',
  properties: {
    topics: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          q: { type: 'string', description: '검색어 원문 그대로' },
          cat: { type: 'string', enum: ['노무', '세무', '법률', '컴플라'] },
          intent: {
            type: 'string',
            enum: ['사업자', '근로자', '혼재'],
            description: '누가 이 말을 검색하는가',
          },
          value: {
            type: 'integer',
            description: '우리에게 얼마나 좋은 소재인가 1~5. 사업자가 찾고 우리가 답할 수 있으면 높다',
          },
          angle: { type: 'string', description: '우리가 이 소재를 어떤 각도로 쓸지 한 줄' },
        },
        required: ['q', 'cat', 'intent', 'value', 'angle'], additionalProperties: false,
      },
    },
  },
  required: ['topics'], additionalProperties: false,
}

console.log('\n3단계 — 우리 독자(사업자) 기준으로 골라냅니다')

const client = new Anthropic({ apiKey })
const picked = []
const BATCH = 120

for (let i = 0; i < all.length; i += BATCH) {
  const chunk = all.slice(i, i + BATCH)
  const res = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 16000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{
      role: 'user',
      content: `speciai.team 은 중소기업·스타트업 대표에게 법률·세무·노무 컴플라이언스를 알려주는 서비스입니다.
독자는 **직원을 고용하고 세금을 내는 쪽**입니다. 근로자나 취업준비생이 아닙니다.

아래는 네이버에서 실제로 검색되는 말들입니다. 우리가 글로 쓸 만한 것만 골라주세요.

${chunk.map(x => `- ${x.q}`).join('\n')}

# 고르는 기준

- **버릴 것**: 근로자 관점("알바 주휴수당 못받았을때"), 특정 회사명, 취업·이직,
  계산기·앱 같은 도구 자체를 찾는 말, 우리 업종과 무관한 것, 뜻이 불분명한 조각난 말
- **고를 것**: 사업자가 판단해야 하는 것, 안 지키면 과태료·불이익이 있는 것,
  절차·요건·한도처럼 답이 명확한 것
- \`intent\` 가 \`근로자\` 인 것도 **가치가 있으면 남기세요.** 사업자는 "직원이 이걸 물어오면
  어떻게 답해야 하나"를 알고 싶어 합니다. 다만 \`angle\` 에 그 관점을 적으세요.
- \`value\` 는 후하게 주지 마세요. 5는 지금 당장 써야 할 소재에만 줍니다.

버릴 것은 결과에 넣지 마세요. 고른 것만 반환하세요.`,
    }],
  })
  const got = JSON.parse(res.content.find(b => b.type === 'text').text).topics ?? []
  picked.push(...got)
  console.log(`  ${Math.min(i + BATCH, all.length)}/${all.length} → 누적 ${picked.length}건`)
}

picked.sort((a, b) => b.value - a.value || a.cat.localeCompare(b.cat))
writeFileSync(join(OUT, '소재.json'), JSON.stringify(picked, null, 2))

const byCat = {}
const byVal = {}
for (const t of picked) {
  byCat[t.cat] = (byCat[t.cat] || 0) + 1
  byVal[t.value] = (byVal[t.value] || 0) + 1
}

console.log(`\n${'─'.repeat(50)}`)
console.log(`수집 ${all.length}건 → 선별 ${picked.length}건`)
console.log(`분야  ${Object.entries(byCat).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
console.log(`점수  ${[5, 4, 3, 2, 1].filter(v => byVal[v]).map(v => `${v}점 ${byVal[v]}`).join(' · ')}`)
console.log(`\n→ out/소재.json`)
console.log(`\n5점짜리부터 study.mjs 로 경쟁도를 재고 순서를 정하세요.`)
