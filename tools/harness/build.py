"""Build the local harness page.

python tools/harness/build.py [path to KinetixCRM Backup.json]

Writes _harness.html at the repo root (gitignored): index.html with the Firebase, Google Identity and MSAL
script tags replaced by tools/harness/firebase-stub.js. Copies the backup JSON into tools/harness/data/
(gitignored) when a path is given. Serve the repo root with tools/harness/serve.py and open
http://localhost:8765/_harness.html
"""
import os, re, shutil, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
drop = re.compile(r'^<script[^>]*(?:gstatic\.com/firebasejs|accounts\.google\.com/gsi|apis\.google\.com/js/api|msal)[^\n]*\n', re.M)
html, n = drop.subn('', html)
html = html.replace('<link rel="stylesheet" href="styles.css">', '<script src="tools/harness/firebase-stub.js"></script>\n<link rel="stylesheet" href="styles.css">', 1)
html = html.replace('<title>', '<title>[harness] ', 1)
open(os.path.join(ROOT, '_harness.html'), 'w', encoding='utf-8', newline='\n').write(html)
print('removed %d script tags, wrote _harness.html' % n)
if len(sys.argv) > 1:
    dst = os.path.join(ROOT, 'tools', 'harness', 'data')
    os.makedirs(dst, exist_ok=True)
    shutil.copy(sys.argv[1], os.path.join(dst, 'KinetixCRM Backup.json'))
    print('copied data')
