import sys, json, datetime as dt
sys.path.insert(0, '/home/claude/fellowship_tool')
import fellowship_filter as ff
prof = ff.load_profile('/home/claude/fellowship_tool/profile.yaml')
sheets = ff.read_any(sys.argv[1])
rows, w, h = ff.build_rows(sheets[ff.choose_sheet(sheets)])
today = dt.date.fromisoformat(sys.argv[2])
res = ff.process(rows, prof, today)
out = {}
for r in res:
    d = r['deadline']
    out[r['row']['id']] = dict(
        bucket=r['bucket'], why='; '.join(f"{a}: {b}" for a, b in r['reasons']),
        tier=d['tier'], deadline=d['next'].isoformat() if d['next'] else '', note=d['note'],
        pay=r['pay']['label'], payRank=r['pay']['rank'], payDetail=r['pay']['detail'],
        loc=r['loc']['label'], keyReq=r['key_req'], flags='; '.join(r['flags']),
        components=r['components'], skills=', '.join(r['skills']),
        avail=r['status']['label'] + (f" [{r['status']['cycle']}]" if r['status']['cycle'] else ''),
        length=r['years']['text'], apply=r['apply'])
json.dump(out, open(sys.argv[3], 'w'), indent=1)
print(len(out), 'rows')
