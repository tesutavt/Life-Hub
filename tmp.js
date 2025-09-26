const fs = require('fs');
const path = 'client/src/pages/PageEditor.tsx';
let text = fs.readFileSync(path, 'utf8');
const pattern = /        <div className="flex gap-2">\r\n[\s\S]*?        <\/div>\r\n      <\/div>/;
const replacement = [
  '        <div className="flex gap-2">',
  '          <button',
  '            type="button"',
  '            onClick={togglePinned}',
  '            className={`px-3 py-2 rounded border border-white/20 ${pinned ? '\\u0062g-amber-400 text-black' : 'bg-white/10 text-white/80 hover:bg-white/15'}`}',
].join('\r\n');
