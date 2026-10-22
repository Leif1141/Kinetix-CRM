
// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════
export const STAGES=['Identified','Contacted','Replied','Meeting','NDA','LOI','Diligence','Closed','On hold','Dead'];
export const STAGE_ALIAS={'Info received':'NDA','IOI/LOI':'LOI'};
export const OUTREACH=['','Email','LinkedIn','Letter','Phone call','Trade conference','Advisor outreach','Referral','nexxt-change','Other'];
export const LIVE=STAGES.filter(s=>!['Closed','Dead'].includes(s));
export const ACTIVE_STAGES=['Contacted','Replied','Meeting','NDA','LOI','Diligence']; // a live deal: approached and not yet closed, dead or on hold
export const ADV_STATUS=['To call','Emailed','Contact known','In dialogue','Active relationship','On hold','Dormant','Dead'];
export const ADV_CATS=['M&A sourcing intermediaries','Financing partners','Investors & family office','DD advisors','Legal','Executive search','HR, universities & interns','Chambers & bodies','Industry association','Admin & infrastructure','Personal network','Other'];
export const PTYPES=['','Target contact','M&A sourcing intermediaries','M&A compounders','Financing partners','Investors & family office','DD advisors','Legal','Executive search','Chambers & bodies','Industry association','Industry contact','Operator contact','Personal network','Intern applicant','Admin & infrastructure','Other'];
export const CHANNELS=['','Own letter','Partner letter','M&A house / advisor','Tax adviser / auditor','Trade fair','Own email','LinkedIn','Phone','Network / referral','Platform','Bank','Inbound','Other'];
export const CH_MAP={'Cold email':'Own email','Email':'Own email','Letter':'Own letter','Cold call':'Phone','Phone call':'Phone','Broker':'M&A house / advisor','Advisor outreach':'M&A house / advisor','Referral':'Network / referral','Personal network':'Network / referral','Event':'Trade fair','Trade conference':'Trade fair','nexxt-change':'Platform','Platform':'Platform','Inbound':'Inbound','LinkedIn':'LinkedIn','Other':'Other'};
export const DEADREASONS=['No response','Not for sale','Valuation gap','Too small','Too large','Bad fit','Lost to buyer','Other'];
export const VERDICTS=['','pursue','keep looking','watch','passed'];
export const STALE_DAYS={'Identified':null,'Contacted':7,'Replied':5,'Meeting':7,'NDA':10,'LOI':7,'Diligence':14};
export const MY_ADDR=['leif@kinetixcap.com','leif.berger26@gmail.com','leif@kinetix-industries.de','leif@kinetix-industries.com','tommy@kinetix-industries.com'];
export const ACT_TYPES=['Call','Meeting','Note','Letter','LinkedIn'];
export const PRIORITIES=['','Urgent','High','Medium','Low'];
export const PRIO_COL={'Urgent':'#112149','High':'#2E3C65','Medium':'#6B7AAF','Low':'#A9A4C6'};
export const PRIO_DEF={'Urgent':'act this week','High':'best fit, work actively','Medium':'fits, work when there is room','Low':'keep an eye on it'};
export const LEGAL=/\b(gmbh|co|kg|ag|kgaa|ohg|e\.k\.|ek|se|ltd|limited|plc|llp|inc|holding|group|gruppe|cie|handels|vertrieb|technik|techni[cs]|industrie|engineering|services?|gmbh\s*&\s*co\.?\s*kg)\b/gi;

// ═══ PIPELINE v3 (21.10.2026): deutsches Board, klickbare KPIs, Fälligkeit inline, Drag & Drop, Brief-Kadenz ═══
export const CAD_STEPS=[{k:'email',d:10,label:'Nachfass-Mail'},{k:'call',d:20,label:'Nachfass-Anruf'},{k:'l6',d:182,label:'Zweiter Brief (6 Monate)'},{k:'l12',d:365,label:'Dritter Brief (12 Monate)'}];
export const CAD_LABEL={email:'Nachfass-Mail',call:'Nachfass-Anruf',l6:'Zweiter Brief (6 Monate)',l12:'Dritter Brief (12 Monate)'};
export const CH_DE={'Own letter':'Eigener Brief','Partner letter':'Partnerbrief','M&A house / advisor':'M&A-Berater','Tax adviser / auditor':'Steuerberater / WP','Trade fair':'Messe','Own email':'Eigene Mail','LinkedIn':'LinkedIn','Phone':'Telefon','Network / referral':'Netzwerk','Platform':'Plattform','Bank':'Bank','Inbound':'Eingehend','Other':'Sonstige','':'(kein Kanal)'};
export const ST_DE={'Identified':'Identifiziert','Contacted':'Angeschrieben','Replied':'Antwort','Meeting':'Gespräch','NDA':'NDA / Infos','LOI':'LOI','Diligence':'Prüfung','Closed':'Abgeschlossen','On hold':'Zurückgestellt','Dead':'Absage'};
export const LS_DE={planned:'Brief geplant',ready:'Brief entworfen, zu versenden',sent:'Brief versendet'};
export const BOARD_COLS=[{k:'ready',t:'Zu kontaktieren'},{k:'Contacted',t:'Angeschrieben'},{k:'Replied',t:'Antwort'},{k:'Meeting',t:'Gespräch'},{k:'NDA',t:'NDA / Infos'},{k:'LOI',t:'LOI'},{k:'Diligence',t:'Prüfung'}];
export const LETTER_TARGET_WEEK=10;
