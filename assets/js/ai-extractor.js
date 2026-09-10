(() => {
  'use strict';
  const READ_BYTES = 1024 * 1024, TEXT_CHARACTERS = 6000;
  const entities = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
  function decode(text) {
    return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|amp|lt|gt|quot|apos|nbsp);/gi, (whole, code) => {
      if (code[0] !== '#') return entities[code.toLowerCase()] || whole;
      const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2),16) : Number(code.slice(1));
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : ' ';
    });
  }
  // A text-only scanner: never attach untrusted HTML to a DOM, execute scripts,
  // load images or fetch linked resources just to prepare teaching suggestions.
  function tagEnd(source,start) {
    let quote='';
    for(let i=start;i<source.length;i++){
      const ch=source[i];
      if(quote){if(ch===quote)quote='';}
      else if(ch==='"'||ch==="'")quote=ch;
      else if(ch==='>')return i;
    }
    return -1;
  }
  function htmlText(source) {
    const lower=source.toLowerCase(),pieces=[];let cursor=0;
    while(cursor<source.length){
      const open=source.indexOf('<',cursor);
      if(open<0){pieces.push(source.slice(cursor));break;}
      pieces.push(source.slice(cursor,open));
      if(source.startsWith('<!--',open)){const close=source.indexOf('-->',open+4);cursor=close<0?source.length:close+3;continue;}
      const close=tagEnd(source,open+1);if(close<0)break;
      const tag=source.slice(open+1,Math.min(close,open+80)).match(/^\s*([a-z0-9]+)/i)?.[1]?.toLowerCase();
      if(['script','style','template','noscript','svg'].includes(tag)){
        let end=lower.indexOf('</'+tag,close+1);
        while(end>=0&&!/[\s/>]/.test(lower[end+tag.length+2]||''))end=lower.indexOf('</'+tag,end+tag.length+2);
        const endClose=end<0?-1:tagEnd(source,end+tag.length+2);
        cursor=endClose<0?source.length:endClose+1;
      }else{pieces.push(' ');cursor=close+1;}
    }
    return decode(pieces.join(' '));
  }
  function cancelled(signal){if(signal?.aborted)throw new DOMException('Cancelled','AbortError');}
  async function extract(file,{signal}={}) {
    cancelled(signal);
    if(!file||typeof file.slice!=='function')return {text:'',supported:false,truncated:false};
    if(file.size>10*1024*1024)throw Object.assign(new Error('项目文件不能超过 10 MB。'),{code:'FILE_TOO_LARGE'});
    const extension=String(file.name||'').split('.').pop().toLowerCase();
    if(!['html','htm','md','markdown','txt','json'].includes(extension))return {text:'',supported:false,truncated:false};
    const source=await file.slice(0,READ_BYTES).text();cancelled(signal);
    const content=(['html','htm'].includes(extension)?htmlText(source):source).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
    return {text:content.slice(0,TEXT_CHARACTERS),supported:true,truncated:file.size>READ_BYTES||content.length>TEXT_CHARACTERS};
  }
  window.TashanAIExtract=Object.freeze({extract});
})();
