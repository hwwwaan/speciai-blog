// 네이버 블로그 세팅 가이드 → PDF
// 실행: node pdf.mjs
import puppeteer from 'puppeteer'
import { findChrome } from '../studio/카드뉴스/cardnews-white/src/chrome.mjs'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'out')

// 이미지를 base64 로 임베드 — PDF 단독으로 열려야 하므로
const img = f => `data:image/png;base64,${readFileSync(join(OUT, f)).toString('base64')}`

const BRAND = '#D85A30'

const css = `
  @page { size: A4; margin: 16mm 14mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Pretendard','Apple SD Gothic Neo',sans-serif; color:#1a1a1a;
         font-size:10.5pt; line-height:1.65; -webkit-font-smoothing:antialiased; }

  h1 { font-size:22pt; font-weight:800; letter-spacing:-.035em; line-height:1.25; }
  h2 { font-size:14pt; font-weight:800; letter-spacing:-.03em; margin:0 0 10px;
       padding-bottom:7px; border-bottom:2px solid ${BRAND}; }
  h3 { font-size:11pt; font-weight:700; letter-spacing:-.02em; margin:16px 0 6px; }
  p  { margin:0 0 8px; }
  strong { font-weight:700; }
  code { font-family:ui-monospace,Menlo,monospace; font-size:9pt;
         background:#F2F2F0; padding:1px 5px; border-radius:4px; }

  /* 섹션 통째로 밀지 않고, 잘리면 곤란한 요소만 붙잡는다 */
  section { margin-bottom:26px; }
  h2, h3 { break-after:avoid; }
  tr, .shot, .note, pre, .check { break-inside:avoid; }
  .page-break { break-before:page; }

  ul { margin:0 0 8px 17px; }
  li { margin-bottom:4px; }

  table { width:100%; border-collapse:collapse; font-size:9.5pt; margin:8px 0; }
  th { background:#1E1712; color:#fff; font-weight:700; text-align:left;
       padding:8px 10px; letter-spacing:-.02em; }
  td { padding:7px 10px; border-bottom:1px solid #E4E2DE; vertical-align:top; }
  tr:nth-child(even) td { background:#FAF9F7; }
  .num { font-family:ui-monospace,Menlo,monospace; white-space:nowrap; font-weight:600; }

  .note { background:#FDF4F0; border-left:3px solid ${BRAND};
          padding:10px 13px; margin:10px 0; font-size:9.5pt; border-radius:0 6px 6px 0; }
  .note strong { color:#A8421C; }

  pre { background:#1E1712; color:#F0F0F0; padding:12px 14px; border-radius:7px;
        font-family:ui-monospace,Menlo,monospace; font-size:8.5pt; line-height:1.55;
        overflow:hidden; white-space:pre-wrap; word-break:break-all; margin:8px 0; }

  /* 이미지 미리보기 카드 */
  .shots { display:grid; grid-template-columns:1fr 1fr; gap:13px; margin-top:10px; }
  .shot { border:1px solid #E4E2DE; border-radius:8px; overflow:hidden; break-inside:avoid; }
  .shot .frame { background:#F2F2F0; padding:9px; display:flex;
                 align-items:center; justify-content:center; min-height:82px; }
  .shot img { max-width:100%; max-height:130px; display:block;
              box-shadow:0 1px 5px #0000001f; }
  .shot .cap { padding:8px 11px; border-top:1px solid #EEECE8; }
  .shot .cap b { font-size:9.5pt; letter-spacing:-.02em; }
  .shot .cap span { display:block; font-size:8.5pt; color:#77736C; margin-top:2px; }
  .shot .cap .sz { font-family:ui-monospace,Menlo,monospace; color:${BRAND}; font-weight:600; }

  /* 체크리스트 */
  .check { display:flex; gap:9px; align-items:flex-start; margin-bottom:9px; }
  .box { width:13px; height:13px; border:1.5px solid #B9B4AC; border-radius:3px;
         flex-shrink:0; margin-top:3px; }
`

const shot = (file, name, size, use) => `
  <div class="shot">
    <div class="frame"><img src="${img(file)}" /></div>
    <div class="cap"><b>${name}</b><span class="sz">${size}</span><span>${use}</span></div>
  </div>`

const html = `
<!-- ── 표지 ── -->
<section style="border-bottom:2px solid #1E1712;padding-bottom:18px;margin-bottom:28px">
  <div style="display:flex;align-items:center;gap:11px;margin-bottom:16px">
    <div style="width:38px;height:38px;border-radius:11px;
      background:linear-gradient(135deg,${BRAND},#CB603D);color:#fff;font-size:21px;
      font-weight:800;display:flex;align-items:center;justify-content:center">S</div>
    <div style="font-size:19px;font-weight:800;letter-spacing:-.03em">
      speciai<span style="color:${BRAND}">.team</span></div>
  </div>
  <h1>네이버 블로그 개설·세팅 가이드<br/>
    <span style="color:${BRAND}">이미지 규격 정리</span></h1>
  <p style="margin-top:11px;color:#77736C;font-size:9.5pt">
    2026년 8월 4일 · 중소기업·스타트업 AI 법률·세무·노무 컴플라이언스 어드바이저리<br/>
    블로그 <b style="color:${BRAND}">blog.naver.com/speciai_</b><br/>
    이미지 원본 <code>speciai.team/blog/out/</code> · 재생성 <code>node render.mjs</code>
  </p>
</section>

<!-- ── 1. 개설 순서 ── -->
<section>
  <h2>1. 기본 세팅</h2>
  <p>블로그는 이미 열려 있습니다. 남은 건 꾸미기 설정이고,
     네이버 로그인이 필요한 단계라 직접 진행하셔야 합니다.</p>

  <div class="note">
    주소 끝의 언더스코어(<code>speciai_</code>)는 사람이 따라 치기 어렵습니다.
    명함·메일 서명에는 <strong>주소를 직접 노출하지 말고</strong>
    「블로그」 텍스트에 링크를 거는 편이 안전합니다.
  </div>

  <table>
    <tr><th style="width:22%">단계</th><th style="width:30%">경로</th><th>설정할 값</th></tr>
    <tr><td style="color:#9a958d"><b>블로그 만들기</b></td><td style="color:#9a958d">blog.naver.com</td>
        <td style="color:#9a958d"><b>완료</b> — 주소 <code>speciai_</code> 로 확정</td></tr>
    <tr><td><b>기본 정보</b></td><td>관리 → 기본 설정</td>
        <td>블로그명 <b>speciai.team | 중소기업 법률·세무·노무</b><br/>별명 <b>speciai</b></td></tr>
    <tr><td><b>소개글</b></td><td>관리 → 기본 설정</td>
        <td>검색 결과에 같이 노출되니 키워드를 넣습니다 —<br/>
        「중소기업·스타트업이 놓치기 쉬운 법률·세무·노무 규정을 AI 어드바이저리가 먼저 짚어드립니다」</td></tr>
    <tr><td><b>레이아웃</b></td><td>꾸미기 설정 → 레이아웃·위젯</td>
        <td><b>2단 (사이드바 우측)</b> — 위젯 배너를 걸 자리가 생깁니다</td></tr>
    <tr><td><b>스킨</b></td><td>세부 디자인 설정</td>
        <td>타이틀·배경·글영역을 각각 <b>직접등록</b>으로 교체</td></tr>
    <tr><td><b>위젯</b></td><td>레이아웃·위젯 → 위젯 직접등록</td>
        <td>배너 3종 등록 (5번 항목의 HTML)</td></tr>
    <tr><td><b>카테고리</b></td><td>관리 → 메뉴·글 관리</td>
        <td>법률 / 세무 / 노무 / 컴플라이언스 사례 / 공지</td></tr>
  </table>
</section>

<!-- ── 2. 규격표 ── -->
<section>
  <h2>2. 이미지 규격 한눈에</h2>
  <p>네이버가 정한 고정값입니다. <b>가로는 반드시 맞추고, 세로만 조절</b>하시면 됩니다.</p>
  <table>
    <tr><th style="width:27%">쓰는 곳</th><th style="width:21%">규격 (px)</th>
        <th style="width:27%">준비된 파일</th><th>비고</th></tr>
    <tr><td>블로그 타이틀</td><td class="num">966 × 50~600</td>
        <td>01_타이틀</td><td>기본 폭. 300이 무난합니다</td></tr>
    <tr><td>타이틀 (와이드 스킨)</td><td class="num">1920 × 50~600</td>
        <td>02_타이틀_와이드</td><td>와이드 레이아웃일 때만</td></tr>
    <tr><td>프로필 이미지</td><td class="num">161 × 161~286</td>
        <td>03_프로필</td><td>정사각이 안전합니다</td></tr>
    <tr><td>위젯 배너</td><td class="num">170 × 자유</td>
        <td>04~06_위젯</td><td>가로 170 고정. 넘으면 잘립니다</td></tr>
    <tr><td>스킨 배경</td><td class="num">1920 × 1080</td>
        <td>09_배경</td><td>반복 없이 한 장으로</td></tr>
    <tr><td>스킨 배경 (반복용)</td><td class="num">400 × 400</td>
        <td>10_배경타일</td><td>상하좌우 반복 설정할 때</td></tr>
    <tr><td>모바일 앱 커버</td><td class="num">1080 × 1300</td>
        <td>07_모바일커버</td><td>모바일 앱에서만 보입니다</td></tr>
    <tr><td>포스팅 대표 썸네일</td><td class="num">1300 × 885</td>
        <td>08_썸네일템플릿</td><td>검색 결과에 뜨는 이미지</td></tr>
    <tr><td>본문 삽입 사진</td><td class="num">가로 966 이하</td>
        <td>—</td><td>넘으면 자동 축소돼 흐려집니다</td></tr>
    <tr><td>카드뉴스</td><td class="num">1300 × 1300</td>
        <td>카드뉴스 파이프라인</td><td>studio/카드뉴스/cardnews-white</td></tr>
  </table>

  <h3>공통 규칙</h3>
  <ul>
    <li>글자가 있는 이미지는 <b>PNG</b>, 사진은 <b>JPG 85%</b>.</li>
    <li>한 장당 <b>1MB 이하</b>로 맞추면 로딩이 눈에 띄게 빨라집니다. 배경은 특히 그렇습니다.</li>
    <li>레티나 대응한다고 2배로 올리지 마세요. 네이버가 다시 압축해서 오히려 뭉갭니다.</li>
  </ul>
</section>

<!-- ── 3. 제작물 ── -->
<section class="page-break">
  <h2>3. 제작해 둔 이미지 10종</h2>
  <p>카드뉴스와 같은 브랜드 컬러를 씁니다 — 메인 <code>#D85A30</code>,
     보조 <code>#CB603D</code>, 배경 <code>#0A0A0A</code>.</p>
  <div class="shots">
    ${shot('01_타이틀_966x300.png', '블로그 타이틀', '966 × 300', '상단 타이틀 · 기본 폭')}
    ${shot('02_타이틀_와이드_1920x300.png', '타이틀 (와이드)', '1920 × 300', '와이드 스킨 전용')}
    ${shot('03_프로필_161x161.png', '프로필', '161 × 161', '사이드바 프로필 이미지')}
    ${shot('07_모바일커버_1080x1300.png', '모바일 앱 커버', '1080 × 1300', '모바일 앱 상단')}
    ${shot('04_위젯_무료진단_170x74.png', '위젯 ① 무료 진단', '170 × 74', '상담 신청 폼으로 연결')}
    ${shot('05_위젯_서비스안내_170x74.png', '위젯 ② 서비스 안내', '170 × 74', 'speciai.team 소개로 연결')}
    ${shot('06_위젯_상담문의_170x74.png', '위젯 ③ 상담 문의', '170 × 74', '카카오톡 채널로 연결')}
    ${shot('08_썸네일템플릿_1300x885.png', '썸네일 템플릿', '1300 × 885', '글마다 제목만 교체해 재사용')}
    ${shot('09_배경_1920x1080.png', '스킨 배경', '1920 × 1080', '한 장으로 채울 때')}
    ${shot('10_배경타일_400x400.png', '배경 타일', '400 × 400', '반복(타일)으로 채울 때')}
  </div>
</section>

<!-- ── 4. 배경 ── -->
<section class="page-break">
  <h2>4. 뒷 배경 이미지 — 여기가 제일 많이 틀립니다</h2>
  <p>배경은 <b>글 뒤에 깔리는 이미지</b>라 규격보다 밝기가 중요합니다.</p>

  <h3>규격</h3>
  <ul>
    <li><b>한 장으로 채울 때</b> — <code>1920 × 1080</code>. 화면이 더 크면 가장자리가 잘리니
        <b>중요한 요소를 중앙 966px 안에</b> 둡니다.</li>
    <li><b>반복(타일)으로 채울 때</b> — <code>400 × 400</code> 이하. 이음매가 보이면 안 되므로
        패턴만 넣습니다. 준비한 타일은 격자라 이어 붙어도 티가 안 납니다.</li>
    <li>배경을 <b>고정(fixed)</b> 으로 두면 스크롤할 때 글만 움직여서 훨씬 깔끔합니다.</li>
  </ul>

  <h3>밝기 기준 — 규격보다 이쪽이 중요합니다</h3>
  <table>
    <tr><th style="width:34%">글영역 설정</th><th>배경을 어떻게 해야 하나</th></tr>
    <tr><td>흰 배경 (권장)</td><td>배경은 어두워도 됩니다. 지금 만든 조합이 이것입니다</td></tr>
    <tr><td>투명</td><td>배경 대비를 <b>명도차 15% 이내</b>로 낮춰야 글이 읽힙니다</td></tr>
    <tr><td>사진을 배경으로</td><td><b>검정 60% 오버레이 필수.</b> 그냥 깔면 본문이 안 읽힙니다</td></tr>
  </table>

  <div class="note">
    준비된 <code>09_배경_1920x1080.png</code> 는 순흑 바탕에 오렌지 격자를
    <strong>투명도 4%</strong> 로만 얹었습니다. 눈에 거의 안 보이는 게 정상이고,
    그래야 글이 삽니다.
  </div>
</section>

<!-- ── 5. 위젯 ── -->
<section>
  <h2>5. 위젯 배너 등록</h2>
  <p>관리 → 꾸미기 설정 → 레이아웃·위젯 설정 → <b>위젯 직접등록</b> → 아래 HTML을 붙여넣습니다.
     <code>이미지주소</code> 자리에는 블로그에 이미지를 한 번 올린 뒤 나오는 URL을 넣으시면 됩니다.</p>

<pre>&lt;a href="https://speciai.team/consult" target="_blank"&gt;
  &lt;img src="이미지주소/04_위젯_무료진단_170x74.png"
       width="170" alt="무료 컴플라이언스 진단" /&gt;
&lt;/a&gt;</pre>

  <table>
    <tr><th style="width:38%">배너</th><th>연결할 곳</th></tr>
    <tr><td>무료 컴플라이언스 진단</td><td>상담 신청 폼</td></tr>
    <tr><td>서비스 안내</td><td>speciai.team 서비스 소개</td></tr>
    <tr><td>1:1 상담 문의</td><td>카카오톡 채널</td></tr>
  </table>

  <div class="note">
    위젯은 <strong>가로 170px을 넘으면 사이드바 밖으로 잘립니다.</strong> 세로는 자유입니다.
  </div>
</section>

<!-- ── 6. 촬영 ── -->
<section class="page-break">
  <h2>6. 추가로 준비하셔야 할 사진</h2>
  <p>지금 만든 건 전부 <b>그래픽</b>입니다. 신뢰가 필요한 업종이라 실물 사진이 몇 장 있으면
     체감이 크게 달라집니다.</p>

  <table>
    <tr><th style="width:28%">무엇</th><th style="width:20%">규격</th>
        <th style="width:30%">어디에 쓰나</th><th>우선순위</th></tr>
    <tr><td><b>대표·컨설턴트 인물</b></td><td class="num">정사각 1000↑</td>
        <td>프로필, 소개 글, 카드뉴스 듀오톤</td>
        <td style="color:${BRAND};font-weight:700">높음</td></tr>
    <tr><td>상담·미팅 장면</td><td class="num">가로 1300×885</td>
        <td>서비스 소개 글 대표 이미지</td>
        <td style="color:${BRAND};font-weight:700">높음</td></tr>
    <tr><td>사무실·업무 환경</td><td class="num">가로 1300×885</td>
        <td>회사 소개 글</td><td>중간</td></tr>
    <tr><td>자료·문서 클로즈업</td><td class="num">가로 1300×885</td>
        <td>법률·세무 글 대표 이미지</td><td>중간</td></tr>
  </table>

  <h3>촬영할 때 지켜야 할 것</h3>
  <div class="check"><div class="box"></div><div>
    <b>가로로 찍습니다.</b> 세로 사진은 블로그 본문에서 화면을 다 잡아먹습니다.</div></div>
  <div class="check"><div class="box"></div><div>
    인물은 <b>여백을 넉넉히</b> 두고 찍어야 정사각·가로 어느 쪽으로도 잘라 쓸 수 있습니다.</div></div>
  <div class="check"><div class="box"></div><div>
    조명은 <b>한쪽 방향</b>으로 통일합니다. 카드뉴스 듀오톤 처리에 그대로 넘길 수 있습니다.</div></div>
  <div class="check"><div class="box"></div><div>
    배경은 단색이나 흐린 실내. 복잡하면 오렌지 브랜드 컬러가 죽습니다.</div></div>

  <div class="note">
    스톡 사진을 쓰신다면 Unsplash·Pexels 는 상업적 이용이 되지만, 법률·세무 업종은
    「외국인 정장 인물 스톡」이 티가 많이 나서 <strong>오히려 신뢰를 깎습니다.</strong>
    인물은 실물로 가시는 걸 권합니다.
  </div>
</section>

<!-- ── 7. 재생성 ── -->
<section>
  <h2>7. 이미지 다시 만들기</h2>
  <p>문구나 색을 바꾸시려면 <code>render.mjs</code> 위쪽만 고치면 됩니다.</p>

<pre>cd ~/Work/speciai/speciai.team/blog

node render.mjs          # 10장 전부
node render.mjs 타이틀    # 이름에 '타이틀' 들어간 것만
node render.mjs 위젯      # 위젯 배너 3종만</pre>

  <ul>
    <li>색은 파일 맨 위 <code>const C = {...}</code> 에 모여 있습니다.</li>
    <li>문구는 각 템플릿의 <code>html</code> 안에 그대로 적혀 있습니다.</li>
    <li>썸네일 템플릿은 카테고리 뱃지·제목·부제만 갈아끼우면 글마다 재사용됩니다.</li>
  </ul>

  <div class="note">
    브랜드 컬러를 바꾸실 거면 <code>_공용/design/design-system/spec.md</code> 도 같이 봐야 합니다.
    <strong>밈릴스 듀오톤이 같은 색을 씁니다.</strong>
  </div>
</section>
`

const browser = await puppeteer.launch({ headless: true, executablePath: findChrome() })
const page = await browser.newPage()
await page.setContent(
  `<html><head><meta charset="utf-8"><style>${css}</style></head><body>${html}</body></html>`,
  { waitUntil: 'load' }
)
await page.evaluate(() => document.fonts.ready)

const dest = join(HERE, 'speciai.team_네이버블로그_세팅가이드.pdf')
await page.pdf({
  path: dest,
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: `<div style="width:100%;font-size:7.5pt;color:#9a958d;
    font-family:'Pretendard',sans-serif;padding:0 14mm;display:flex;justify-content:space-between">
    <span>speciai.team · 네이버 블로그 세팅 가이드</span>
    <span class="pageNumber"></span></div>`,
  margin: { top: '16mm', bottom: '14mm', left: '14mm', right: '14mm' },
})

await browser.close()
console.log(`✓ ${dest}`)
