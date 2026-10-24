import sys, json, re
from playwright.sync_api import sync_playwright
SP = '/tmp/claude-0/-home-claude/824559b2-0be6-5435-9f8b-8209cb915940/scratchpad'
XLSX = SP + '/npm/node_modules/xlsx/dist/xlsx.full.min.js'
page_url = 'file:///home/claude/fellowship_site/dist/index.html'
errors = []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    def new_ctx(w, h, scheme='light'):
        ctx = b.new_context(viewport={'width': w, 'height': h}, color_scheme=scheme)
        ctx.route('**/*', lambda route: (
            route.fulfill(path=XLSX, content_type='application/javascript') if 'xlsx.full.min.js' in route.request.url
            else route.abort() if route.request.url.startswith('http') else route.continue_()))
        return ctx
    ctx = new_ctx(1440, 900)
    pg = ctx.new_page()
    pg.on('console', lambda m: errors.append(('console', m.type, m.text)) if m.type in ('error',) else None)
    pg.on('pageerror', lambda e: errors.append(('pageerror', str(e))))
    pg.goto(page_url)
    pg.wait_for_selector('#emptyState:not([hidden])')
    print('empty state shown:', pg.inner_text('#sourceLine'), '| tabs visible:', pg.is_visible('#tabs'))
    pg.screenshot(path=SP + '/shot_empty.png')
    pg.set_input_files('#fileInput', SP + '/test_week1.xlsx')
    pg.wait_for_selector('#tbody tr.data')
    print('tabs:', pg.eval_on_selector_all('.tab', 'els => els.map(e => e.textContent)'))
    print('rows shown:', pg.inner_text('#count'))
    print('source:', pg.inner_text('#sourceLine')[:260])
    print('chips:', pg.eval_on_selector_all('#chips .chip', 'els => els.map(e => e.textContent)'))
    pg.screenshot(path=SP + '/shot_desktop_light.png')
    # sort by Pay, then back
    pg.click('[data-sort="payLabel"]')
    first = pg.inner_text('#tbody tr.data:first-child .t')
    print('first after pay sort:', first)
    pg.click('[data-sort="payLabel"]'); pg.click('[data-sort="payLabel"]')  # desc then none
    # filter state = MA
    pg.select_option('select[data-flt="state"]', 'MA')
    print('MA filter:', pg.inner_text('#count'))
    # expand first row
    pg.click('#tbody tr.data:first-child .tog')
    pg.wait_for_selector('tr.detail')
    print('detail has sections:', pg.eval_on_selector_all('tr.detail h3', 'els => els.map(e => e.textContent)'))
    pg.fill('textarea[data-track-notes]', 'Emailed Dr. test on Monday')
    pg.select_option('#tbody tr.data:first-child select.st', 'Interested')
    pg.screenshot(path=SP + '/shot_detail.png')
    # global search + clear
    pg.click('#clearBtn'); pg.fill('#globalSearch', 'phlebotomy')
    print('search phlebotomy:', pg.inner_text('#count'))
    pg.fill('#globalSearch', '')
    # tabs
    for t in ['verify', 'excluded', 'changes', 'all']:
        pg.click(f'#tab-{t}')
        print(t, '->', pg.inner_text('#count') or '(no count)', '|', pg.eval_on_selector_all('#tbl thead th', 'els => els.length'), 'cols')
    pg.screenshot(path=SP + '/shot_changes.png')
    # settings: set step3 passed and east coast toggle
    pg.click('#tab-shortlist'); pg.click('#settingsBtn')
    pg.select_option('#s-step3', 'passed')
    pg.screenshot(path=SP + '/shot_settings.png')
    pg.click('#closeSettings')
    # tracker persisted?
    st = pg.evaluate("JSON.parse(localStorage.getItem('fdf.tracker.v1'))")
    print('tracker saved:', st)
    # overflow check
    print('page h-scroll (desktop):', pg.evaluate('document.documentElement.scrollWidth > window.innerWidth'))
    # xlsx upload with real date cells
    up = SP + '/test_week1.xlsx'
    print('after upload:', pg.inner_text('#sourceLine')[:140], '|', [t for t in pg.eval_on_selector_all('.tab', 'els => els.map(e => e.textContent)')])
    # BIDMC row deadline from a real date cell
    pg.fill('#globalSearch', 'Cutaneous Oncology Fellowship')
    print('BIDMC deadline cell:', pg.inner_text('#tbody tr.data:first-child td:nth-child(4)'))
    pg.fill('#globalSearch', '')
    # second upload (week 2) should produce changes
    pg.set_input_files('#fileInput', SP + '/test_week2.xlsx')
    pg.wait_for_function("document.querySelector('#sourceLine').textContent.includes('test_week2.xlsx')")
    pg.click('#tab-changes')
    print('changes tab:', pg.inner_text('#tbl')[:400].replace('\n', ' | '))
    pg.screenshot(path=SP + '/shot_changes2.png')
    # reload: dataset + tracker persist
    pg.reload(); pg.wait_for_selector('#tbody tr.data')
    print('after reload source:', pg.inner_text('#sourceLine')[:90])
    # export modal
    pg.click('#exportBtn'); print('csv header:', pg.input_value('#csvText')[:120]); pg.click('#mClose')
    pg.click('#backupBtn'); bk = pg.input_value('#bkText'); print('backup bytes:', len(bk)); pg.click('#mClose')
    # clear saved file
    pg.click('#backupBtn'); pg.click('#clrBtn'); pg.click('#clrBtn')
    print('after clear:', pg.inner_text('#sourceLine'), '| empty visible:', pg.is_visible('#emptyState'))
    pg.reload(); pg.wait_for_selector('#emptyState:not([hidden])'); print('reload after clear stays empty')
    ctx.close()
    # phone widths, both themes
    for scheme in ['light', 'dark']:
        ctx = new_ctx(400, 820, scheme); pg = ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(('pageerror', str(e))))
        pg.goto(page_url); pg.wait_for_selector('#emptyState:not([hidden])')
        pg.set_input_files('#fileInput', SP + '/test_week1.xlsx'); pg.wait_for_selector('#tbody tr.data')
        print(scheme, 'phone h-scroll:', pg.evaluate('document.documentElement.scrollWidth > window.innerWidth'),
              '| scrollWidth', pg.evaluate('document.documentElement.scrollWidth'))
        pg.screenshot(path=f'{SP}/shot_phone_{scheme}.png')
        ctx.close()
    ctx = new_ctx(1440, 900, 'dark'); pg = ctx.new_page(); pg.goto(page_url); pg.wait_for_selector('#emptyState:not([hidden])')
    pg.set_input_files('#fileInput', SP + '/test_week1.xlsx'); pg.wait_for_selector('#tbody tr.data')
    pg.screenshot(path=SP + '/shot_desktop_dark.png'); ctx.close()
    b.close()
print('ERRORS:', errors)
