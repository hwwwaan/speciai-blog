// 전문가 검토 의뢰서 — posts/*.md 의 checks 를 한 장으로 굽는다.
//
//   블로그 글의 병목은 글쓰기가 아니라 «세무사·노무사가 수치를 봐주는 일» 이다.
//   그런데 검토 항목이 글마다 프론트매터에 흩어져 있어서, 검토자가 파일 네 개를
//   열어 본문에서 해당 문장을 찾아 헤매야 한다. 그러면 한 번에 안 끝난다.
//
//   그래서 항목마다 «본문의 어느 문장 이야기인지» 를 같이 붙여 한 장으로 만든다.
//   검토자는 이 파일 하나만 열고 위에서 아래로 내려가면 된다.
//
// 실행:
//   node 검토의뢰서.mjs                  # posts/ 전체
//   node 검토의뢰서.mjs 취업규칙          # 파일명에 이 말이 든 것만
//
// 결과: 검토의뢰_<연-월>.html  (단독 파일. 그대로 보내면 열린다)
//
// ※ 글이 바뀌면 다시 구우면 된다. 손으로 고치지 말 것.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const POSTS = join(HERE, 'posts')

const 걸러내기 = process.argv[2] || ''

// ─── 글 읽기 ────────────────────────────────────────────────
// 새 초고가 대체한 옛 초고는 발행하지 않으므로 검토도 받지 않는다.
// 검토자에게 안 낼 글까지 보내면 시간을 버리게 한다.
const 대체됨 = (() => {
  try {
    const L = JSON.parse(readFileSync(join(HERE, 'ledger.json'), 'utf8'))
    return new Set(L.posts.filter(p => p.status === 'superseded').map(p => p.slug))
  } catch { return new Set() }
})()

// «.발행본.md» 는 초안과 본문이 같고 이미지 경로만 다르다. 초안만 본다.
const 파일들 = readdirSync(POSTS)
  .filter(f => f.endsWith('.md') && !f.includes('발행본'))
  .filter(f => !대체됨.has(f.replace(/\.md$/, '')))
  .filter(f => !걸러내기 || f.includes(걸러내기))
  .sort()

if (!파일들.length) {
  console.error(`posts/ 에서 «${걸러내기}» 에 맞는 글을 못 찾았습니다.`)
  process.exit(1)
}

const 글목록 = 파일들.map(f => {
  const raw = readFileSync(join(POSTS, f), 'utf8')
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!m) return null
  const [, fm, body] = m

  const 한줄 = (k) => (fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) || [])[1]?.trim()
  const 목록 = (k) => {
    const b = fm.match(new RegExp(`^${k}:\\n((?:[ \\t]+- .*\\n?)+)`, 'm'))
    return b ? b[1].trim().split('\n').map(l => l.replace(/^\s*-\s*/, '').trim()) : []
  }

  // 본문에 «[확인 필요: …]» 로 비워둔 자리는 checks 에 안 적혀 있을 때가 있다.
  // 그런데 이건 독자 눈에 그대로 보이는 구멍이라 가장 급하다. 따로 긁어 맨 앞에 올린다.
  const 빈자리 = [...body.matchAll(/[`]?\[확인 필요:?\s*([^\]]*)\][`]?/g)].map(m => m[1].trim())

  return {
    파일: f,
    제목: 한줄('title') || f,
    분야: 한줄('category') || '',
    근거: 목록('sources'),
    검토: 목록('checks'),
    빈자리,
    본문: body,
  }
}).filter(Boolean)

// ─── 항목마다 본문의 어느 대목인지 찾기 ─────────────────────
//
// 검토 항목은 「제93조 위반 과태료 금액 확인」처럼 본문의 특정 문장을 가리킨다.
// 조문 번호·금액·서식 번호·날짜 같은 «눈에 띄는 표식» 을 뽑아 그게 들어간
// 문장을 되찾는다. 완벽하진 않지만 검토자가 파일을 뒤지는 것보단 낫다.
const 표식뽑기 = (t) => {
  const out = new Set()
  for (const re of [
    /제\s?\d+조(?:의\d+)?(?:\s?제\d+항)?/g,   // 제93조, 제63조의2 제2항
    /별지\s?제\d+호서식/g,
    /별표\s?\d+/g,
    /\d[\d,]*\s?만\s?원/g,                    // 500만 원
    /\d{4}[.\-]\s?\d{1,2}[.\-]\s?\d{1,2}/g,   // 2023. 5. 11.
    /\d+년\s?\d+월/g,
    /\d+일/g,
  ]) for (const m of t.match(re) || []) out.add(m.replace(/\s+/g, ''))
  return [...out]
}

// 글 끝의 「관련 글」 목록이나 목차는 본문이 아니다. 낱말이 잘 겹쳐서 자꾸 인용으로 올라오는데,
// 검토자에게 링크 목록을 보여주면 「이게 뭘 보라는 거지」가 된다. 아예 후보에서 뺀다.
const 본문아님 = (s) =>
  s.startsWith('#') ||
  s.startsWith('|') ||
  s.includes('(발행 예정)') ||
  (s.match(/\]\(/g) || []).length >= 2 ||   // 한 줄에 링크가 둘 이상이면 목록이다
  /^[-*]\s*\[/.test(s)

const 문장들 = (body) =>
  body
    .replace(/!\[[^\]]*\]\([^)]*\)(\{[^}]*\})?/g, ' ')  // 이미지 자리 제거
    .split(/(?<=[.!?습니다요])\s+|\n{2,}/)
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length > 25 && !본문아님(s))

// 표식이 없는 항목이 훨씬 많다. 「전통시장 특례에서 제외되는 소비성 서비스업의 범위 확인」
// 같은 문장에는 조문 번호도 금액도 없다. 28건 중 20건이 이랬다.
// 그래서 표식으로 못 찾으면 낱말 겹침으로 한 번 더 찾는다.
//
// 검토 항목에는 «확인·검토·여부» 같이 어느 항목에나 나오는 말이 섞여 있다.
// 그런 말로 문장을 고르면 아무 문장이나 걸리므로 먼저 걷어낸다.
const 흔한말 = new Set([
  '확인', '검토', '여부', '필요', '최종', '재확인', '보강', '점검', '수정', '기준',
  '내용', '표기', '명시', '근거', '출처', '관련', '경우', '항목', '부분', '사항',
  '적정성', '정확성', '일치', '누락', '해당', '이후', '최신', '최신화', '현행',
])
const 낱말뽑기 = (t) =>
  [...new Set((t.match(/[가-힣A-Za-z0-9]{2,}/g) || []))]
    .filter(w => !흔한말.has(w) && w.length >= 2)

// 두 가지 방식으로 찾는데 미더운 정도가 다르다. 그래서 어느 쪽으로 찾았는지 같이 돌려준다.
//   확실 — 조문 번호나 금액이 그대로 걸린 것. 그 문장이 맞다
//   짐작 — 낱말이 겹쳐서 고른 것. 대개 맞지만 가끔 엉뚱하다
// 섞어서 「본문」이라고만 달면 검토자가 틀린 인용을 믿고 넘어간다.
const 짚어주기 = (항목, body) => {
  const 문장 = 문장들(body)

  // 1차 — 조문 번호·금액·서식 번호처럼 되짚기 쉬운 표식
  const 표식 = 표식뽑기(항목)
  if (표식.length) {
    const cands = 문장.map(s => {
      const 납작 = s.replace(/\s+/g, '')
      return { s, n: 표식.filter(k => 납작.includes(k)).length }
    })
    const 최고 = Math.max(0, ...cands.map(c => c.n))
    if (최고 > 0) return { 확실: true, 문장: cands.filter(c => c.n === 최고).slice(0, 2).map(c => c.s) }
  }

  // 2차 — 낱말 겹침. 두 낱말 이상 겹쳐야 인정한다.
  // 한 낱말만 겹치면 엉뚱한 문장이 올라와서, 없느니만 못하다.
  //
  // 개수만 세면 «신고»·«변경» 같은 짧고 흔한 말이 여러 개 걸린 문장이 이긴다.
  // 긴 낱말일수록 그 항목에만 나오는 말이므로, 길이를 더해 무게를 준다.
  // (길이 3자 이상을 요구해봤더니 «게시»·«주지»·«기한» 같은 멀쩡한 두 자 낱말이 날아가
  //  오히려 못 찾는 항목이 늘었다. 그래서 무게로만 순서를 매긴다.)
  const 낱말 = 낱말뽑기(항목)
  if (낱말.length < 2) return { 확실: false, 문장: [] }
  const cands = 문장
    .map(s => {
      const 맞은것 = 낱말.filter(w => s.includes(w))
      return { s, n: 맞은것.length, 무게: 맞은것.reduce((a, w) => a + w.length, 0) }
    })
    .filter(c => c.n >= 2)
    .sort((a, b) => b.무게 - a.무게 || a.s.length - b.s.length)
  return { 확실: false, 문장: cands.slice(0, 2).map(c => c.s) }
}

// ─── 항목 분류 ──────────────────────────────────────────────
// 검토자가 「내가 판단할 것」과 「그냥 최신인지만 볼 것」을 섞어 보면 지친다.
const 갈래 = (t) => {
  if (/\[확인 필요/.test(t)) return { key: 'blank', 이름: '본문이 비어 있음', 급함: true }
  if (/판례|사건번호|선고|전원합의체/.test(t)) return { key: 'case', 이름: '판례 특정' }
  if (/실무|관행|지침|운영|완화|표현/.test(t)) return { key: 'prac', 이름: '실무 관행' }
  if (/금액|과태료|벌금|한도|요율|최저임금/.test(t)) return { key: 'money', 이름: '금액·요율', 급함: true }
  if (/시행일|적용기한|일몰|시행시기|적용시기/.test(t)) return { key: 'date', 이름: '시행일·적용기한', 급함: true }
  return { key: 'law', 이름: '조문 현행 여부' }
}

// ─── HTML ───────────────────────────────────────────────────
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

let 번호 = 0
const 통계 = {}
const 본문HTML = 글목록.map((g, gi) => {
  // 본문 빈자리를 먼저, 그 다음 checks. 이미 checks 에 같은 말이 있으면 겹쳐 싣지 않는다.
  const 겹침 = (t) => g.검토.some(c => c.includes(t.slice(0, 12)))
  const 목록전체 = [
    ...g.빈자리.filter(t => !겹침(t)).map(t => ({ 글: `[확인 필요: ${t}]`, 빈자리: true })),
    ...g.검토.map(c => ({ 글: c })),
  ]

  const 항목HTML = 목록전체.map(({ 글: c, 빈자리 }) => {
    번호++
    const k = 빈자리
      ? { key: 'blank', 이름: '본문이 비어 있음', 급함: true }
      : 갈래(c)
    통계[k.이름] = (통계[k.이름] || 0) + 1
    // 빈자리는 조문·금액 같은 표식이 없어 되찾기가 안 먹는다.
    // 대신 그 자리가 박힌 문장을 그대로 보여주는 게 검토자에게 가장 빠르다.
    const 찾은것 = 빈자리
      ? { 확실: true, 문장: 문장들(g.본문).filter(s => s.includes(c.slice(0, 20))).slice(0, 1) }
      : 짚어주기(c, g.본문)
    const 인용 = 찾은것.문장
    return `
      <li class="item${k.급함 ? ' urgent' : ''}">
        <div class="ihead">
          <span class="num">${번호}</span>
          <span class="kind k-${k.key}">${esc(k.이름)}</span>
        </div>
        <p class="ask">${esc(c)}</p>
        ${인용.length
          ? `<div class="quote${찾은것.확실 ? '' : ' guess'}"><span class="qlbl">${찾은것.확실 ? '본문' : '본문 — 짐작으로 찾았습니다'}</span>${인용.map(s => `<p>${esc(s)}</p>`).join('')}</div>`
          : `<p class="nofind">본문에서 해당 대목을 자동으로 찾지 못했습니다. 글 전체를 훑어봐 주세요.</p>`}
        <div class="answer"><span class="albl">검토 의견</span><div class="blank"></div></div>
      </li>`
  }).join('')

  return `
  <section>
    <h2><span class="pn">${gi + 1}</span>${esc(g.제목)} <em>${esc(g.분야)}</em></h2>
    <p class="meta">본문 ${g.본문.replace(/!\[[^\]]*\]\([^)]*\)(\{[^}]*\})?/g, '').length.toLocaleString()}자 · 검토 ${목록전체.length}건</p>
    <details class="src">
      <summary>글이 근거로 삼은 법령 ${g.근거.length}건</summary>
      <ul>${g.근거.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
    </details>
    <ol class="items">${항목HTML}</ol>
  </section>`
}).join('')

// toISOString() 은 UTC 라 자정~오전 9시에 구우면 어제 날짜가 박힌다.
// 사외로 나가는 문서에 하루 전 날짜가 찍히면 검토자가 낡은 자료로 본다.
const 오늘 = (d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10))(new Date())
const 급함수 = Object.entries(통계).filter(([n]) => ['본문이 비어 있음', '금액·요율', '시행일·적용기한'].includes(n))
  .reduce((a, [, v]) => a + v, 0)

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>블로그 원고 검토 의뢰 — 스페셜아이</title>
<style>
  :root {
    --ground:#F1F2EF; --surface:#FFFFFF; --sunken:#E7E9E4;
    --ink:#16201D; --ink-soft:#454E4A; --muted:#737A75;
    --line:#D6DAD4; --line-soft:#E4E7E1;
    --law:#16544C; --law-bg:#E3EDEA;
    --urg:#8C2F2A; --urg-bg:#F5E4E2;
    --shadow:0 1px 2px rgba(22,32,29,.05), 0 8px 24px -16px rgba(22,32,29,.22);
    --sans:-apple-system,BlinkMacSystemFont,"Pretendard","Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",system-ui,sans-serif;
    --mono:"SF Mono","JetBrains Mono","Menlo","Consolas",monospace;
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --ground:#121614; --surface:#1A201D; --sunken:#232A27;
      --ink:#E4E8E4; --ink-soft:#B3BAB5; --muted:#838C86;
      --line:#2E3733; --line-soft:#242C29;
      --law:#5CBCAD; --law-bg:#17322E;
      --urg:#E28C84; --urg-bg:#38211F;
      --shadow:0 1px 2px rgba(0,0,0,.3), 0 8px 24px -16px rgba(0,0,0,.7);
      color-scheme: dark;
    }
  }
  :root[data-theme="dark"] {
    --ground:#121614; --surface:#1A201D; --sunken:#232A27;
    --ink:#E4E8E4; --ink-soft:#B3BAB5; --muted:#838C86;
    --line:#2E3733; --line-soft:#242C29;
    --law:#5CBCAD; --law-bg:#17322E;
    --urg:#E28C84; --urg-bg:#38211F;
    --shadow:0 1px 2px rgba(0,0,0,.3), 0 8px 24px -16px rgba(0,0,0,.7);
    color-scheme: dark;
  }
  * { box-sizing:border-box; }
  body {
    margin:0; background:var(--ground); color:var(--ink);
    font-family:var(--sans); font-size:15.5px; line-height:1.65;
    -webkit-font-smoothing:antialiased; word-break:keep-all;
  }
  .wrap { max-width:880px; margin:0 auto; padding:0 24px 96px; }
  header { padding:56px 0 28px; border-bottom:2px solid var(--ink); }
  .kicker { font-family:var(--mono); font-size:10.5px; letter-spacing:.18em; text-transform:uppercase; color:var(--law); margin-bottom:16px; }
  h1 { font-size:clamp(25px,4vw,35px); line-height:1.2; letter-spacing:-.028em; font-weight:800; margin:0 0 14px; text-wrap:balance; }
  .lede { color:var(--ink-soft); max-width:60ch; margin:0 0 22px; font-size:16px; }
  .updated { font-family:var(--mono); font-size:11px; color:var(--muted); display:flex; gap:20px; flex-wrap:wrap; }
  .updated b { color:var(--ink-soft); font-weight:500; }

  .how { background:var(--surface); border:1px solid var(--line); border-left:3px solid var(--law);
         border-radius:3px; padding:18px 22px; margin:28px 0 0; box-shadow:var(--shadow); }
  .how h3 { margin:0 0 10px; font-size:14.5px; font-weight:700; }
  .how ol { margin:0; padding-left:20px; font-size:14.5px; color:var(--ink-soft); }
  .how li { margin-bottom:6px; }
  .how b { color:var(--ink); }

  section { padding-top:52px; }
  h2 { font-size:clamp(17px,2.3vw,21px); font-weight:750; letter-spacing:-.02em; margin:0 0 4px;
       padding-bottom:12px; border-bottom:1px solid var(--line); display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; }
  h2 em { font-style:normal; font-family:var(--mono); font-size:11px; font-weight:400; letter-spacing:.1em;
          text-transform:uppercase; color:var(--muted); }
  .pn { font-family:var(--mono); font-size:12px; font-weight:700; color:var(--law); background:var(--law-bg);
        padding:2px 8px; border-radius:2px; }
  .meta { font-family:var(--mono); font-size:11.5px; color:var(--muted); margin:12px 0 0; }

  details.src { margin:14px 0 0; font-size:13.5px; }
  details.src summary { cursor:pointer; color:var(--muted); font-family:var(--mono); font-size:11.5px;
                        letter-spacing:.04em; padding:4px 0; }
  details.src ul { margin:8px 0 0; padding-left:20px; color:var(--ink-soft); }
  details.src li { margin-bottom:4px; }

  ol.items { list-style:none; margin:22px 0 0; padding:0; display:grid; gap:14px; }
  .item { background:var(--surface); border:1px solid var(--line); border-left:3px solid var(--line);
          border-radius:3px; padding:16px 20px; box-shadow:var(--shadow); }
  .item.urgent { border-left-color:var(--urg); }
  .ihead { display:flex; align-items:center; gap:9px; margin-bottom:7px; }
  .num { font-family:var(--mono); font-size:11.5px; font-weight:700; color:var(--muted);
         min-width:22px; font-variant-numeric:tabular-nums; }
  .kind { font-family:var(--mono); font-size:9.5px; letter-spacing:.11em; text-transform:uppercase;
          padding:3px 8px; border-radius:2px; background:var(--law-bg); color:var(--law); font-weight:500; white-space:nowrap; }
  .item.urgent .kind { background:var(--urg-bg); color:var(--urg); }
  .ask { margin:0; font-size:15px; font-weight:600; color:var(--ink); max-width:66ch; }

  .quote { margin:12px 0 0; padding:11px 14px; background:var(--sunken); border-radius:2px; }
  .qlbl, .albl { font-family:var(--mono); font-size:9.5px; letter-spacing:.12em; text-transform:uppercase;
                 color:var(--muted); display:block; margin-bottom:5px; }
  .quote p { margin:0 0 7px; font-size:13.5px; color:var(--ink-soft); line-height:1.6; max-width:70ch; }
  .quote p:last-child { margin-bottom:0; }

  .quote.guess { border-left:2px solid var(--line); }
  .quote.guess .qlbl { color:var(--wip, #8E5313); }
  .nofind { margin:12px 0 0; font-size:13px; color:var(--muted); font-style:italic; }
  .answer { margin:12px 0 0; }
  .blank { border-bottom:1px dashed var(--line); height:26px; }

  footer { margin-top:64px; padding-top:22px; border-top:1px solid var(--line);
           font-size:13px; color:var(--muted); }
  footer b { color:var(--ink-soft); }

  @media print {
    body { background:#fff; font-size:10.5pt; }
    .wrap { max-width:none; padding:0 12mm 12mm; }
    section, .item { break-inside:avoid; }
    header { padding-top:0; }
    details.src { display:none; }
    .blank { height:34px; }
  }
</style>
</head>
<body>
<div class="wrap">

<header>
  <div class="kicker">Review Request · speciai.team</div>
  <h1>블로그 원고 검토 의뢰 — ${글목록.length}편, ${번호}건</h1>
  <p class="lede">
    발행 전 마지막 관문입니다. 아래 ${번호}건만 봐주시면 됩니다.
    글 전체를 읽으실 필요는 없고, 항목마다 해당하는 <b>본문 문장을 같이 붙여</b> 뒀습니다.
  </p>
  <div class="updated">
    <span>작성 <b>${오늘}</b></span>
    <span>글 <b>${글목록.length}편</b></span>
    <span>검토 <b>${번호}건</b></span>
    <span>먼저 봐야 할 것 <b>${급함수}건</b></span>
  </div>

  <div class="how">
    <h3>이렇게 봐주시면 됩니다</h3>
    <ol>
      <li><b>붉은 테두리 ${급함수}건이 먼저</b>입니다 — 금액·시행일·본문이 비어 있는 자리라 틀리면 바로 사고가 납니다.</li>
      <li>맞으면 「맞음」 한 마디면 됩니다. <b>틀린 것만 고쳐 주세요.</b></li>
      <li>판단이 갈리는 대목은 「이렇게 쓰면 위험하다」 정도만 짚어 주셔도 됩니다.</li>
      <li>인쇄해서 손으로 적으셔도 되게 빈칸을 뒀습니다.</li>
    </ol>
  </div>
</header>

${본문HTML}

<footer>
  <p>
    <b>이 글들은 아직 발행 전입니다.</b> 검토 의견을 받은 뒤 반영해서 올립니다.
    수치와 조문은 작성 시점 기준이라, 검토 시점에 달라진 것이 있으면 그것부터 알려주시면 됩니다.
  </p>
  <p>speciai.team · ${오늘} 생성 · 원고가 바뀌면 이 문서를 다시 굽습니다</p>
</footer>

</div>
</body>
</html>
`

const 연월 = 오늘.slice(0, 7)
const dest = join(HERE, `검토의뢰_${연월}.html`)
writeFileSync(dest, html)

console.log(`\n검토 의뢰서를 구웠습니다.`)
console.log(`  → ${dest}`)
console.log(`\n글 ${글목록.length}편 · 검토 ${번호}건`)
for (const [이름, n] of Object.entries(통계).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${이름.padEnd(12)} ${String(n).padStart(2)}건`)
}
console.log(`\n먼저 봐야 할 것 ${급함수}건 (금액·시행일·빈자리)`)
console.log(`\n그대로 보내면 열립니다. 바깥 자원을 안 씁니다.`)
