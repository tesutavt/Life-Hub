from pathlib import Path
path = Path("client/src/pages/ProfileFull.tsx")
text = path.read_text(encoding="utf-8")
start_token = "            <div className=\"flex items-end gap-4\">"
print('token present:', start_token in text)
if start_token in text:
    idx = text.index(start_token)
    print('index:', idx)
    snippet = text[idx:idx+120]
    print(snippet)
