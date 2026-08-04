// 같은 주제 글끼리 서로 링크로 묶는다.
//
//   한 주제를 여러 편으로 쪼갰으면 서로 걸어줘야 주제 권위가 생기고
//   독자가 한 편만 보고 나가지 않는다.
//
// 실행:
//   node series.mjs 취업규칙 posts/A.md posts/B.md posts/C.md
//
// 발행 전에는 제목만 적히고, 발행해서 원장(ledger.json)에 URL 이 들어간 뒤
// 다시 돌리면 실제 링크로 바뀐다.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BLOG = 'https://blog.naver.com/speciai_'
const MARK = '## 함께 보면 좋은 글'

const [name, ...files] = process.argv.slice(2)
if (!name || files.length < 2) {
  console.error('사용법: node series.mjs <시리즈이름> <글1.md> <글2.md> ...')
  process.exit(1)
}

const ledgerPath = join(HERE, 'ledger.json')
const ledger = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : { posts: [] }

// 각 글의 제목과 (있으면) 발행 주소를 모은다
const items = files.filter(f => existsSync(f)).map(f => {
  const raw = readFileSync(f, 'utf8')
  const title = raw.match(/^title:\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, '')
  const slug = basename(f, '.md').replace(/\.발행본$/, '')
  const post = ledger.posts.find(p => p.slug === slug)
  return { file: f, slug, title: title || slug, url: post?.postId ? `${BLOG}/${post.postId}` : null }
})

if (items.length < 2) { console.error('묶을 글이 2편 이상이어야 합니다.'); process.exit(1) }

const published = items.filter(i => i.url).length
console.log(`시리즈 「${name}」 ${items.length}편 · 발행 ${published}편\n`)

for (const me of items) {
  const others = items.filter(o => o.slug !== me.slug)
  const block = [
    MARK,
    '',
    `${name}은 한 편으로 끝나지 않습니다. 순서대로 보시면 빠짐없이 챙길 수 있습니다.`,
    '',
    ...others.map(o => o.url ? `- [${o.title}](${o.url})` : `- ${o.title} *(발행 예정)*`),
    '',
  ].join('\n')

  let raw = readFileSync(me.file, 'utf8')

  // 이미 붙어 있으면 갈아끼운다 — 다음 섹션(## 또는 해시태그 줄) 앞까지가 기존 블록
  const at = raw.indexOf(MARK)
  if (at > -1) {
    const rest = raw.slice(at + MARK.length)
    const nextIdx = rest.search(/\n##\s|\n#[^\s#]/)
    raw = raw.slice(0, at) + (nextIdx > -1 ? rest.slice(nextIdx + 1) : '')
    raw = raw.trimEnd() + '\n'
  }

  // 해시태그 줄이 있으면 그 앞에, 없으면 맨 끝에 넣는다
  const tagLine = raw.search(/\n#[^\s#]/)
  const out = tagLine > -1
    ? raw.slice(0, tagLine + 1) + '\n' + block + '\n' + raw.slice(tagLine + 1)
    : raw.trimEnd() + '\n\n' + block

  writeFileSync(me.file, out)
  console.log(`✓ ${me.title.slice(0, 40)}`)
  console.log(`   → ${others.map(o => o.url ? '링크' : '제목만').join(', ')}`)
}

if (published < items.length) {
  console.log(`\n발행 후 다시 돌리면 제목이 실제 링크로 바뀝니다:`)
  console.log(`  node rank.mjs --publish <슬러그> <URL>`)
  console.log(`  node series.mjs ${name} ${files.join(' ')}`)
}
