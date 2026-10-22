"""Generate database.rules.json from the allow-lists in src/config.js.

python tools/rules.py            writes database.rules.json
python tools/rules.py --check    exits 1 if database.rules.json is out of date

ALLOWED_EMAILS may read and write the CRM collections; ADMIN_EMAILS additionally write crm/dash and own
crm_legacy and crm-config. Change an address in src/config.js, run this script, paste the file into the
Firebase console.
"""
import json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cfg = open(os.path.join(ROOT, 'src', 'config.js'), encoding='utf-8').read()
def emails(name):
    m = re.search(r"export const %s\s*=\s*\[([^\]]*)\]" % name, cfg)
    if not m: raise SystemExit('%s not found in src/config.js' % name)
    return re.findall(r"'([^']+)'", m.group(1))
allowed, admin = emails('ALLOWED_EMAILS'), emails('ADMIN_EMAILS')
def cond(lst): return 'auth != null && (' + ' || '.join("auth.token.email === '%s'" % e for e in lst) + ')'
rules = {"rules": {".read": False, ".write": False,
  "crm": {".read": cond(allowed)},
  "crm_legacy": {".read": cond(admin), ".write": cond(admin)},
  "crm-config": {".read": cond(admin), ".write": cond(admin)}}}
for coll in ['companies', 'advisors', 'people', 'touches', 'threads', 'inbox', 'meta']:
    rules['rules']['crm'][coll] = {".write": cond(allowed)}
rules['rules']['crm']['dash'] = {".write": cond(admin)}
out = json.dumps(rules, indent=2) + '\n'
path = os.path.join(ROOT, 'database.rules.json')
if '--check' in sys.argv:
    cur = open(path, encoding='utf-8').read() if os.path.exists(path) else ''
    sys.exit(0 if cur == out else 1)
open(path, 'w', encoding='utf-8', newline='\n').write(out)
print('database.rules.json written: allowed %s, admin %s' % (allowed, admin))
