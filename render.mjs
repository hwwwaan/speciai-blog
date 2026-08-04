// speciai.team 네이버 블로그 이미지 세트 렌더러
// 실행: node render.mjs           (전체)
//       node render.mjs title     (이름에 title 이 들어간 것만)
import puppeteer from 'puppeteer'
import { findChrome } from '../studio/카드뉴스/cardnews-white/src/chrome.mjs'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'out')
mkdirSync(OUT, { recursive: true })

// ─── 브랜드 토큰 ────────────────────────────────────────────
const C = {
  ink: '#0A0A0A',        // 순흑 배경
  ink2: '#14100E',       // 살짝 따뜻한 흑
  warm: '#1E1712',       // 카드 배경
  brand: '#D85A30',      // 메인 오렌지
  brand2: '#CB603D',     // 보조 오렌지
  paper: '#F0F0F0',      // 흰
  mute: '#9a9a96',       // 회색 텍스트
}

const FONT = `'Pretendard','Apple SD Gothic Neo',sans-serif`

// 공통 스타일 — 모든 템플릿이 상속
const base = `
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:${FONT};-webkit-font-smoothing:antialiased}
  .grid{position:absolute;inset:0;
    background-image:linear-gradient(${C.brand}0F 1px,transparent 1px),
                     linear-gradient(90deg,${C.brand}0F 1px,transparent 1px);
    background-size:48px 48px}
  .glow{position:absolute;border-radius:50%;filter:blur(90px);opacity:.45}
`

// 워드마크 — 여러 템플릿에서 재사용
const wordmark = (size = 44) => `
  <div style="display:flex;align-items:center;gap:${size * 0.26}px">
    <div style="width:${size}px;height:${size}px;border-radius:${size * 0.28}px;
      background:linear-gradient(135deg,${C.brand},${C.brand2});
      display:flex;align-items:center;justify-content:center;
      font-size:${size * 0.56}px;font-weight:800;color:#fff;letter-spacing:-.02em">S</div>
    <div style="font-size:${size * 0.72}px;font-weight:800;color:${C.paper};letter-spacing:-.03em">
      speciai<span style="color:${C.brand}">.team</span></div>
  </div>`

// ─── 템플릿 정의 ────────────────────────────────────────────
const specs = [

  // 1. 블로그 타이틀 (기본 폭)
  {
    name: '01_타이틀_966x300', w: 966, h: 300,
    html: `<div style="width:966px;height:300px;position:relative;overflow:hidden;background:${C.ink}">
      <div class="grid"></div>
      <div class="glow" style="width:420px;height:420px;background:${C.brand};right:-120px;top:-160px"></div>
      <div style="position:relative;height:100%;display:flex;flex-direction:column;justify-content:center;padding:0 64px">
        ${wordmark(52)}
        <div style="margin-top:22px;font-size:31px;font-weight:700;color:${C.paper};letter-spacing:-.035em;line-height:1.35">
          중소기업·스타트업이 놓치는 <span style="color:${C.brand}">법률·세무·노무</span></div>
        <div style="margin-top:12px;font-size:17px;color:${C.mute};letter-spacing:-.02em">
          AI 어드바이저리가 규정 리스크를 먼저 짚어드립니다</div>
        <div style="position:absolute;right:64px;bottom:38px;display:flex;gap:8px">
          ${['법률', '세무', '노무', '컴플라이언스'].map(t => `
            <span style="padding:8px 15px;border:1px solid ${C.brand}55;border-radius:999px;
              font-size:13px;font-weight:600;color:${C.brand};letter-spacing:-.01em">${t}</span>`).join('')}
        </div>
      </div></div>`
  },

  // 2. 블로그 타이틀 (와이드) — 콘텐츠는 중앙 966 안에, 양옆은 배경만 연장
  {
    name: '02_타이틀_와이드_1920x300', w: 1920, h: 300,
    html: `<div style="width:1920px;height:300px;position:relative;overflow:hidden;background:${C.ink}">
      <div class="grid"></div>
      <div class="glow" style="width:640px;height:640px;background:${C.brand};right:180px;top:-260px"></div>
      <div class="glow" style="width:420px;height:420px;background:${C.brand2};left:120px;bottom:-280px;opacity:.25"></div>
      <div style="position:relative;width:966px;margin:0 auto;height:100%;
        display:flex;flex-direction:column;justify-content:center">
        ${wordmark(52)}
        <div style="margin-top:22px;font-size:31px;font-weight:700;color:${C.paper};letter-spacing:-.035em;line-height:1.35">
          중소기업·스타트업이 놓치는 <span style="color:${C.brand}">법률·세무·노무</span></div>
        <div style="margin-top:12px;font-size:17px;color:${C.mute};letter-spacing:-.02em">
          AI 어드바이저리가 규정 리스크를 먼저 짚어드립니다</div>
        <div style="position:absolute;right:0;bottom:38px;display:flex;gap:8px">
          ${['법률', '세무', '노무', '컴플라이언스'].map(t => `
            <span style="padding:8px 15px;border:1px solid ${C.brand}55;border-radius:999px;
              font-size:13px;font-weight:600;color:${C.brand}">${t}</span>`).join('')}
        </div>
      </div></div>`
  },

  // 3. 프로필 이미지
  {
    name: '03_프로필_161x161', w: 161, h: 161,
    html: `<div style="width:161px;height:161px;position:relative;overflow:hidden;
      background:linear-gradient(140deg,${C.brand},${C.brand2} 60%,#A8452170);
      display:flex;align-items:center;justify-content:center">
      <div style="position:absolute;inset:0;
        background-image:linear-gradient(#ffffff14 1px,transparent 1px),linear-gradient(90deg,#ffffff14 1px,transparent 1px);
        background-size:20px 20px"></div>
      <div style="position:relative;text-align:center">
        <div style="font-size:66px;font-weight:800;color:#fff;letter-spacing:-.04em;line-height:1">S</div>
        <div style="margin-top:4px;font-size:12px;font-weight:700;color:#ffffffdd;letter-spacing:.06em">SPECIAI</div>
      </div></div>`
  },

  // 4~6. 위젯 배너 (170px 폭 고정)
  ...[
    { key: '04_위젯_무료진단', label: '무료 컴플라이언스 진단', sub: '3분이면 끝납니다', fill: true },
    { key: '05_위젯_서비스안내', label: '서비스 안내', sub: '법률 · 세무 · 노무', fill: false },
    { key: '06_위젯_상담문의', label: '1:1 상담 문의', sub: '평일 10–18시', fill: false },
  ].map(w => ({
    name: `${w.key}_170x74`, w: 170, h: 74,
    html: `<div style="width:170px;height:74px;border-radius:12px;overflow:hidden;position:relative;
      background:${w.fill ? `linear-gradient(135deg,${C.brand},${C.brand2})` : C.warm};
      border:1px solid ${w.fill ? 'transparent' : C.brand + '44'};
      display:flex;flex-direction:column;justify-content:center;padding:0 14px">
      <div style="font-size:13px;font-weight:700;letter-spacing:-.03em;line-height:1.3;
        color:${w.fill ? '#fff' : C.paper}">${w.label}</div>
      <div style="margin-top:4px;font-size:10.5px;letter-spacing:-.02em;
        color:${w.fill ? '#ffffffcc' : C.mute}">${w.sub}</div>
      <div style="position:absolute;right:12px;top:50%;transform:translateY(-50%);
        font-size:15px;color:${w.fill ? '#ffffffcc' : C.brand}">›</div>
    </div>`
  })),

  // 7. 모바일 앱 커버
  {
    name: '07_모바일커버_1080x1300', w: 1080, h: 1300,
    html: `<div style="width:1080px;height:1300px;position:relative;overflow:hidden;background:${C.ink}">
      <div class="grid" style="background-size:72px 72px"></div>
      <div class="glow" style="width:760px;height:760px;background:${C.brand};right:-220px;top:-240px"></div>
      <div class="glow" style="width:560px;height:560px;background:${C.brand2};left:-200px;bottom:-180px;opacity:.28"></div>
      <div style="position:relative;height:100%;display:flex;flex-direction:column;
        justify-content:center;padding:0 88px">
        ${wordmark(88)}
        <div style="margin-top:56px;font-size:74px;font-weight:800;color:${C.paper};
          letter-spacing:-.045em;line-height:1.28">
          몰라서 낸 과태료는<br/>돌려받지 못합니다</div>
        <div style="margin-top:32px;font-size:30px;color:${C.mute};letter-spacing:-.025em;line-height:1.6">
          중소기업·스타트업을 위한<br/>AI 법률·세무·노무 컴플라이언스</div>
        <div style="margin-top:64px;display:flex;flex-wrap:wrap;gap:14px">
          ${['근로계약', '주휴수당', '개인정보', '세무조정', '표준약관'].map(t => `
            <span style="padding:16px 28px;border:1.5px solid ${C.brand}66;border-radius:999px;
              font-size:26px;font-weight:600;color:${C.brand}">${t}</span>`).join('')}
        </div>
      </div></div>`
  },

  // 8. 포스팅 대표 썸네일 (제목만 갈아끼우면 되는 템플릿)
  {
    name: '08_썸네일템플릿_1300x885', w: 1300, h: 885,
    html: `<div style="width:1300px;height:885px;position:relative;overflow:hidden;background:${C.ink}">
      <div class="grid" style="background-size:64px 64px"></div>
      <div class="glow" style="width:720px;height:720px;background:${C.brand};right:-180px;bottom:-280px"></div>
      <div style="position:relative;height:100%;display:flex;flex-direction:column;
        justify-content:space-between;padding:76px 84px">
        <div>
          <span style="display:inline-block;padding:12px 24px;border-radius:999px;
            background:${C.brand};font-size:24px;font-weight:700;color:#fff;letter-spacing:-.02em">노무</span>
          <div style="margin-top:40px;font-size:84px;font-weight:800;color:${C.paper};
            letter-spacing:-.045em;line-height:1.24">
            5인 미만 사업장도<br/>연차를 줘야 할까요?</div>
          <div style="margin-top:28px;font-size:32px;color:${C.mute};letter-spacing:-.025em">
            근로기준법 적용 범위, 헷갈리는 부분만 정리했습니다</div>
        </div>
        ${wordmark(52)}
      </div></div>`
  },

  // 9. 스킨 배경 이미지 — 글 영역 뒤에 깔리므로 의도적으로 은은하게
  {
    name: '09_배경_1920x1080', w: 1920, h: 1080,
    html: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;
      background:radial-gradient(1200px 800px at 50% -10%, ${C.ink2}, ${C.ink} 62%)">
      <div style="position:absolute;inset:0;
        background-image:linear-gradient(${C.brand}0A 1px,transparent 1px),
                         linear-gradient(90deg,${C.brand}0A 1px,transparent 1px);
        background-size:60px 60px"></div>
      <div class="glow" style="width:900px;height:900px;background:${C.brand};
        left:-320px;top:-300px;opacity:.13"></div>
      <div class="glow" style="width:760px;height:760px;background:${C.brand2};
        right:-280px;bottom:-320px;opacity:.11"></div>
    </div>`
  },

  // 10. 배경 타일 — 상하좌우 반복시켜 쓰는 용도 (이음매 없음)
  {
    name: '10_배경타일_400x400', w: 400, h: 400,
    html: `<div style="width:400px;height:400px;position:relative;overflow:hidden;background:${C.ink}">
      <div style="position:absolute;inset:0;
        background-image:linear-gradient(${C.brand}0C 1px,transparent 1px),
                         linear-gradient(90deg,${C.brand}0C 1px,transparent 1px);
        background-size:50px 50px"></div>
    </div>`
  },
]

// ─── 렌더 ───────────────────────────────────────────────────
const filter = process.argv[2]
const targets = filter ? specs.filter(s => s.name.includes(filter)) : specs
if (!targets.length) {
  console.error(`"${filter}" 에 해당하는 템플릿이 없습니다.`)
  process.exit(1)
}

const browser = await puppeteer.launch({ headless: true, executablePath: findChrome() })
const page = await browser.newPage()

for (const s of targets) {
  await page.setViewport({ width: s.w, height: s.h, deviceScaleFactor: 1 })
  await page.setContent(
    `<html><head><meta charset="utf-8"><style>${base}</style></head><body>${s.html}</body></html>`,
    { waitUntil: 'load' }
  )
  await page.evaluate(() => document.fonts.ready)
  const buf = await page.screenshot({ type: 'png' })
  writeFileSync(join(OUT, `${s.name}.png`), buf)
  console.log(`✓ ${s.name}.png  (${s.w}×${s.h})`)
}

await browser.close()
console.log(`\n${targets.length}개 완료 → ${OUT}`)
