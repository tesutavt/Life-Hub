from pathlib import Path
path = Path(r"client/src/pages/DailyMissions.tsx")
text = path.read_text(encoding="utf-8")
old_line = '      <div className="flex flex-wrap items-center justify-between gap-6 rounded-3xl border border-white/10 bg-white/5 p-6">'
new_line = '      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">\r\n        <div className="flex flex-wrap items-center justify-between gap-6 rounded-3xl border border-white/10 bg-white/5 p-6">'
if old_line not in text:
    raise SystemExit('target line not found for header replacement')
text = text.replace(old_line, new_line, 1)
old_footer = '        </div>\r\n      )}\r\n    </Shell>'
new_footer = '        </div>\r\n      )}\r\n      </div>\r\n    </Shell>'
if old_footer not in text:
    raise SystemExit('footer pattern not found')
text = text.replace(old_footer, new_footer, 1)
path.write_text(text, encoding="utf-8")
