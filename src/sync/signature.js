// Reads a mail signature into contact fields (Leif 07.11.2026: a reply with a full signature from a
// new firm sat unassigned in Inbox). Returns null unless the sender's full name stands on its own line and a phone
// number or a postal address follows it; the record it feeds is marked for review, never trusted blindly.
const norm=s=>String(s||'').toLowerCase().replace(/[^a-zäöüß ]+/g,' ').replace(/\s+/g,' ').trim();
const sp=s=>String(s||'').replace(/\s+/g,' ').trim();
const PH=/^(?:t|tel\.?|telefon|phone|fon|p|office|direct|durchwahl)\s*[:.]?\s*(\+?\d[\d\s()\/.-]{6,})$/i;
const MO=/^(?:m|mob\.?|mobil|mobile|handy|cell)\s*[:.]?\s*(\+?\d[\d\s()\/.-]{6,})$/i;
const FX=/^(?:f|fax)\s*[:.]?\s*\+?[\d\s()\/.-]{6,}$/i;
const ADR=/^(.*?[A-Za-zäöüß.]\s?\d+\s?[a-z]?(?:\s?-\s?\d+[a-z]?)?)\s*[,|·]?\s*(?:D-)?(\d{5})\s+([A-ZÄÖÜ][^\d,|·]+)$/;
const ZIPC=/^(?:D-)?(\d{5})\s+([A-ZÄÖÜ][^\d,|·]+)$/;
const STREETL=/^[A-ZÄÖÜ][^@:]*?\s?\d+\s?[a-z]?(?:\s?-\s?\d+[a-z]?)?$/;
const STOP=/^(haftungsausschluss|disclaimer|diese e-?mail|this e-?mail|ust|amtsgericht|registergericht|hrb\b|handelsregister|geschäftsführ(?:er|ung)\s*:|sitz der|am \d{1,2}\.\d{1,2}\.|von:|from:|-{2,}\s*original)/i;
const FIRMISH=/\b(gmbh|ag|kg|se|mbh|ug|e\.?\s?v\.?|partner|partners|consulting|beratung|group|gruppe|holding|capital|bank|kanzlei|& co)\b/i;

export function parseSignature(text,name){
  const nn=norm(name);
  if(!nn||nn.indexOf(' ')<0)return null;
  const lines=String(text||'').split(/\r?\n/).map(l=>{let x=l.replace(/ /g,' ');try{x=decodeURIComponent(x)}catch(e){}return x.trim()}).filter(Boolean);
  const i=lines.findIndex((l,n)=>n>0&&(norm(l)===nn||norm(l).startsWith(nn+' ')));
  if(i<0)return null;
  const out={name:sp(name)},other=[];
  const tail=lines.slice(i+1,i+18);
  for(let j=0;j<tail.length;j++){
    const l=tail[j];let m;
    if(STOP.test(l))break;
    const li=l.match(/https?:\/\/(?:[a-z]+\.)?linkedin\.com\/in\/[^\s<>&"\/]+\/?/i);
    if(li){out.linkedin=li[0];continue}
    if((m=l.match(MO))){if(!out.mobile)out.mobile=sp(m[1]);continue}
    if(FX.test(l))continue;
    if((m=l.match(PH))){if(!out.phone)out.phone=sp(m[1]);continue}
    if((m=l.match(ADR))&&!out.zip){out.street=sp(m[1]);out.zip=m[2];out.city=sp(m[3]);continue}
    if((m=l.match(ZIPC))&&!out.zip){out.zip=m[1];out.city=sp(m[2]);const prev=other[other.length-1];if(prev&&STREETL.test(prev)){out.street=prev;other.pop()}continue}
    if(/@|www\.|https?:/i.test(l))continue;
    if(/[a-zäöü]/i.test(l)&&l.length<90)other.push(l);
  }
  if(!(out.phone||out.mobile||out.zip))return null;
  if(other.length>=2){out.title=other[0];out.firm=other[1]}
  else if(other.length===1){if(FIRMISH.test(other[0]))out.firm=other[0];else out.title=other[0]}
  if(out.firm)out.firm=out.firm.replace(/[.\s]+$/,'');
  return out;
}
// "mittelstand-denken.de" -> "Mittelstand Denken", the name used when the signature names no firm
export function firmFromDomain(dom){
  const base=String(dom||'').split('.').slice(0,-1).join(' ').replace(/[-_]+/g,' ');
  return base.replace(/\b\w/g,c=>c.toUpperCase());
}
