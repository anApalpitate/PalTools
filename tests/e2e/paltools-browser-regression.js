async (page, scenes = ['paldex', 'breeding', 'assistant', 'theme', 'shared']) => {
  const baseUrl = 'http://127.0.0.1:4173'
  const artifactRoot = 'output/playwright/browser-regression'
  const consoleIssues = []
  const pageErrors = []
  const externalRequests = []
  const workers = []
  const selected = new Set(scenes)
  const results = {}

  const assert = (condition, message) => {
    if (!condition) throw new Error(message)
  }
  const waitFor = async (label, probe, timeoutMs = 30_000) => {
    const deadline = Date.now() + timeoutMs
    let lastError
    while (Date.now() < deadline) {
      try {
        if (await probe()) return
      } catch (error) {
        lastError = error
      }
      await page.waitForTimeout(100)
    }
    throw new Error(`${label}：等待超时${lastError ? `（${lastError.message}）` : ''}`)
  }
  const openRoute = async (hash, heading) => {
    await page.goto(`${baseUrl}/${hash}`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: heading, exact: true }).waitFor({
      state: 'visible',
      timeout: 30_000,
    })
    assert(await page.locator('.error-state').count() === 0, `${hash} 不应进入数据错误页`)
  }
  const assertNoRootOverflow = async (label) => {
    const state = await page.evaluate(() => ({
      html: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      },
      body: {
        clientWidth: document.body.clientWidth,
        scrollWidth: document.body.scrollWidth,
      },
    }))
    assert(state.html.scrollWidth <= state.html.clientWidth + 1, `${label}：html 出现横向溢出 ${JSON.stringify(state.html)}`)
    assert(state.body.scrollWidth <= state.body.clientWidth + 1, `${label}：body 出现横向溢出 ${JSON.stringify(state.body)}`)
  }
  const assertVisibleImages = async (label) => {
    const inspect = () => page.locator('img').evaluateAll((images) => {
      const inViewport = images.filter((image) => {
        const rect = image.getBoundingClientRect()
        const style = getComputedStyle(image)
        return rect.width > 0 && rect.height > 0 &&
          rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth &&
          style.display !== 'none' && style.visibility !== 'hidden'
      })
      return {
        count: inViewport.length,
        pending: inViewport.filter((image) => !image.complete).length,
        broken: inViewport
          .filter((image) => image.complete && image.naturalWidth <= 0)
          .map((image) => image.currentSrc || image.getAttribute('src') || '<unknown>'),
      }
    })
    await waitFor(`${label} 可见图片完成加载`, async () => {
      const state = await inspect()
      return state.count > 0 && state.pending === 0
    }, 15_000)
    const state = await inspect()
    assert(state.broken.length === 0, `${label}：存在破图 ${state.broken.join(', ')}`)
  }

  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      consoleIssues.push(`${message.type()}: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('worker', (worker) => workers.push(worker.url()))
  page.on('request', (request) => {
    const requestUrl = request.url()
    if (!requestUrl.startsWith('http://') && !requestUrl.startsWith('https://')) return
    if (!requestUrl.startsWith(`${baseUrl}/`)) externalRequests.push(requestUrl)
  })

  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' })
  if (selected.has('assistant')) {
    const setupViewports = [
      { name: '1440x900', width: 1440, height: 900 },
      { name: '1152x720', width: 1152, height: 720 },
      { name: '1366x768', width: 1366, height: 768 },
      { name: '540x360', width: 540, height: 360 },
    ]
    await page.evaluate(() => {
      localStorage.removeItem('paltools.agent-profiles.v1')
      localStorage.removeItem('paltools.agent-default-profile.v1')
    })
    for (const viewport of setupViewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await openRoute('#/assistant/saved-record', '先配置模型服务')
      assert(await page.locator('.assistant-workbench, .assistant-composer, .assistant-evidence, .assistant-archive').count() === 0, `${viewport.name}：未配置时不得挂载对话、档案或本地资料`)
      await assertNoRootOverflow(`助手配置引导 ${viewport.name}`)
      await assertVisibleImages(`助手配置引导 ${viewport.name}`)
      const setupLayout = await page.locator('.assistant-setup-card').evaluate((element) => ({
        width: element.clientWidth, scrollWidth: element.scrollWidth, overflowY: getComputedStyle(element).overflowY,
        bodyOverflowY: getComputedStyle(document.body).overflowY,
      }))
      assert(setupLayout.scrollWidth <= setupLayout.width + 1, `${viewport.name}：引导卡片不得横向溢出`)
      assert(setupLayout.overflowY !== 'hidden' && setupLayout.bodyOverflowY !== 'hidden', `${viewport.name}：引导页应允许低高度滚动`)
      if (viewport.height === 360) {
        await page.mouse.move(270, 200)
        await page.mouse.wheel(0, 420)
        await waitFor('低高度引导页可滚动', () => page.evaluate(() => window.scrollY > 0))
      }
      const configure = page.getByRole('link', { name: '前往配置模型服务' })
      await configure.focus()
      assert(await configure.evaluate((element) => element === document.activeElement && getComputedStyle(element).outlineStyle !== 'none'), `${viewport.name}：配置入口应有可见键盘焦点`)
      await page.screenshot({ path: `${artifactRoot}/assistant-setup-${viewport.name}.png`, animations: 'disabled' })
    }
    await page.getByRole('link', { name: '前往配置模型服务' }).press('Enter')
    await page.getByRole('heading', { name: '模型服务', exact: true }).waitFor({ state: 'visible' })
    await page.getByLabel('服务商').selectOption('ollama')
    assert(await page.getByLabel('默认模型').inputValue() === 'qwen3.5:4b', 'Ollama 应预选常用模型')
    await page.getByLabel('添加自定义模型 ID').fill('registry.example.test/team/a-very-long-model-name-for-responsive-regression')
    await page.getByRole('button', { name: '添加模型', exact: true }).click()
    for (const viewport of setupViewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await assertNoRootOverflow(`模型配置 ${viewport.name}`)
      const modelSettings = await page.locator('.model-settings').evaluate((element) => ({ width: element.clientWidth, scrollWidth: element.scrollWidth }))
      assert(modelSettings.scrollWidth <= modelSettings.width + 1, `${viewport.name}：长模型名称不得让配置页横向溢出`)
    }
    await page.getByRole('button', { name: '保存配置', exact: true }).click()
    await page.getByText('模型服务已保存。', { exact: true }).waitFor({ state: 'visible' })
    await page.getByRole('link', { name: '助手', exact: true }).click()
    await page.getByLabel('向帕鲁助手提问').waitFor({ state: 'visible' })
    assert(await page.locator('.assistant-setup-card').count() === 0, '保存首个配置后应进入助手工作台')
    await page.getByRole('link', { name: '设置', exact: true }).click()
    // Native dialogs interrupt CLI run-code. Accept only this synthetic profile deletion;
    // the reload below restores the native confirm before the remaining scenarios.
    await page.evaluate(() => { window.confirm = () => true })
    await page.getByRole('button', { name: '删除', exact: true }).click()
    await page.getByText('还没有保存的服务', { exact: true }).waitFor({ state: 'visible' })
    await page.getByRole('link', { name: '助手', exact: true }).click()
    await page.getByRole('heading', { name: '先配置模型服务', exact: true }).waitFor({ state: 'visible' })
    await page.evaluate(() => {
      const common = {
        schemaVersion: 1,
        presetId: 'ollama',
        transport: 'openai-chat',
        baseUrl: 'http://127.0.0.1:11434/v1',
        model: 'browser-regression-model',
        authMode: 'none',
        timeoutMs: 60000,
        contextTurns: 12,
        capabilityMode: 'retrieval-only',
        extraHeaders: {},
        extraBody: {},
      }
      localStorage.setItem('paltools.agent-profiles.v1', JSON.stringify([
        { ...common, id: 'browser-profile-a', displayName: '本地模型 A' },
        { ...common, id: 'browser-profile-b', displayName: '本地模型 B' },
      ]))
      localStorage.setItem('paltools.agent-default-profile.v1', 'browser-profile-a')
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    results.assistantSetup = { viewports: setupViewports.map(({ name }) => name) }
  }

  if (selected.has('paldex')) {
    const viewports = [
      { name: '1440x900', width: 1440, height: 900 },
      { name: '1152x720', width: 1152, height: 720 },
      { name: '1366x768', width: 1366, height: 768 },
      { name: '800x720', width: 800, height: 720 },
    ]
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await openRoute('#/paldex', '帕鲁图鉴')
      await assertNoRootOverflow(`图鉴 ${viewport.name}`)
      await assertVisibleImages(`图鉴 ${viewport.name}`)
      assert(await page.getByLabel('搜索帕鲁').isVisible(), `${viewport.name}：图鉴搜索框应在页面中可见`)
      await page.screenshot({
        path: `${artifactRoot}/layout-${viewport.name}.png`,
        animations: 'disabled',
      })
    }

    await page.setViewportSize({ width: 1440, height: 900 })
    await openRoute('#/paldex', '帕鲁图鉴')
    await page.context().setOffline(true)
    await page.getByLabel('搜索帕鲁').fill('mianyouyou')
    await waitFor('离线拼音检索结果', async () => {
      const cards = page.locator('.pal-card')
      return await cards.count() === 1 && (await cards.first().innerText()).includes('棉悠悠')
    })
    await page.getByLabel('搜索帕鲁').fill('')
    await page.context().setOffline(false)
    results.paldex = { viewports: viewports.map(({ name }) => name), offlineSearch: 'passed' }
  }

  if (selected.has('theme')) {
    await openRoute('#/settings', '本机设置')
    const themes = [
      ['forest', '森林夜色', 'dark'],
      ['pearl', '珍珠白', 'light'],
      ['graphite', '石墨灰', 'dark'],
      ['sky', '晴空浅蓝', 'light'],
      ['lavender', '薰衣草霓虹', 'dark'],
      ['coral', '珊瑚莓果', 'light'],
      ['mint', '深海薄荷', 'dark'],
    ]
    for (const [themeId, label, colorScheme] of themes) {
      const option = page.getByRole('radio').filter({ hasText: label })
      await option.click()
      await waitFor(`主题 ${label} 生效`, async () => (
        await page.locator('html').getAttribute('data-theme') === themeId &&
        await option.getAttribute('aria-checked') === 'true'
      ))
      const tokens = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement)
        return {
          canvas: style.getPropertyValue('--theme-canvas').trim(),
          surface: style.getPropertyValue('--theme-surface').trim(),
          text: style.getPropertyValue('--theme-text').trim(),
          accent: style.getPropertyValue('--theme-accent').trim(),
          colorScheme: style.colorScheme,
        }
      })
      assert(tokens.canvas && tokens.surface && tokens.text && tokens.accent, `主题 ${label} 缺少核心语义令牌`)
      assert(tokens.colorScheme === colorScheme, `主题 ${label} 的 color-scheme 不正确：${tokens.colorScheme}`)
      await assertNoRootOverflow(`设置主题 ${label}`)
    }
    const firstTheme = page.getByRole('radio').filter({ hasText: '森林夜色' })
    await firstTheme.focus()
    await firstTheme.press('End')
    const lastTheme = page.getByRole('radio').filter({ hasText: '深海薄荷' })
    await waitFor('主题键盘 End 聚焦并选择最后一项', async () => (
      await lastTheme.evaluate((element) => element === document.activeElement) &&
      await lastTheme.getAttribute('aria-checked') === 'true'
    ))
    await page.screenshot({ path: `${artifactRoot}/themes.png`, animations: 'disabled' })
    results.themes = themes.map(([, label]) => label)
  }

  if (selected.has('assistant')) {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openRoute('#/assistant', '帕鲁研究终端')
    const modelPicker = page.getByLabel('模型服务')
    await waitFor('助手模型列表载入', async () => await modelPicker.locator('option').count() === 2)
    assert(await modelPicker.inputValue() === 'browser-profile-a|browser-regression-model', '助手应使用已保存的默认模型')
    assert(await modelPicker.locator('option[value^="paltools-managed-development-deepseek|"]').count() === 0, '生产 Web 构建不应注入开发者模型')
    await page.getByRole('button', { name: '新建研究记录' }).click()
    await waitFor('新建研究记录写入路由', async () => /#\/assistant\/[^/]+$/.test(page.url()))
    await modelPicker.selectOption('browser-profile-b|browser-regression-model')
    await waitFor('会话模型切换完成', async () => await modelPicker.inputValue() === 'browser-profile-b|browser-regression-model')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: '帕鲁研究终端', exact: true }).waitFor({ state: 'visible' })
    await waitFor('会话模型切换持久化', async () => await modelPicker.inputValue() === 'browser-profile-b|browser-regression-model')

    const assistantInput = page.getByLabel('向帕鲁助手提问')
    assert(await page.locator('#assistant-composer-hint').count() === 0, '输入框未聚焦时不应渲染快捷键提示')
    await assistantInput.focus()
    await page.locator('#assistant-composer-hint').waitFor({ state: 'visible' })
    assert((await assistantInput.getAttribute('aria-describedby'))?.includes('assistant-composer-hint'), '聚焦输入框后应关联快捷键提示')
    await modelPicker.focus()
    assert(await page.locator('#assistant-composer-hint').count() === 0, '输入框失焦后应移除快捷键提示')

    await assistantInput.click()
    await assistantInput.pressSequentially('@mianyouyou')
    const mentionList = page.getByRole('listbox', { name: '帕鲁、技能与物品建议' })
    await waitFor('桌面 @ 菜单显示', () => mentionList.isVisible())
    assert(await assistantInput.getAttribute('aria-controls') === 'assistant-mention-listbox', '@ 菜单应与输入框建立 aria-controls 关联')
    assert(await page.getByText('本地工具', { exact: true }).count() === 0, '@ 菜单不应再暴露底层工具')
    const lamballMention = mentionList.getByRole('option').filter({ hasText: '棉悠悠' }).first()
    await lamballMention.waitFor({ state: 'visible' })
    const mentionKinds = await mentionList.getByRole('option').evaluateAll((options) => options.map((option) => option.dataset.mentionKind))
    assert(mentionKinds.length > 0 && mentionKinds.every((kind) => ['pal', 'skill', 'item'].includes(kind)), `@ 菜单只能包含对象引用：${mentionKinds.join(', ')}`)
    const mentionImage = lamballMention.locator('img')
    assert(await mentionImage.count() === 1, '帕鲁 @ 选项应显示本地缩略图')
    await waitFor('帕鲁 @ 缩略图载入', () => mentionImage.evaluate((image) => image.complete && image.naturalWidth > 0))
    await page.screenshot({ path: `${artifactRoot}/assistant-mentions.png`, animations: 'disabled' })
    await assistantInput.press('Escape')
    await mentionList.waitFor({ state: 'detached' })
    await waitFor('关闭 @ 菜单后恢复输入焦点', () => assistantInput.evaluate((element) => element === document.activeElement))
    await page.screenshot({ path: `${artifactRoot}/assistant-composer.png`, animations: 'disabled' })

    const assistantViewports = [
      { name: '1440x900', width: 1440, height: 900 },
      { name: '1152x720', width: 1152, height: 720 },
      { name: '1366x768', width: 1366, height: 768 },
      { name: '760x680', width: 760, height: 680 },
      { name: '540x680', width: 540, height: 680 },
    ]
    for (const viewport of assistantViewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await openRoute('#/assistant', '帕鲁研究终端')
      await page.getByLabel('模型服务').waitFor({ state: 'visible' })
      await assertNoRootOverflow(`助手 ${viewport.name}`)
      const assistantSurface = await page.locator('.assistant-dialogue').evaluate((element) => {
        const style = getComputedStyle(element)
        return { backgroundImage: style.backgroundImage, backgroundColor: style.backgroundColor }
      })
      assert(assistantSurface.backgroundImage === 'none', `${viewport.name}：助手对话面不应包含条纹背景`)
      assert(assistantSurface.backgroundColor !== 'rgba(0, 0, 0, 0)', `${viewport.name}：助手对话面应使用不透明主题表面色`)
      const composerBox = await page.locator('.assistant-composer').boundingBox()
      assert(composerBox && composerBox.y >= 0 && composerBox.y + composerBox.height <= viewport.height + 1, `${viewport.name}：发送框应完整位于首屏`)
      if (viewport.width <= 1179) assert(await page.locator('#assistant-evidence-panel').evaluate((element) => element.inert), `${viewport.name}：关闭的证据抽屉必须 inert`)
      if (viewport.width <= 800) assert(await page.locator('#assistant-archive-panel').evaluate((element) => element.inert), `${viewport.name}：关闭的档案抽屉必须 inert`)
      if (viewport.width <= 560) {
        const narrowInput = page.getByLabel('向帕鲁助手提问')
        await narrowInput.focus()
        const narrowHint = page.locator('#assistant-composer-hint')
        await narrowHint.waitFor({ state: 'visible' })
        assert((await narrowHint.boundingBox())?.height > 0, `${viewport.name}：聚焦提示应换行显示而非隐藏`)
        await narrowInput.click()
        await narrowInput.fill('')
        await narrowInput.pressSequentially('@mianyouyou')
        const narrowMentionList = page.getByRole('listbox', { name: '帕鲁、技能与物品建议' })
        await waitFor(`${viewport.name} @ 菜单显示`, () => narrowMentionList.isVisible())
        const panelBox = await page.locator('.assistant-mention-panel').boundingBox()
        assert(panelBox && panelBox.x >= 0 && panelBox.y >= 0 && panelBox.x + panelBox.width <= viewport.width && panelBox.y + panelBox.height <= viewport.height, `${viewport.name}：@ 菜单不应被视口裁切`)
        await narrowInput.press('Escape')
      }
    }
    results.assistant = { viewports: assistantViewports.map(({ name }) => name), mentions: 'passed', modelSwitch: 'passed' }
  }

  if (selected.has('paldex') || selected.has('shared')) {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openRoute('#/paldex', '帕鲁图鉴')
    const detailTrigger = page.locator('.pal-card').first()
    await detailTrigger.focus()
    await detailTrigger.press('Enter')
    const dialog = page.getByRole('dialog')
    await dialog.waitFor({ state: 'visible' })
    const closeDetail = page.getByRole('button', { name: '关闭详情' })
    await waitFor('详情关闭按钮获得焦点', () => closeDetail.evaluate((element) => element === document.activeElement))
    const focusTooltip = page.getByRole('tooltip')
    await focusTooltip.waitFor({ state: 'visible' })
    assert(await focusTooltip.textContent() === '关闭详情', '图标按钮聚焦时应显示文字提示')
    assert((await closeDetail.getAttribute('aria-describedby'))?.includes(await focusTooltip.getAttribute('id')), 'tooltip 应与按钮建立 aria-describedby 关联')
    assert(await page.evaluate(() => document.body.style.overflow === 'hidden'), '详情弹窗打开时应锁定 body 滚动')
    await closeDetail.press('Shift+Tab')
    assert(await dialog.evaluate((element) => element.contains(document.activeElement)), 'Shift+Tab 不应逃出详情弹窗')
    await focusTooltip.waitFor({ state: 'detached' })

    const hoverFilterBefore = await closeDetail.evaluate((element) => getComputedStyle(element).filter)
    await closeDetail.hover()
    await page.waitForTimeout(400)
    const hoverTooltip = page.getByRole('tooltip')
    await hoverTooltip.waitFor({ state: 'visible' })
    const hoverFilterAfter = await closeDetail.evaluate((element) => getComputedStyle(element).filter)
    assert(hoverFilterAfter !== hoverFilterBefore, '可用按钮 hover 时应获得明确视觉反馈')

    const detailScroll = page.getByRole('region', { name: '帕鲁详情' })
    const skillScroll = page.getByRole('complementary', { name: '主动技能' })
    assert(await detailScroll.evaluate((element) => element.scrollHeight > element.clientHeight), '详情主栏应拥有独立滚动空间')
    assert(await skillScroll.evaluate((element) => element.scrollHeight > element.clientHeight), '主动技能栏应拥有独立滚动空间')
    await skillScroll.hover()
    await hoverTooltip.waitFor({ state: 'detached' })
    await page.mouse.wheel(0, 720)
    await waitFor('主动技能滚轮滚动', () => skillScroll.evaluate((element) => element.scrollTop > 0))
    await page.screenshot({ path: `${artifactRoot}/detail-dialog.png`, animations: 'disabled' })
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
    await waitFor('详情关闭后恢复触发卡片焦点', () => detailTrigger.evaluate((element) => element === document.activeElement))
    assert(await page.evaluate(() => document.body.style.overflow !== 'hidden'), '详情关闭后应恢复 body 滚动')
    results.detailFocusAndScroll = 'passed'
  }

  if (selected.has('breeding') || selected.has('shared')) {
    await page.setViewportSize({ width: 800, height: 720 })
    await openRoute('#/breeding/solution', '配种工具')
    const openBag = page.getByRole('button', { name: '打开配方背包' })
    await openBag.click()
    const bag = page.locator('#relation-bag')
    const closeBag = page.getByRole('button', { name: '关闭配方背包' })
    await waitFor('窄屏背包关闭按钮获得焦点', () => closeBag.evaluate((element) => element === document.activeElement))
    assert(await page.evaluate(() => document.body.style.overflow === 'hidden'), '窄屏配方背包打开时应锁定 body 滚动')
    assert(await bag.getAttribute('aria-hidden') !== 'true', '打开的配方背包不应对辅助技术隐藏')
    await closeBag.press('Shift+Tab')
    assert(await bag.evaluate((element) => element.contains(document.activeElement)), '窄屏背包焦点不应逃出抽屉')
    await page.screenshot({ path: `${artifactRoot}/narrow-recipe-bag.png`, animations: 'disabled' })
    await page.keyboard.press('Escape')
    await waitFor('窄屏背包关闭并恢复焦点', async () => (
      await bag.getAttribute('aria-hidden') === 'true' &&
      await openBag.evaluate((element) => element === document.activeElement)
    ))
    assert(await bag.evaluate((element) => element.inert), '关闭的窄屏配方背包必须 inert')
    assert(await page.evaluate(() => document.body.style.overflow !== 'hidden'), '窄屏背包关闭后应恢复 body 滚动')
    await assertNoRootOverflow('800x720 配方方案网')
    results.drawerFocus = 'passed'
  }

  if (selected.has('breeding')) {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openRoute('#/breeding/forward', '配种工具')
    const recipe = await page.evaluate(async () => {
      const response = await fetch('./data/breeding-index.json')
      if (!response.ok) throw new Error(`无法读取配种索引：HTTP ${response.status}`)
      const index = await response.json()
      const recipeIndex = index.recipes.findIndex(([parentA, parentB, child]) => (
        parentA !== parentB && child !== parentA && child !== parentB
      ))
      if (recipeIndex < 0) throw new Error('配种索引中没有可用于图形网回归的配方')
      const [parentA, parentB, child] = index.recipes[recipeIndex]
      return {
        recipeIndex,
        parentAId: index.palIds[parentA],
        parentBId: index.palIds[parentB],
        childId: index.palIds[child],
      }
    })
    const parentQuery = `#/breeding/forward?parentA=${encodeURIComponent(recipe.parentAId)}&parentB=${encodeURIComponent(recipe.parentBId)}`
    await openRoute(parentQuery, '配种工具')
    const addToBag = page.getByRole('button', { name: '加入配方背包' }).first()
    await waitFor('配方背包完成载入', () => addToBag.isEnabled())
    await addToBag.click()
    await page.getByRole('button', { name: '已加入配方背包' }).first().waitFor({ state: 'visible' })

    await openRoute('#/breeding/solution', '配种工具')
    const addToPlan = page.getByRole('button', { name: `加入当前方案配方 ${recipe.recipeIndex}` })
    await addToPlan.waitFor({ state: 'visible' })
    await addToPlan.click()
    await waitFor('配方加入当前方案', async () => await addToPlan.isDisabled())
    await page.getByRole('radio', { name: '图形网', exact: true }).click()
    const graphCanvas = page.locator('.graph-canvas')
    await graphCanvas.waitFor({ state: 'visible' })
    await waitFor('Worker 图形布局节点', async () => await page.locator('.react-flow__node').count() >= 4, 30_000)
    await page.getByRole('button', { name: '适应视图' }).click()
    await page.waitForTimeout(300)

    const graphState = await page.locator('.react-flow__node').evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect()
      return { id: node.getAttribute('data-id'), y: rect.top + rect.height / 2 }
    }))
    const positions = new Map(graphState.map((item) => [item.id, item.y]))
    const parentY = [positions.get(`pal:${recipe.parentAId}`), positions.get(`pal:${recipe.parentBId}`)]
    const junctionY = positions.get(`recipe:${recipe.recipeIndex}`)
    const childY = positions.get(`pal:${recipe.childId}`)
    assert(parentY.every(Number.isFinite), `图形网缺少亲本节点：${JSON.stringify(graphState)}`)
    assert(Number.isFinite(junctionY) && Number.isFinite(childY), `图形网缺少汇合点或子代：${JSON.stringify(graphState)}`)
    assert(parentY.every((value) => value < junctionY), '图形网亲本必须位于配方汇合点上方')
    assert(junctionY < childY, '图形网配方汇合点必须位于子代上方')
    const zoom = await page.locator('.react-flow__viewport').evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a)
    assert(zoom <= 1.001, `适应视图不应放大超过 1 倍，当前为 ${zoom}`)
    assert(await page.getByRole('button', { name: `从方案移除配方 ${recipe.recipeIndex}` }).count() === 1, '图形网应显示唯一配方输出标签')
    await assertNoRootOverflow('Worker 图形网')
    await assertVisibleImages('Worker 图形网')
    await page.screenshot({ path: `${artifactRoot}/breeding-graph.png`, animations: 'disabled' })

    assert(workers.length > 0, '图形布局应实际创建 Worker')
    results.graph = { recipeIndex: recipe.recipeIndex, workers: workers.length, zoom }
  }
  assert(externalRequests.length === 0, `出现第三方运行时请求：${[...new Set(externalRequests)].join(', ')}`)
  assert(pageErrors.length === 0, `页面脚本错误：${pageErrors.join(' | ')}`)
  assert(consoleIssues.length === 0, `浏览器 console warning/error：${consoleIssues.join(' | ')}`)


  return { status: 'passed', scenes, ...results, thirdPartyRequests: externalRequests.length, consoleIssues: consoleIssues.length }
}
