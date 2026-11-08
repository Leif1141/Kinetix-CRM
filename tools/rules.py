"""Generate database.rules.json from the allow-lists in src/config.js.

python tools/rules.py            writes database.rules.json
python tools/rules.py --check    exits 1 if database.rules.json is out of date

ALLOWED_EMAILS (verified Google sign-ins) read and write crm. OWNER_EMAIL alone owns crm-config (the Drive
proxy secret) and crm_legacy (the pre-migration copy). Same content as the rules file on main, plus the
crm_legacy node the migration page needs. Change an address in src/config.js, run this script, paste the
file into the Firebase console.
"""
import json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cfg = open(os.path.join(ROOT, 'src', 'config.js'), encoding='utf-8').read()
def emails(name):
    m = re.search(r"export const %s\s*=\s*\[([^\]]*)\]" % name, cfg)
    if not m: raise SystemExit('%s not found in src/config.js' % name)
    return re.findall(r"'([^']+)'", m.group(1))
m = re.search(r"export const OWNER_EMAIL\s*=\s*'([^']+)'", cfg)
if not m: raise SystemExit('OWNER_EMAIL not found in src/config.js')
owner, allowed = m.group(1), emails('ALLOWED_EMAILS')
users = "auth != null && auth.token.email_verified == true && (" + ' || '.join("auth.token.email == '%s'" % e for e in allowed) + ")"
owner_only = "auth != null && auth.token.email == '%s'" % owner
rules = {"rules": {
  "crm": {".read": users, ".write": users},
  "crm-config": {".read": owner_only, ".write": owner_only},
  "crm_legacy": {".read": owner_only, ".write": owner_only}}}
out = json.dumps(rules, indent=2) + '\n'
path = os.path.join(ROOT, 'database.rules.json')
if '--check' in sys.argv:
    cur = open(path, encoding='utf-8').read() if os.path.exists(path) else ''
    sys.exit(0 if cur == out else 1)
open(path, 'w', encoding='utf-8', newline='\n').write(out)
print('database.rules.json written: users %s, owner %s' % (allowed, owner))
