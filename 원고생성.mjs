// 커뮤니티 원고 생성기 — 「이번 달, 당신 업종이 챙길 것」
//
//   제휴 커뮤니티 채널에 실을 짧은 원고를 뽑는다. 블로그 글(generate.mjs)과는
//   재료만 공유하고 결과물이 다르다 — 저쪽은 검색용 상록수 2,800자,
//   이쪽은 이번 달만 유효한 1,400~1,800자다 (표 없는 원고는 1,800~2,200자).
//
//   같은 글을 두 곳에 올리면 네이버가 중복 문서로 봐서 우리 블로그가 밀린다.
//   그래서 본문을 옮기지 않고 맺음에 블로그 링크만 건다.
//
// 실행:
//   node 원고생성.mjs --목록                    # 프로필 목록
//   node 원고생성.mjs c-마케팅커머스 --소재만     # 소재만 확인 (API 안 씀, 공짜)
//   node 원고생성.mjs c-마케팅커머스             # 원고 생성
//   node 원고생성.mjs c-마케팅커머스 --건수 7     # 지원사업 건수 조정 (기본 5)
//
// 결과: ../community/원고/<날짜>-<프로필>.md
//
// ※ 마감일과 금액은 사람이 확인한다. 한 건이 틀리면 나머지도 안 믿는다.

import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadAll } from '../../_공용/gov-support/lib/store.js'
import { scoreOne } from '../../_공용/gov-support/lib/match.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const COMMUNITY = join(HERE, '..', 'community')
const OUT = join(COMMUNITY, '원고')

// ─── 프로필 ─────────────────────────────────────────────────
// gov-support 의 profiles.json 이 아니라 community 쪽에 따로 둔다.
// 거기에 넣으면 notify.mjs 가 종류를 안 가리고 알려서 디스코드가 뒤덮인다.
const PROFILES_PATH = join(COMMUNITY, '원고프로필.json')
if (!existsSync(PROFILES_PATH)) {
  console.error(`원고프로필.json 이 없습니다 → ${PROFILES_PATH}`)
  process.exit(1)
}
const profiles = JSON.parse(readFileSync(PROFILES_PATH, 'utf8')).profiles

const argv = process.argv.slice(2)

if (argv.includes('--목록') || argv.includes('--list') || !argv.length) {
  console.log('\n원고 프로필\n')
  for (const p of profiles) {
    console.log(`  ${p.id.padEnd(16)} ${p.label}   [지원사업 ${p.지원사업 || '미상'}]`)
    console.log(`  ${' '.repeat(16)} 덮는 곳: ${(p.덮는곳 || []).join(' · ')}\n`)
  }
  console.log('  지원사업 «없음·부족» 인 프로필은 표를 빼고 규제 이야기로만 씁니다.')
  console.log('사용:  node 원고생성.mjs c-마케팅커머스 --소재만\n')
  process.exit(0)
}

const profileId = argv.find(a => !a.startsWith('--'))
const profile = profiles.find(p => p.id === profileId)
if (!profile) {
  console.error(`«${profileId}» 프로필이 없습니다. --목록 으로 확인하세요.`)
  process.exit(1)
}

const 소재만 = argv.includes('--소재만')
const nIdx = argv.indexOf('--건수')
const 건수 = nIdx >= 0 ? Number(argv[nIdx + 1]) || 5 : 5

// 원고를 쓰는 날과 독자가 읽는 날이 다르다. 월말에 만들어 다음 달에 실리므로
// 마감이 코앞인 공고를 넣으면 읽는 시점엔 이미 닫혀 있다.
const mIdx = argv.indexOf('--최소잔여')
const 최소잔여 = mIdx >= 0 ? Number(argv[mIdx + 1]) || 14 : 14

// ─── 소재 고르기 ────────────────────────────────────────────
// 원장은 append 전용이라 행이 공고 수보다 훨씬 많다. loadAll 이 id 로 최신만 남긴다.
const today = new Date()

// toISOString() 은 UTC 라 한국에서 자정~오전 9시에 돌리면 날짜가 하루 뒤로 간다.
// 파일 이름이 어제 것과 겹치고 원고에 「8월 8일 기준」이라고 적히는데 실제로는 9일이다.
const 날짜문자 = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10)

const all = [...loadAll().values()]

const 마감전 = all.filter(
  i => i.alwaysOpen || (i.applyEnd && new Date(i.applyEnd) >= today),
)

// 커뮤니티 회원은 전국에 흩어져 있다. [충북] 공고를 실으면 대부분에게 무용지물이라
// 전국 단위를 먼저 채우고, 모자랄 때만 수도권으로 보충한다.
// 지역은 두 군데에 나타난다 — region 필드, 그리고 제목의 «[충북]» 표기.
// 대괄호 없이 제목에 지역명만 박힌 공고도 56건 있어서 이것까지 걸러야 한다.
const 시도 = '서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주'
const 지역표기 = t => new RegExp(`^\\s*\\[[^\\]]+\\]|(${시도})`).test(t || '')
const 전국 = 마감전.filter(i => !지역표기(i.title) && !(i.region && i.region !== '전국'))
const 수도권 = 마감전.filter(i => ['서울', '경기', '인천'].includes(i.region))

// 제목·지원분야에 키워드가 실제로 걸렸는지. 본문에 스친 것은 안 친다.
//
// 겪은 일: 「장애인 창업사업화」 공고가 프로필 네 개 전부의 상위 5건에 올라왔다.
// 본문의 «온라인 창업교육» 한 구절에 «온라인»·«창업» 이 스친 것이다.
// 알림(notify)은 놓치면 손해라 느슨해도 되지만, 원고는 남의 채널에 나가므로
// 한 건이라도 엉뚱하면 그 뒤를 안 믿는다. 여기서는 정확도를 택한다.
const 제목히트 = (item, p) => {
  const strong = [item.title, item.category].filter(Boolean).join(' ')
  return (p.keywords || []).some(w => strong.includes(w))
}

// 커뮤니티마다 다른 원고를 준다는 게 이 기획의 전제다. 같은 공고가 여러 프로필에
// 겹쳐 실리면 그 전제가 무너지므로, 한 공고는 점수가 가장 높은 프로필 하나에만 준다.
// (--겹침허용 으로 끌 수 있다 — 프로필 하나만 발송할 때는 굳이 양보할 이유가 없다)
const 겹침허용 = argv.includes('--겹침허용')
const 임자 = (item) => {
  let best = null
  for (const p of profiles) {
    if (!제목히트(item, p)) continue
    const r = scoreOne(item, p, { today })
    if (r.excluded || r.score < 45) continue
    if (!best || r.score > best.score) best = { id: p.id, score: r.score }
  }
  return best?.id
}

// 45일 안에 닫히되 최소잔여일은 남은 것. 상시 공고는 「이번 달」이라는 전제와 안 맞는다.
const 임박 = (pool) =>
  pool
    .filter(i => 제목히트(i, profile))
    .filter(i => 겹침허용 || 임자(i) === profile.id)
    .map(i => ({ i, r: scoreOne(i, profile, { today }) }))
    .filter(x => !x.r.excluded && x.r.score >= 45)
    .filter(x => {
      if (x.i.alwaysOpen || !x.i.applyEnd) return false
      const d = (new Date(x.i.applyEnd) - today) / 864e5
      return d >= 최소잔여 && d <= 45
    })
    .sort((a, b) => new Date(a.i.applyEnd) - new Date(b.i.applyEnd) || b.r.score - a.r.score)

// 같은 사업이 제목만 같고 여러 건으로 들어오는 일이 있다. 제목으로 한 번 더 거른다.
const 중복제거 = (rows) => [...new Map(rows.map(x => [x.i.title, x])).values()]

const 전국임박 = 중복제거(임박(전국))
const 수도권임박 = 중복제거(임박(수도권)).filter(
  x => !전국임박.some(y => y.i.title === x.i.title),
)
const 소재 = [...전국임박, ...수도권임박].slice(0, 건수)

console.log(`\n프로필: ${profile.label} (${profile.id})`)
console.log(`덮는 곳: ${(profile.덮는곳 || []).join(' · ')}`)
console.log(
  `원장 ${all.length.toLocaleString()}건 · 마감 전 ${마감전.length.toLocaleString()}건` +
    ` → 전국 임박 ${전국임박.length} · 수도권 임박 ${수도권임박.length}`,
)
// 원장이 오래됐으면 소재가 아무리 나와도 낡은 것이다. 먼저 알린다.
const 최신수집 = all.map(i => i.lastSeen).filter(Boolean).sort().pop()
if (최신수집) {
  const 며칠 = Math.floor((today - new Date(최신수집)) / 864e5)
  if (며칠 >= 2) {
    console.log(
      `\n⚠ 원장이 ${며칠}일째 그대로입니다 (마지막 수집 ${최신수집.slice(0, 10)}).` +
        `\n   먼저 수집하세요 →  cd ../../_공용/gov-support && node collect.mjs`,
    )
  }
}

console.log(`\n고른 소재 ${소재.length}건 (요청 ${건수} · 마감까지 ${최소잔여}~45일)`)

// 소재가 없다고 원고를 못 쓰는 건 아니다.
//
// 원장을 훑어보면 정부 지원사업은 제조·수출·판로·창업에 쏠려 있다. 살아있는 공고
// 239건의 제목에 «프리랜서»·«1인»·«재택»·«SaaS»·«개발자» 는 한 건도 없었다.
// 1인기업이나 개발자 커뮤니티에 줄 지원사업이 애초에 없는 것이지, 키워드가
// 좁아서가 아니다. 그런 프로필은 표를 빼고 규제 이야기만으로 간다 —
// 없는 표를 억지로 채우면 「우리 얘기가 아닌 것」 이 실린다.
//
// 한 줄짜리 표는 없느니만 못하다. 「이번 달 챙길 지원사업」이라고 걸어놓고 한 건만
// 있으면 독자는 우리가 성의 없다고 읽는다. 세 건이 안 되면 아예 안 넣는다.
const 표최소 = 3
const 표없이 = 소재.length < 표최소
if (표없이) {
  const 예상된것 = ['없음', '부족'].includes(profile.지원사업)
  console.log(
    `\n${예상된것 ? '지원사업 표는 넣지 않습니다' : '⚠ 소재가 표를 채우지 못합니다'}` +
      ` — ${소재.length}건뿐입니다 (${표최소}건 미만이면 표를 뺍니다).` +
      `\n   «${profile.label}» 은 원장에 실을 공고가 ${예상된것 ? '원래 거의 없습니다' : '이번 달엔 없습니다'}.` +
      `\n   규제 이야기만으로 원고를 씁니다 (규제 3건 · 표 없음).`,
  )
  if (!예상된것) {
    console.log(
      '   지원사업이 나와야 하는 프로필입니다. 아래를 확인하세요.\n' +
        '     · 원장이 낡았나  →  cd ../../_공용/gov-support && node collect.mjs\n' +
        `     · 이 달만 비었나  →  --최소잔여 7 로 낮춰보세요\n` +
        '     · 계속 그렇다면  →  원고프로필.json 의 keywords 를 넓히세요',
    )
  }
}

// 분량 기준이 두 벌인 이유 — 표는 자리를 많이 먹지만 글자 수는 적다.
// 표를 빼면 그 자리를 규제 이야기 한 건이 더 메우므로 자연히 길어진다.
// 같은 잣대를 대면 표 없는 원고가 매번 «너무 김» 경고를 달고 나온다.
const 분량 = 표없이
  ? { 목표: '1,800~2,200자', 상한: 2600 }
  : { 목표: '1,400~1,800자', 상한: 2200 }

const 남은날 = it => Math.round((new Date(it.applyEnd) - today) / 864e5)
for (const { i, r } of 소재) {
  console.log(`  D-${String(남은날(i)).padStart(2)} · ${r.score}점 · ${String(i.title).slice(0, 54)}`)
}

if (!표없이 && 소재.length < 건수) {
  console.log(`\n⚠ ${건수}건을 채우지 못했습니다. --건수 ${소재.length} 로 쓰거나 keywords 를 넓히세요.`)
}

const 소재표 = 소재
  .map(({ i }) =>
    [
      `- 제목: ${i.title}`,
      `  기관: ${i.agency || '미상'}${i.execAgency ? ` (수행 ${i.execAgency})` : ''}`,
      `  분야: ${i.category || '미상'} · 지역: ${i.region || '전국'}`,
      `  대상: ${(i.target || '미상').slice(0, 200)}`,
      `  개요: ${(i.summary || '').slice(0, 400)}`,
      `  마감: ${i.applyEnd} (D-${남은날(i)})`,
      `  신청: ${i.url || '미상'}`,
    ].join('\n'),
  )
  .join('\n\n')

if (소재만) {
  console.log(`\n${'─'.repeat(50)}\n${소재표}\n`)
  console.log('원고를 뽑으려면 --소재만 을 빼고 다시 실행하세요.')
  process.exit(0)
}

// ─── API 키 ─────────────────────────────────────────────────
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
ANTHROPIC_API_KEY 를 못 찾았습니다.

  export ANTHROPIC_API_KEY=sk-ant-...        (셸)
  echo 'ANTHROPIC_API_KEY=sk-ant-...' > ${join(HERE, '.env')}
`)
  process.exit(1)
}

const client = new Anthropic({ apiKey })

// ─── 참고자료 ───────────────────────────────────────────────
const read = p => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const 서술규칙 = read(join(HERE, 'research', '글쓰기-규칙.md'))
const 톤규칙 = read(join(HERE, '..', '..', '_공용', 'mailer', 'brief_community.txt'))

// ─── 프롬프트 ───────────────────────────────────────────────
const SYSTEM = `당신은 speciai.team 의 콘텐츠 담당자입니다.

speciai.team 은 중소기업·스타트업을 위한 AI 법률·세무·노무 컴플라이언스 어드바이저리입니다.

지금 쓰는 글은 **블로그 글이 아닙니다.** 제휴 커뮤니티의 채널(뉴스레터·미디어·단톡방)에
실릴 원고입니다. 우리 채널이 아니라 남의 채널에 손님으로 들어갑니다.

# 이 원고의 성격

- 독자: ${profile.label} 성격의 커뮤니티 회원. 직원 5~50명 회사의 대표나 실무자입니다
- 수명: **이번 달만 유효합니다.** 마감이 지나면 버려지는 글입니다
- 분량: 본문 **${분량.목표}.** 블로그 글의 절반입니다. 늘리지 마세요.
  ${표없이
    ? '표가 없어 글이 전부입니다. 규제 세 건에 고르게 나눠 쓰세요'
    : '표가 분량의 상당 부분을 먹으므로 **글로 쓰는 부분을 짧게** 가져가야 이 범위에 들어옵니다'}
- 목적: 이 커뮤니티와 계속 거래하는 것. 이번 한 번 팔고 끝내는 게 아닙니다

# 절대 하지 말 것

- **우리 서비스를 팔지 마세요.** 홍보로 읽히는 순간 다음 달 원고를 안 받습니다.
  맺음의 주최 표기 한 줄이면 충분합니다. 무료 진단 권유 같은 CTA 를 넣지 마세요
- **변호사·세무사·노무사 개인 이름이나 사무소명을 쓰지 마세요.** 변호사법 문제가 됩니다
- **"법률 자문"이라고 하지 마세요.** 제공물은 일반적인 규제·정책 정보입니다
- 이모지·느낌표·과장 표현을 쓰지 마세요

# 정확성 — 여기서 관계가 끝날 수 있습니다

매체는 오보에 민감합니다. **마감일이나 금액 한 건이 틀리면 나머지도 안 믿습니다.**

- 아래 「소재」의 마감일·기관명·신청 주소는 **그대로 옮기세요.** 바꾸거나 보태지 마세요
- 소재에 없는 금액(지원 한도 등)은 **웹 검색으로 확인한 것만** 쓰세요.
  확인 못 했으면 쓰지 말고 비우세요
- 규제 부분은 **웹 검색으로 현행 기준을 확인하고** 조번호까지 밝히세요
  (예: 근로기준법 제60조 제1항)
- 확인 못 한 것은 \`[확인 필요: ~]\` 로 남기고 프론트매터 checks 에도 적으세요

# 문장 — 블로그 규칙 중 서술 부분만 따릅니다

${서술규칙.slice(0, 4000)}

# 메일 톤 규칙 (같은 상대에게 나가므로 톤을 맞춥니다)

${톤규칙}

# 출력 형식 — 이 골격 그대로

앞에 설명을 붙이지 말고, 전체를 코드블록으로 감싸지도 마세요.

\`\`\`
---
title: 제목 (25~35자)
profile: ${profile.id}
month: YYYY-MM
deadlines: 본문에 쓴 마감일을 빠른 순으로 나열
sources:
  - 규제 부분에서 확인한 법령 (조번호까지)
checks:
  - 발행 전에 사람이 확인해야 할 항목 (마감일·금액은 반드시 포함)
---

(도입 문단부터 본문 시작)
\`\`\`

본문 구성은 아래 순서를 지킵니다.

1. **도입** (2~3줄) — 이 업종에 이번 달 걸리는 것 한 문장
${표없이
  ? `2. **## 1. 이번 달 챙길 규제** — 의무 **3건**. 안 지키면 얼마인지까지.
   표가 없는 대신 여기를 두껍게 씁니다. 세 건 합쳐 900자 안쪽입니다
3. **## 2. 우리 회사가 해당되나** (3줄) — 판별 기준 3개를 목록으로
   **지원사업 표는 넣지 마세요.** 이번 달 이 업종에 맞는 공고가 없습니다.
   억지로 채우면 독자가 «내 얘기가 아니네» 하고 다음 달 원고를 안 엽니다`
  : `2. **## 1. 이번 달 챙길 규제** — 의무 2건. 안 지키면 얼마인지까지.
   **두 건을 합쳐 500자 안쪽입니다.** 조문을 나열하지 말고 «무엇을 해야 하나» 로 씁니다
3. **## 2. 마감이 가까운 지원사업** — 아래 소재를 **마크다운 표**로.
   열은 \`사업명 | 대상 | 마감 | 신청\` 입니다. 표 아래에 한 줄씩 부연하지 마세요
4. **## 3. 우리 회사가 해당되나** (3줄) — 판별 기준 3개를 목록으로`}
5. **맺음** (2줄) — 기준일 명시 + 주최 표기 한 줄

이미지 자리는 \`![카드뉴스: 무엇을 보여줄지]()\` 로 **3~5개만** 넣으세요.
블로그처럼 20개를 넣지 마세요.

주최 표기는 이 문장을 씁니다:
> 이 글은 speciai.team 이 정리했습니다. 일반적인 규제·정책 정보이며 개별 사안에 대한 법률 자문은 아닙니다.`

const userMsg = `이번 달 원고를 써주세요.

- 프로필: **${profile.label}**
- 이 원고가 나갈 커뮤니티: ${(profile.덮는곳 || []).join(' · ')}
- 오늘: ${날짜문자(today)}

${표없이
  ? `## 소재 — 지원사업 표는 없습니다

이번 달 이 업종에 맞는 지원사업 공고가 원장에 없습니다.
**표를 지어내지 마세요.** 규제 이야기 3건으로만 채웁니다.

## 지금 할 일

1. 웹 검색으로 **${profile.label} 에게 이번 달 걸리는 규제 의무 3건**을 찾으세요.
   2026년 기준인지, 조번호가 맞는지 확인하세요.
2. 규격에 맞게 원고를 쓰세요. 본문 ${분량.목표} 입니다.`
  : `## 소재 — 지원사업 ${소재.length}건 (원장에서 고른 것, 마감 임박순)

${소재표}

## 지금 할 일

1. 웹 검색으로 **${profile.label} 업종에 이번 달 걸리는 규제 의무 2건**을 찾으세요.
   2026년 기준인지, 조번호가 맞는지 확인하세요.
2. 위 소재를 표로 정리하세요. **마감일과 신청 주소는 그대로 옮기세요.**
3. 규격에 맞게 원고를 쓰세요. 본문 ${분량.목표} 입니다.`}

바로 시작하세요.`

// ─── 생성 ───────────────────────────────────────────────────
console.log(`\n웹 검색으로 규제 기준 확인 중…\n`)

const messages = [{ role: 'user', content: userMsg }]
let full = ''

for (let round = 0; round < 5; round++) {
  const stream = client.messages.stream({
    model: 'claude-opus-5',
    max_tokens: 16000,
    output_config: { effort: 'high' },
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }],
    messages,
  })

  stream.on('text', t => process.stdout.write(t))

  const msg = await stream.finalMessage()

  if (msg.stop_reason === 'refusal') {
    console.error('\n\n요청이 거부됐습니다. 프로필을 다시 잡아주세요.')
    process.exit(1)
  }

  full = msg.content.filter(b => b.type === 'text').map(b => b.text).join('')

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
  const fenced = t.match(/```(?:markdown|md)?\s*\n([\s\S]*?)\n```/)
  if (fenced && fenced[1].trimStart().startsWith('---')) t = fenced[1]
  const fm = t.indexOf('\n---\n')
  if (!t.startsWith('---') && fm > -1) t = t.slice(fm + 1)
  t = 프론트매터닫기(t.trim())
  return t + '\n'
}

// 여는 «---» 만 쓰고 닫는 «---» 를 빠뜨리는 일이 있다. 두 벌 중 한 벌에서 났다.
// 그러면 프론트매터 전체가 본문으로 읽혀 발행 도구가 제목을 못 찾는다.
// 지시를 더 세게 쓰는 것보다 여기서 메우는 편이 확실하다.
function 프론트매터닫기(t) {
  if (!t.startsWith('---\n')) return t
  if (/^---\n[\s\S]*?\n---\n/.test(t)) return t

  const lines = t.split('\n')
  // 1행은 여는 «---». 그 뒤로 「key:」 도 아니고 들여쓴 줄도 아닌 첫 줄이 본문 시작이다.
  const 본문시작 = lines.findIndex(
    (l, i) => i > 0 && l.trim() && !/^\s/.test(l) && !/^[\w가-힣_-]+\s*:/.test(l),
  )
  if (본문시작 < 1) return t // 어디서 끊을지 모르겠으면 손대지 않는다

  lines.splice(본문시작, 0, '---', '')
  return lines.join('\n').replace(/\n{3,}/g, '\n\n')
}

full = tidy(full)

// ─── 저장 ───────────────────────────────────────────────────
mkdirSync(OUT, { recursive: true })
const 날짜 = 날짜문자(today)
const dest = join(OUT, `${날짜}-${profile.id}.md`)
writeFileSync(dest, full)

const hasFm = /^---\n[\s\S]*?\n---\n/.test(full)
const body = full.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '')
const chars = body.length
const images = (full.match(/!\[/g) || []).length
const checks = (full.match(/\[확인 필요[^\]]*\]/g) || []).length

console.log(`\n\n${'─'.repeat(50)}`)
console.log(`저장 → ${dest}`)
console.log(`본문 ${chars.toLocaleString()}자 · 이미지 자리 ${images}`)
console.log(`목표   ${분량.목표} · 이미지 3~5${표없이 ? '  (표 없는 원고 기준)' : ''}`)

if (!hasFm) console.log(`\n⚠ 프론트매터가 없습니다. 다시 생성하세요.`)
if (chars > 분량.상한) console.log(`\n⚠ 너무 깁니다(${분량.상한}자 넘음). 커뮤니티 채널은 짧은 글을 받습니다.`)
if (checks) console.log(`\n⚠ 확인이 필요한 항목 ${checks}건이 본문에 표시돼 있습니다.`)

// 원고에 적힌 마감일이 소재와 어긋나면 여기서 잡는다. 틀린 마감일 한 건이 관계를 끝낸다.
const 원고날짜 = new Set(full.match(/\d{4}-\d{2}-\d{2}/g) || [])
const 소재날짜 = new Set(소재.map(x => x.i.applyEnd))
const 낯선날짜 = [...원고날짜].filter(d => !소재날짜.has(d) && d !== 날짜)
// 표가 없는 원고에는 대조할 소재가 없다. 여기서 날짜는 대개 법정 기한이나 시행일이라
// (간이지급명세서 8/31, AI 기본법 시행 1/22 …) 전부 의심하면 경고가 무뎌진다.
// 진짜 위험은 「없는 표를 지어낸 것」이므로, 표가 실제로 있을 때만 짚는다.
const 표흔적 = /^\|.*\|.*\|/m.test(full)
if (표없이 && 표흔적) {
  console.log(
    `\n⚠ 표를 빼기로 한 원고인데 본문에 표가 있습니다.` +
      `\n   지원사업을 지어냈는지 확인하세요 (날짜: ${낯선날짜.join(', ') || '없음'}).`,
  )
} else if (!표없이 && 낯선날짜.length) {
  console.log(
    `\n⚠ 소재에 없는 날짜가 본문에 있습니다: ${낯선날짜.join(', ')}` +
      `\n   지어낸 마감일인지 확인하세요.`,
  )
} else if (표없이 && 낯선날짜.length) {
  console.log(
    `\n· 본문의 날짜 ${낯선날짜.join(', ')} 는 법정 기한·시행일로 보입니다. 사람이 한 번 보세요.`,
  )
}

console.log(`\n초고입니다. 보내기 전에 마감일과 금액을 사람이 확인하세요.`)
