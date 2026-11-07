import {readFileSync} from 'node:fs';
/** Source-level CSS assertions must load the same ordered rules as Vite. */
export function readAppStyles(){
 const manifest=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
 const imports=[...manifest.matchAll(/^@import '\.\/styles\/([^']+\.css)';$/gm)];
 if(!imports.length)throw Error('No CSS feature modules declared');
 return imports.map(([,file])=>readFileSync(
  new URL('../src/styles/'+file,import.meta.url),'utf8')).join('\n');
}
