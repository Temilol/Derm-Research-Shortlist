from playwright.sync_api import sync_playwright
SP = '/tmp/claude-0/-home-claude/824559b2-0be6-5435-9f8b-8209cb915940/scratchpad'
XLSX = SP + '/npm/node_modules/xlsx/dist/xlsx.full.min.js'
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 900})
    ctx.route('**/*', lambda r: (r.fulfill(path=XLSX, content_type='application/javascript') if 'xlsx.full.min.js' in r.request.url
        else r.abort() if r.request.url.startswith('http') else r.continue_()))
    pg = ctx.new_page(); pg.goto('file:///home/claude/fellowship_site/dist/index.html'); pg.wait_for_selector('#tbody tr.data')
    pg.screenshot(path=SP + '/before_upload.png', clip={'x': 0, 'y': 0, 'width': 1440, 'height': 330})
    pg.set_input_files('#fileInput', SP + '/test_week2.xlsx')
    pg.wait_for_function("document.querySelector('#sourceLine').textContent.includes('test_week2.xlsx')")
    print(pg.inner_text('#sourceLine'))
    pg.screenshot(path=SP + '/after_upload.png', clip={'x': 0, 'y': 0, 'width': 1440, 'height': 330})
    b.close()
