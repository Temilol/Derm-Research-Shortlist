from playwright.sync_api import sync_playwright
SP = '/tmp/claude-0/-home-claude/824559b2-0be6-5435-9f8b-8209cb915940/scratchpad'
XLSX = SP + '/npm/node_modules/xlsx/dist/xlsx.full.min.js'
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    for scheme, w in [('dark', 894), ('light', 1200)]:
        ctx = b.new_context(viewport={'width': w, 'height': 800}, color_scheme=scheme, device_scale_factor=2)
        ctx.route('**/*', lambda r: (r.fulfill(path=XLSX, content_type='application/javascript') if 'xlsx.full.min.js' in r.request.url
            else r.abort() if r.request.url.startswith('http') else r.continue_()))
        pg = ctx.new_page(); pg.goto('file:///home/claude/fellowship_site/dist/index.html'); pg.wait_for_selector('#emptyState:not([hidden])')
        pg.set_input_files('#fileInput', SP + '/test_week1.xlsx'); pg.wait_for_selector('#tbody tr.data')
        print(scheme, w, pg.evaluate("""() => { const f = document.querySelector('#frame'), t = document.querySelector('#tbl');
          return {frameW: f.clientWidth, tableW: t.scrollWidth}; }"""))
        for sl in [0, 40, 150]:
            pg.evaluate(f"document.querySelector('#frame').scrollLeft = {sl}")
            pg.wait_for_timeout(60)
            # which element is on top at the State filter's left edge and header cell, when it sits under the pinned column?
            res = pg.evaluate("""() => {
              const pin = document.querySelector('thead tr.filters th.sticky').getBoundingClientRect();
              const out = [];
              for (const sel of ['thead tr.filters th:nth-child(2)', 'thead tr:first-child th:nth-child(2)']) {
                const r = document.querySelector(sel).getBoundingClientRect();
                const x = Math.min(pin.right - 6, r.right - 2), y = r.top + r.height / 2;
                if (r.left < pin.right) { const el = document.elementFromPoint(x, y); out.push(sel.split(' ').pop() + ' hidden-part-top=' + (el && el.closest('th') ? (el.closest('th').classList.contains('sticky') ? 'PINNED(ok)' : 'OTHER(BUG)') : 'none')); }
              }
              return out; }""")
            print('  scrollLeft', sl, res)
        pg.evaluate("document.querySelector('#frame').scrollLeft = 40")
        box = pg.eval_on_selector('#frame', 'e => { const r = e.getBoundingClientRect(); return {y:r.y}; }')
        pg.screenshot(path=f'{SP}/repro_{scheme}.png', clip={'x': 0, 'y': box['y'] - 4, 'width': w, 'height': 210})
        ctx.close()
    b.close()
