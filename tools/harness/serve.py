"""Static server for the harness: repo root on port 8765, no caching, correct MIME for .js modules."""
import http.server, os, sys, mimetypes
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
mimetypes.add_type('text/javascript', '.js')
mimetypes.add_type('application/json', '.json')
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def log_message(self, fmt, *args):
        if '200' not in str(args): sys.stderr.write('%s\n' % (fmt % args))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
http.server.ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
