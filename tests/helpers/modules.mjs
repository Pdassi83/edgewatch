import fs from 'node:fs';
import ts from 'typescript';
export const encode=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext})).toString('base64');
export const core=encode(fs.readFileSync('lib/core.ts','utf8'));
export const observability=encode(fs.readFileSync('lib/observability.ts','utf8').replace("from './core'",`from '${core}'`));
