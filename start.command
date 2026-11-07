#!/bin/bash
# macOS / Linux: serve this folder on http://localhost:8642 and open it
cd "$(dirname "$0")"
(sleep 1 && (open "http://localhost:8642" 2>/dev/null || xdg-open "http://localhost:8642")) &
python3 -m http.server 8642
