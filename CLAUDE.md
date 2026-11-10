# KinetixCRM

Static ES-module app, Firebase RTDB, deployed by GitHub Pages from main. A push to main is a release: push only on Leif's go.
The repo is public: no CRM data, names or contact details in code, tests or commit messages.

## Verify before every commit
1. `python tools/harness/build.py`
2. `python tools/harness/serve.py 8765`
3. Open `http://localhost:8765/_harness.html?check=1` and read the result list.

Known failures unrelated to code: stale tab, field edit write, phase 0 patch, Import dialog. Any other failure blocks the commit.
