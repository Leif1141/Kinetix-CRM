// ═══════════════════════════════════════════════════════════════
// ADDRESS: street, postcode and city as separate fields (Leif 04.11.2026). r.address stays the composed line that
// the map, exports and scheduled runs read. Older records hold only r.address; their parts are read from it.
// ═══════════════════════════════════════════════════════════════
const RX=/^\s*(.*?\d+\s*[a-zA-Z]?(?:\s*[-\/]\s*\d+\s*[a-zA-Z]?)?)\s*,\s*(?:D-\s*)?(\d{4,5})\s+([^,;|]+)/;
// a street counts only with a house number
export const hasHouseNo=s=>/\D\s*\d+\s*[a-zA-Z]?\b/.test(s||'')&&/[A-Za-zÄÖÜäöüß]{3}/.test(s||'')&&!/postfach|p\.?\s?o\.?\s?box/i.test(s||'');
// "42799 Leichlingen" without a street: postcode and city only
const RX_TOWN=/^\s*(?:D-\s*)?(\d{5})\s+([^,;|\d]+)/;
export function addrParts(r){
  if(!r)return {street:'',zip:'',city:''};
  let m=String(r.address||'').match(RX);
  if(!m){const t=String(r.address||'').match(RX_TOWN);if(t)m=[t[0],'',t[1],t[2]]}
  const street=r.street!=null&&r.street!==''?r.street:(m?m[1].trim():(hasHouseNo(r.address)&&!/,/.test(r.address||'')?String(r.address).trim():''));
  const zip=r.zip!=null&&r.zip!==''?r.zip:(m?m[2]:'');
  const city=r.city||(m?m[3].trim():'')||(r.kind==='target'?(r.location||'').replace(/,.*$/,'').trim():'');
  return {street:hasHouseNo(street)?street:'',zip,city,rawStreet:street};
}
export function composeAddress(p){
  const tail=[p.zip,p.city].filter(Boolean).join(' ');
  return [p.street,tail].filter(Boolean).join(', ');
}
// write one part, keep the others as they were read, recompose the line
export function setAddrPart(r,key,v){
  const p=addrParts(r);const cur={street:p.rawStreet||'',zip:p.zip||'',city:p.city||''};
  cur[key]=v;r.street=cur.street;r.zip=cur.zip;r.city=cur.city;
  r.address=composeAddress(cur);
}
