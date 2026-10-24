import json
from playwright.sync_api import sync_playwright
SP = '/tmp/claude-0/-home-claude/824559b2-0be6-5435-9f8b-8209cb915940/scratchpad'
XLSX = SP + '/npm/node_modules/xlsx/dist/xlsx.full.min.js'
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1400, 'height': 900})
    ctx.route('**/*', lambda r: (r.fulfill(path=XLSX, content_type='application/javascript') if 'xlsx.full.min.js' in r.request.url
        else r.abort() if r.request.url.startswith('http') else r.continue_()))
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/fellowship_site/dist/index.html'); pg.wait_for_selector('#emptyState:not([hidden])')
    # legacy tracker migration
    pg.evaluate("localStorage.setItem('fdf.tracker.v1', JSON.stringify({'zz-old':{status:'Skip',notes:'gone'},'yy-old':{status:'Emailed',notes:''}}))")
    pg.reload(); pg.wait_for_selector('#emptyState:not([hidden])')
    t = pg.evaluate("JSON.parse(localStorage.getItem('fdf.tracker.v1'))")
    ok(t['zz-old']['status']=='Not Interested' and t['yy-old']['status']=='Started', 'migration Skip/Emailed')
    pg.set_input_files('#fileInput', SP + '/test_week1.xlsx'); pg.wait_for_selector('#tbody tr.data')
    cnt = lambda: pg.evaluate("[...document.querySelectorAll('.tab .n')].map(e=>e.textContent)")
    c0 = cnt(); print(c0)
    ok(pg.locator('#orphanBar').is_visible(), 'orphan bar visible (2 old entries)')
    ok(not pg.locator('#statusChips').is_visible(), 'status chips hidden when none')
    # status header
    ok('Status' in pg.inner_text('thead tr:first-child') and 'My status' not in pg.inner_text('thead tr:first-child'), 'column renamed')
    opts = pg.eval_on_selector('select[data-flt=status]', 'e=>[...e.options].map(o=>o.textContent)'); print(opts)
    ok(len(opts)==6, 'status filter lists all statuses')
    pg.select_option('#tbody tr.data:first-child select.st', 'Started')
    ok(pg.locator('#statusChips').is_visible() and 'Started' in pg.inner_text('#statusChips'), 'chip appears after status set')
    ok('Started (1)' in pg.eval_on_selector('select[data-flt=status]', 'e=>[...e.options].map(o=>o.textContent).join("|")'), 'filter options refreshed with count')
    pg.click('#statusChips [data-stat=Started]')
    ok(pg.locator('#tbody tr.data').count()==1, 'chip filters to 1 row')
    pg.click('#clearBtn')
    # verify tab
    pg.click('#tab-verify'); pg.wait_for_selector('#tbody tr.data')
    head = pg.inner_text('thead tr:first-child'); ok('Status' not in head and 'Review' in head, 'verify: no Status, has Review')
    nv = int(c0[1]); name = pg.inner_text('#tbody tr.data:first-child .t').split('\n')[0]; why0 = None
    pg.click('#tbody tr.data:first-child [data-decide=shortlist]')
    c1 = cnt(); print(c1)
    ok(int(c1[1])==nv-1 and int(c1[0])==int(c0[0])+1, 'move to shortlist updates counts')
    ok(pg.locator('#toast .undo').is_visible(), 'undo toast')
    pg.click('#toast .undo'); c2 = cnt(); ok(c2==c0, 'undo restores counts')
    pg.click('#tbody tr.data:first-child [data-decide=excluded]')
    pg.click('#tab-excluded'); pg.fill('#globalSearch', name)
    pg.click('#tbody tr.data:first-child .tog'); pg.wait_for_selector('tr.detail')
    d = pg.inner_text('tr.detail'); print(d[:300].replace('\n',' | '))
    ok('Moved by you to Excluded' in d and 'Original reason' in d and d.count('You moved this')==1, 'detail shows decision + original reason')
    # persist across upload of week2
    pg.fill('#globalSearch','')
    pg.set_input_files('#fileInput', SP + '/test_week2.xlsx')
    pg.wait_for_function("document.querySelector('#sourceLine').textContent.includes('test_week2.xlsx')")
    pg.click('#tab-excluded'); pg.fill('#globalSearch', name)
    ok(pg.locator('#tbody tr.data').count()==1, 'decision persisted after new upload')
    pg.click('#tab-verify'); pg.fill('#globalSearch', name)
    ok(pg.locator('#tbody tr.data').count()==0, 'not back in Needs verification')
    # csv export has group cols
    pg.click('#tab-excluded'); pg.click('#exportBtn'); csv = pg.input_value('#csvText')
    ok('Group (after your decisions)' in csv.split('\n')[0] and 'Moved to Excluded' in csv, 'csv has decision columns')
    pg.click('#mClose')
    # orphans: attach
    pg.fill('#globalSearch','')
    pg.click('#orphanBtn'); ok(pg.locator('.orphan-item').count()==2, 'orphan modal lists 2')
    pg.locator('[data-orph-del]').first.click(); pg.locator('[data-orph-del]').first.click()
    ok(pg.locator('.orphan-item').count()==1, 'orphan delete (2-click)')
    pg.select_option('.orphan-item select', index=1); pg.click('[data-orph-attach]')
    ok(not pg.locator('#orphanBar').is_visible(), 'orphan attach clears bar')
    # not-interested chip
    pg.click('#tab-shortlist'); pg.select_option('#tbody tr.data:first-child select.st', 'Not Interested')
    n1 = pg.locator('#tbody tr.data').count(); pg.click('[data-quick=hideNI]')
    ok(pg.locator('#tbody tr.data').count()==n1-1, 'Hide Not Interested works')
    ok(not errs, 'no page errors ' + str(errs))
    b.close()
