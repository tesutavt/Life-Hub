// Запускает Electron, гарантированно сбрасывая ELECTRON_RUN_AS_NODE: эту переменную
// выставляют VS Code и некоторые терминалы, и тогда Electron стартует как обычный Node.
const { spawn } = require('child_process');
const electronPath = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ['.', ...process.argv.slice(2)], { cwd: __dirname, env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
