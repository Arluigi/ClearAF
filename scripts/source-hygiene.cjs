const {execFileSync}=require('node:child_process');
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const forbidden=files.filter(f=>/(^|\/)node_modules\//.test(f)||/(^|\/)\.env($|\.(?!example$))/.test(f)||f.endsWith('Local.generated.xcconfig')||f.startsWith('.local/'));
if(forbidden.length){console.error('Generated dependencies or credentials are tracked');process.exitCode=1}else console.log('Source hygiene passed');
