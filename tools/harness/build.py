"""Build the local harness pages.

python tools/harness/build.py [path to KinetixCRM Backup.json]

Writes _harness.html (the app) and _harness_migrate.html (the migration page) at the repo root, both
gitignored: the Firebase, Google Identity and MSAL script tags are replaced by tools/harness/firebase-stub.js.
Copies the backup JSON into tools/harness/data/ (gitignored) when a path is given. Serve the repo root with
tools/harness/serve.py and open http://localhost:8765/_harness.html?mode=sharded (new layout), ?mode=blob
(old layout) or _harness_migrate.html?mode=blob (migration against the old layout).
"""
import os, re, shutil, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DROP = re.compile(r'^<script[^>]*(?:gstatic\.com/firebasejs|accounts\.google\.com/gsi|apis\.google\.com/js/api|msal)[^\n]*\n', re.M)
STUB = '<script src="tools/harness/firebase-stub.js"></script>\n'

html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
html, n = DROP.subn('', html)
html = html.replace('<link rel="stylesheet" href="styles.css">', STUB + '<link rel="stylesheet" href="styles.css">', 1)
html = html.replace('<title>', '<title>[harness] ', 1)
open(os.path.join(ROOT, '_harness.html'), 'w', encoding='utf-8', newline='\n').write(html)
print('removed %d script tags, wrote _harness.html' % n)

mig = open(os.path.join(ROOT, 'tools', 'migrate.html'), encoding='utf-8').read()
mig, m = DROP.subn('', mig)
mig = mig.replace('<style>', STUB + '<style>', 1).replace("from '../src/", "from './src/")
open(os.path.join(ROOT, '_harness_migrate.html'), 'w', encoding='utf-8', newline='\n').write(mig)
print('removed %d script tags, wrote _harness_migrate.html' % m)

if len(sys.argv) > 1:
    dst = os.path.join(ROOT, 'tools', 'harness', 'data')
    os.makedirs(dst, exist_ok=True)
    shutil.copy(sys.argv[1], os.path.join(dst, 'KinetixCRM Backup.json'))
    print('copied data')
