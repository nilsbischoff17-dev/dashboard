"""Lokaler Entwicklungsserver: python tools/serve.py [port]  (Standard: 8080)

Wie `python -m http.server`, aber mit festen MIME-Typen (unter Windows liefert die Registry
für .js manchmal text/plain, dann laden ES-Module nicht) und ohne Browser-Cache.
"""
import functools
import http.server
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".webmanifest": "application/manifest+json",
        ".json": "application/json",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    handler = functools.partial(Handler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(("localhost", PORT), handler) as httpd:
        print(f"Dashboard läuft auf http://localhost:{PORT}")
        httpd.serve_forever()
