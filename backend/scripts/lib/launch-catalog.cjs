// Catalog identities are basenames in the immutable publication directory, never operator paths.
const fs=require('node:fs'),path=require('node:path');
const directory=path.resolve(__dirname,'../../src/content/catalogs');
function catalogPath(version){
 if(typeof version!=='string'||!/^\d+\.\d+-[a-z][a-z0-9-]*$/.test(version))throw Error('Invalid catalog version');
 const candidate=path.join(directory,version+'.json');
 if(!fs.existsSync(candidate)||fs.lstatSync(candidate).isSymbolicLink()||!fs.statSync(candidate).isFile()||fs.realpathSync(candidate)!==candidate)throw Error('Unknown catalog version');
 return candidate;
}
function readCatalog(version){
 const file=catalogPath(version);if(fs.statSync(file).size>500000)throw Error('Catalog too large');
 const source=JSON.parse(fs.readFileSync(file,'utf8'));
 if(source.versionLabel!==version)throw Error('Catalog identity mismatch');
 return source;
}
function parseImportArgs(args){
 const result={apply:false},seen=new Set();
 for(let i=0;i<args.length;i++){
  const flag=args[i];if(seen.has(flag)||!['--catalog-version','--clinician-id','--apply'].includes(flag))throw Error('Invalid import arguments');seen.add(flag);
  if(flag==='--apply'){result.apply=true;continue;}
  const value=args[++i];if(!value||value.startsWith('--'))throw Error('Missing import argument');
  result[flag==='--catalog-version'?'catalogVersion':'clinicianId']=value;
 }
 catalogPath(result.catalogVersion);require('zod').z.string().uuid().parse(result.clinicianId);
 return {catalogVersion:result.catalogVersion,clinicianId:result.clinicianId,apply:result.apply};
}
module.exports={catalogPath,readCatalog,parseImportArgs};
