#!/usr/bin/env node
/* Cascade Clarity content engine - source harvester
   usage: node harvest.js [seen.txt] [days]
   Prints a compact, beat-grouped candidate list from all cloud-reachable sources. */
const https = require('https'), fs = require('fs');
const SEEN = process.argv[2] || null;
const DAYS = parseInt(process.argv[3] || '7', 10);

const FEEDS = [
  // beat, label, url
  ['jumpcloud','JumpCloud Blog','https://jumpcloud.com/blog/feed'],
  ['itsm','CIO Dive','https://www.ciodive.com/feeds/news/'],
  ['itsm','Computerworld','https://www.computerworld.com/feed/'],
  ['ai-enterprise','HFS Research','https://www.hfsresearch.com/feed/'],
  ['ai-enterprise','VentureBeat AI','https://venturebeat.com/category/ai/feed/'],
  ['ai-enterprise','The Register AI/ML','https://www.theregister.com/software/ai_ml/headlines.atom'],
  ['ai-enterprise','ZDNet AI','https://www.zdnet.com/topic/artificial-intelligence/rss.xml'],
  ['ai-enterprise','TechCrunch AI','https://techcrunch.com/category/artificial-intelligence/feed/'],
  ['ai-governance','NIST News','https://www.nist.gov/news-events/news/rss.xml','ai'],
  ['hr-ai','HR Dive','https://www.hrdive.com/feeds/news/'],
  ['hr-ai','HR Executive','https://hrexecutive.com/feed/'],
  ['hr-ai','Josh Bersin','https://joshbersin.com/feed/'],
];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36';

function get(url, redirects = 0) {
  return new Promise(res => {
    const req = https.get(url, { headers: { 'User-Agent': UA, 'Accept': '*/*' }, timeout: 15000 }, r => {
      if ([301,302,303,307,308].includes(r.statusCode) && r.headers.location && redirects < 4) {
        r.resume(); return res(get(new URL(r.headers.location, url).href, redirects + 1));
      }
      let d = ''; r.setEncoding('utf8'); r.on('data', c => d += c); r.on('end', () => res(d));
    });
    req.on('error', () => res('')); req.on('timeout', () => { req.destroy(); res(''); });
  });
}
const ents = s => (s||'')
  .replace(/&amp;/g,'&').replace(/&#8217;|&#8216;|&rsquo;|&lsquo;/g,"'")
  .replace(/&quot;|&#8220;|&#8221;|&ldquo;|&rdquo;/g,'"')
  .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ')
  .replace(/&#8211;|&ndash;/g,'-').replace(/&#8212;|&mdash;/g,' - ')
  .replace(/&#(\d+);/g,(m,n)=>String.fromCharCode(n));
const strip = s => ents(ents((s||'').replace(/<!\[CDATA\[|\]\]>/g,''))
  .replace(/<[^>]+>/g,' ')).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();

function parse(xml) {
  const out = [];
  const blocks = xml.split(/<item[\s>]|<entry[\s>]/).slice(1);
  for (const b of blocks) {
    const t = strip((b.match(/<title[^>]*>([\s\S]*?)<\/title>/)||[])[1]);
    let l = strip((b.match(/<link[^>]*>([\s\S]*?)<\/link>/)||[])[1]);
    if (!l) l = ((b.match(/<link[^>]*href="([^"]+)"/)||[])[1]) || '';
    const d = strip((b.match(/<pubDate>([\s\S]*?)<\/pubDate>/)||[])[1])
           || strip((b.match(/<updated>([\s\S]*?)<\/updated>/)||[])[1])
           || strip((b.match(/<published>([\s\S]*?)<\/published>/)||[])[1]);
    const desc = strip((b.match(/<description[^>]*>([\s\S]*?)<\/description>/)||[])[1]).slice(0,220);
    if (t && l) out.push({ title: t, link: l, date: d, desc });
  }
  return out;
}

(async () => {
  const cutoff = Date.now() - DAYS * 864e5;
  const seen = SEEN && fs.existsSync(SEEN)
    ? new Set(fs.readFileSync(SEEN,'utf8').split('\n').map(s=>s.trim()).filter(Boolean)) : new Set();

  const results = await Promise.all(FEEDS.map(async ([beat,label,url,gate]) => {
    let items = parse(await get(url)).filter(i => {
      const t = Date.parse(i.date); return isNaN(t) ? true : t >= cutoff;
    });
    if (gate) items = items.filter(i => new RegExp(gate,'i').test(i.title + ' ' + i.desc));
    return { beat, label, items: items.slice(0, 8) };
  }));

  // Atomicwork has no feed: scrape blog index
  const awHtml = await get('https://www.atomicwork.com/blog');
  const awLinks = [...new Set([...awHtml.matchAll(/href="(\/blog\/[a-z0-9\-]+)"/g)].map(m=>m[1]))];
  results.push({ beat:'atomicwork', label:'Atomicwork Blog (scraped, no dates)',
    items: awLinks.map(p => ({ title: p.replace('/blog/','').replace(/-/g,' '),
                               link: 'https://www.atomicwork.com'+p, date:'', desc:'' })) });

  const byBeat = {};
  let total = 0, fresh = 0;
  for (const r of results) {
    for (const i of r.items) {
      total++;
      if (seen.has(i.link)) continue;
      fresh++;
      (byBeat[r.beat] = byBeat[r.beat] || []).push({ ...i, src: r.label });
    }
  }
  console.log(`# HARVEST  window=${DAYS}d  items=${total}  unseen=${fresh}  seenLedger=${seen.size}\n`);
  for (const beat of Object.keys(byBeat).sort()) {
    console.log(`## ${beat.toUpperCase()}`);
    for (const i of byBeat[beat]) {
      console.log(`- ${i.title}\n  ${i.link}\n  [${i.src}] ${i.date}${i.desc ? '\n  '+i.desc : ''}`);
    }
    console.log('');
  }
})();
