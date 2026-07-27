import { describe, expect, it } from 'vitest'
import { assertWebp, parsePalList, parsePalPage } from './paldb'

const requiredDetails = `
  <section><h3>伙伴技能</h3><div><h4>茸茸盾牌</h4><p>发动后化身为盾牌。</p></div></section>
  <section><h3>工作适应性</h3>
    <div class="flex items-center">
      <img alt="手工作业" src="/T_icon_palwork_04.webp">
      <span>Lv 1</span>
    </div>
  </section>
  <div class="flex justify-between"><span>HP</span><span>70</span></div>
  <div class="flex justify-between"><span>攻击</span><span>70</span></div>
  <div class="flex justify-between"><span>防御</span><span>70</span></div>
  <div class="flex justify-between"><span>工作速度</span><span>100</span></div>
  <div class="flex justify-between"><span>行走</span><span>40</span></div>
  <div class="flex justify-between"><span>奔跑</span><span>400</span></div>
  <div class="flex justify-between"><span>游泳</span><span>120</span></div>
  <div class="flex justify-between"><span>耐力</span><span>100</span></div>
  <img src="/T_Icon_foodamount_on.webp">
`

describe('paldb parsers', () => {
  it('deduplicates detail links and ignores query links', () => {
    expect(
      parsePalList(`
        <a href="/pals/Lamball">A</a>
        <a href="/pals/Lamball">A2</a>
        <a href="/pals/Cattiva">B</a>
        <a href="/pals/Lamball?diff=1">hard</a>
      `),
    ).toEqual(['Lamball', 'Cattiva'])
  })

  it('extracts partner details, stats and source element media', () => {
    const parsed = parsePalPage(
      `
        <html><head>
          <meta property="og:title" content="棉悠悠 - No.001 无属性属性帕鲁图鉴">
          <meta property="og:image" content="/images/lamball.webp">
        </head><body><main>
          <div>
            <h1>棉悠悠</h1>
            <div style="background-image:url(/images/T_prt_palstatus_element_00.webp)">无属性</div>
            <div>稀有度: 1</div>
          </div>
          ${requiredDetails}
        </main></body></html>
      `,
      'https://paldb.cn/pals/Lamball',
    )

    expect(parsed).toMatchObject({
      paldbId: 'Lamball',
      paldexNo: '001',
      nameZhHans: '棉悠悠',
      elementLabels: ['无属性'],
      rarity: 1,
      workSuitabilities: { 手工作业: 1 },
      partnerSkillName: '茸茸盾牌',
      partnerSkillDescription: '发动后化身为盾牌。',
      stats: {
        hp: 70,
        attack: 70,
        defense: 70,
        workSpeed: 100,
        walkSpeed: 40,
        runSpeed: 400,
        swimSpeed: 120,
        stamina: 100,
        foodAmount: 1,
      },
    })
    expect(parsed.elementAssets).toEqual([
      {
        labelZhHans: '无属性',
        sourceUrl:
          'https://paldb.cn/images/T_prt_palstatus_element_00.webp',
      },
    ])
  })

  it('fails instead of publishing an incomplete page', () => {
    expect(() =>
      parsePalPage('<html><h1>坏页面</h1></html>', 'https://paldb.cn/pals/Broken'),
    ).toThrow(/关键字段缺失/)
  })

  it('extracts active, passive and level-qualified drop details', () => {
    const parsed = parsePalPage(
      `
        <html><head>
          <meta property="og:title" content="棉悠悠 - No.001 无属性属性帕鲁图鉴">
          <meta property="og:image" content="/images/lamball.webp">
        </head><body><main><div>
          <h1>棉悠悠</h1>
          <div style="background-image:url(/images/T_prt_palstatus_element_00.webp)">无属性</div>
        </div>
        ${requiredDetails}
        <section><div><h3>主动技能</h3></div><div><div>
          <a href="/skills/Roly_Poly">
            <div><h4>滚滚毛球</h4></div>
            <div>
              <div style="background-image:url(T_prt_palstatus_element_00.webp)">无属性</div>
              <div><div class="inline-flex">近战</div><div class="inline-flex">Lv.1</div></div>
              <div class="flex gap-3 mb-3 flex-wrap">
                <div>威力: 40</div><div>冷却: 2s</div><div>晕眩: 20%</div>
              </div>
              <div class="text-gray-400 text-xs mb-2">攻击范围: Melee 0–1000</div>
              <p>滚动并追击敌人。</p>
            </div>
          </a>
        </div></div></section>
        <section><div><h3>被动技能</h3></div><div><div class="grid">
          <div><h4>勇敢</h4><img alt="rank" src="/T_icon_skillstatus_rank_arrow_02.webp"><p>攻击提升。</p></div>
        </div></div></section>
        <section><div><h3>掉落物品</h3></div><div><table><tbody><tr>
          <td><img alt="羊毛" src="/images/T_itemicon_Material_Wool.webp"></td>
          <td>1–3</td><td>Lv.70 3.33%</td>
        </tr></tbody></table></div></section>
        </main></body></html>
      `,
      'https://paldb.cn/pals/Lamball',
    )

    expect(parsed.activeSkills).toMatchObject([
      {
        id: 'Roly_Poly',
        name: '滚滚毛球',
        elementLabel: '无属性',
        attackType: 'melee',
        unlockLevel: 1,
        power: 40,
        cooldownSeconds: 2,
        effects: ['晕眩: 20%'],
      },
    ])
    expect(parsed.passiveSkills).toEqual([
      { name: '勇敢', description: '攻击提升。', rank: 2 },
    ])
    expect(parsed.drops[0]).toMatchObject({
      itemName: '羊毛',
      quantityMin: 1,
      quantityMax: 3,
      probabilityPercent: 3.33,
      requiredLevel: 70,
    })
  })

  it('uses metadata for an element whose source has no icon', () => {
    const parsed = parsePalPage(
      `
        <html><head>
          <meta name="description" content="幻兽帕鲁枯星龙详细攻略，未知属性帕鲁。">
          <meta property="og:title" content="枯星龙 - No.204 未知属性帕鲁图鉴">
          <meta property="og:image" content="/images/astralym.webp">
        </head><body><main><div><h1>枯星龙</h1><div>稀有度: 10</div></div>
          ${requiredDetails}
        </main></body></html>
      `,
      'https://paldb.cn/pals/Astralym',
    )

    expect(parsed.elementLabels).toEqual(['未知属性'])
    expect(parsed.elementAssets).toEqual([])
  })

  it('rejects disguised image payloads', () => {
    expect(() =>
      assertWebp(Buffer.from('not a webp'), 'image/webp'),
    ).toThrow(/WebP/)
  })
})
