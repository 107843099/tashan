const fs=require('node:fs');
const esbuild=require('esbuild');
(async()=>{
  await esbuild.build({entryPoints:['pinhole.js'],bundle:true,minify:true,format:'iife',target:'es2020',outfile:'assets/pinhole.bundle.js',loader:{'.png':'dataurl'},legalComments:'eof'});
  fs.mkdirSync('dist/assets',{recursive:true});
  for(const file of ['index.html','pinhole.html','pinhole.css']) fs.copyFileSync(file,'dist/'+file);
  for(const file of ['candle-v2.png','pinhole.bundle.js']) fs.copyFileSync('assets/'+file,'dist/assets/'+file);
  fs.copyFileSync('node_modules/three/LICENSE','dist/assets/three-LICENSE.txt');
  fs.copyFileSync('使用说明.txt','dist/使用说明.txt');
  console.log('Built local and dist pages. All runtime assets are local; no network needed.');
})().catch(e=>{console.error(e);process.exit(1)});
