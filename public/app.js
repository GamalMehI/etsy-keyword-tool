'use strict';
const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = (n,d=0) => n == null ? 'Indisponible' : Number(n).toLocaleString('fr-FR',{maximumFractionDigits:d});
const usd = n => n == null ? 'N/D' : num(n,n<100?2:0)+' $';
const est = '<span class="est">est.</span>';
const age = n => n==null||!Number.isFinite(n)?'N/D':n<60?num(n)+' j':n<730?num(n/30)+' mois':num(n/365,1)+' ans';
const dateTime = t => t ? new Date(t*1000).toLocaleString('fr-FR',{timeZone:'Africa/Casablanca',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : 'Aucune';
const state = {screen:'hot',period:30,filters:{niche:'',min:'',max:'',age:'',confidence:'1',q:'',language:'en'},sort:'monthly_revenue',dir:'desc',offset:0,report:null,stats:null,seeds:null,seedDraft:null,analyzing:false};
let requestId = 0;
async function api(path,body) {
  const response = await fetch(path,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Requête impossible');
  return result;
}
function notice(message,error=false) { $('#notice').className=error?'error':'banner'; $('#notice').textContent=message; }
function conf(value) { return `<span class="conf" data-l="${{Basse:1,Moyenne:2,Haute:3}[value]||1}"><i aria-hidden="true"><b></b><b></b><b></b></i>${esc(value||'Basse')}</span>`; }
function trend(value) { return value==null?'<span class="pshop" title="Deux périodes complètes sont nécessaires">N/D</span>':`<span class="${value>=0?'up':'down'}">${value>=0?'+':''}${num(value)} %${est}</span>`; }
function image(p,hero=false) {
  const url = p.image_url;
  return url && (/^https:\/\//.test(url)||url==='/mock-product.svg') ? `<img class="${hero?'hero':'thumb'}" src="${esc(url)}" alt="${hero?esc(p.title):''}" loading="lazy" referrerpolicy="no-referrer">` : `<div class="${hero?'hero':'thumb'} fallback" aria-label="Image indisponible">PDF</div>`;
}
function spark(values,w=100,h=30,color='var(--accent)') {
  if(!values?.length)return '<span class="pshop">Indisponible</span>';
  const max=Math.max(...values),min=Math.min(...values),range=max-min||1;
  const d=values.map((v,i)=>(i?'L':'M')+(3+i*(w-6)/Math.max(1,values.length-1)).toFixed(1)+' '+(h-3-(v-min)/range*(h-6)).toFixed(1)).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Évolution estimée"><path d="${d}" fill="none" stroke="${color}" stroke-width="2"/></svg>`;
}
const verdictClass = v => v==='Foncer'?'v-go':v==='À creuser'?'v-dig':'v-no';
function periodSwitch() { return `<div class="seg" role="group" aria-label="Période">${[7,30,90].map(p=>`<button data-period="${p}" aria-pressed="${p===state.period}">${p}j</button>`).join('')}</div>`; }
function head(title,description,controls='') { return `<div class="screen-head"><div><p class="eyebrow">${description}</p><h2>${title}</h2></div>${controls}</div>`; }
function empty(title,body,action='') { return `<div class="empty"><h3>${title}</h3><p>${body}</p>${action}</div>`; }
function table(rows,{sortable=true}={}) {
  if(!rows.length)return empty('Aucun produit à afficher','Élargissez vos filtres ou lancez une collecte depuis l’onglet Collecte.');
  const headers=[['Produit','title'],['Prix','price_usd'],['Ventes/mois est.','monthly_sales'],['Revenu/mois est.','monthly_revenue'],['Tendance est.','trend'],['Favoris','favorites'],['Âge','age_days'],['Confiance','confidence']];
  return `<div class="tbl-wrap"><table><thead><tr>${headers.map(([label,key],i)=>`<th class="${i>0&&i<7?'r':''}" ${sortable?`aria-sort="${state.sort===key?(state.dir==='desc'?'descending':'ascending'):'none'}"`:''}>${sortable?`<button data-sort="${key}">${label}${state.sort===key?(state.dir==='desc'?' ↓':' ↑'):''}</button>`:label}</th>`).join('')}</tr></thead><tbody>${rows.map(p=>`<tr data-product="${p.listing_id}" tabindex="0" aria-label="Ouvrir ${esc(p.title)}"><td><div class="prod">${image(p)}<div><div class="ptitle">${esc(p.title)}${p.badges.map(b=>`<span class="badge ${b==='Viral'?'b-viral':'b-classic'}">${b}</span>`).join('')}</div><div class="pshop">${esc(p.shop_name||'Boutique en cours de collecte')}</div></div></div></td><td class="r num">${usd(p.price_usd)}</td><td class="r num">${num(p.monthly_sales)}${est}</td><td class="r num">${usd(p.monthly_revenue)}${est}</td><td class="r num">${trend(p.trend)}</td><td class="r num">${num(p.favorites)}</td><td class="r num">${age(p.age_days)}</td><td>${conf(p.confidence)}</td></tr>`).join('')}</tbody></table></div>`;
}
function filterControls() {
  const f=state.filters, options=state.stats.keywords;
  return `<div class="filters"><label>Niche<select data-filter="niche" aria-label="Niche"><option value="">Toutes les niches</option>${options.map(k=>`<option ${f.niche===k?'selected':''}>${esc(k)}</option>`).join('')}</select></label><label>Prix min. $<input class="price" data-filter="min" aria-label="Prix minimum" type="number" min="0" value="${esc(f.min)}"></label><label>Prix max. $<input class="price" data-filter="max" aria-label="Prix maximum" type="number" min="0" value="${esc(f.max)}"></label><label>Âge<select data-filter="age" aria-label="Âge"><option value="">Tous</option>${[[30,'Moins de 30 j'],[90,'Moins de 90 j'],[365,'Moins d’un an']].map(([v,label])=>`<option value="${v}" ${String(v)===f.age?'selected':''}>${label}</option>`).join('')}</select></label><label>Confiance min.<select data-filter="confidence" aria-label="Confiance minimum">${[[1,'Basse'],[2,'Moyenne'],[3,'Haute']].map(([v,label])=>`<option value="${v}" ${String(v)===f.confidence?'selected':''}>${label}</option>`).join('')}</select></label><label>Langue<select data-filter="language" aria-label="Langue">${[['en','Anglais'],['all','Toutes'],['fr','Français']].map(([v,label])=>`<option value="${v}" ${v===f.language?'selected':''}>${label}</option>`).join('')}</select></label><input class="search" data-filter="q" aria-label="Rechercher un produit" placeholder="Titre, boutique ou tag…" value="${esc(f.q)}"></div>`;
}
async function hotScreen() {
  const params=new URLSearchParams({...state.filters,period:state.period,sort:state.sort,dir:state.dir,offset:state.offset});
  const data=await api('/api/products?'+params),s=state.stats;
  return head('Produits tendance','Produits digitaux · classés selon nos métriques',periodSwitch())+`<div class="strip"><div><span class="s">Produits suivis</span><div class="v">${num(s.listings)}</div></div><div><span class="s">Revenu USD disponible, ${state.period} j ${est}</span><div class="v">${usd(data.revenue)}</div></div><div><span class="s">Viraux dans cette sélection</span><div class="v">${num(data.viral)}</div></div><div><span class="s">Historique collecté</span><div class="v">${s.history_days} jours</div></div></div>${filterControls()}${table(data.rows)}<div class="pager"><span>${data.total?data.offset+1:0}–${Math.min(data.offset+data.rows.length,data.total)} sur ${num(data.total)} produits</span><div><button class="btn ghost" data-page="${Math.max(0,data.offset-data.limit)}" ${data.offset===0?'disabled':''}>Précédent</button><button class="btn ghost" data-page="${data.offset+data.limit}" ${data.offset+data.limit>=data.total?'disabled':''}>Suivant</button></div></div><p class="footnote">Les ventes et revenus sont estimés, normalisés sur 30 jours pour la période choisie. Le revenu est brut, avant frais et remboursements. Prix USD disponible pour ${num(data.priced)} des ${num(data.total)} produits filtrés ; les autres restent inclus dans les ventes estimées mais leur revenu est indisponible. La tendance compare deux périodes de ${state.period} jours. L’ordre des résultats de l’API n’est pas le classement Etsy.</p>`;
}
function keywordScreen() {
 const r=state.report;
 let html=head('Analyse de mot-clé','Mesurer la demande · évaluer la concurrence')+`<form class="kwbar" id="keyword-form"><input class="search" id="keyword-input" name="keyword" list="keywords" aria-label="Mot-clé à analyser" placeholder="Ex. goodnotes planner" maxlength="160" required value="${esc(r?.keyword||'')}"><datalist id="keywords">${state.stats.keywords.map(k=>`<option value="${esc(k)}"></option>`).join('')}</datalist><button class="btn" ${state.analyzing?'disabled':''}>${state.analyzing?'Analyse en cours…':'Analyser'}</button></form>`;
 if(state.analyzing)return html+'<div class="loading" role="status">Analyse des produits digitaux. Cette opération peut prendre jusqu’à 90 secondes.</div>';
 if(!r)return html+empty('Un mot-clé, une décision mieux informée','Explorez un marché à partir des avis, des ventes estimées et des boutiques qui y réussissent.');
 const scoreCards=[['Demande',r.demand,'var(--accent)',`${r.sample} produits classés par ventes/mois est.`],['Concurrence',r.competition,'var(--warn)',`${num(r.total_count)} annonces, tous formats`],['Porte ouverte',r.open_door,'var(--good)',`${r.young_listings} produits récents qui vendent (est.) · ${r.young_shops} jeunes boutiques`],['Opportunité',r.opportunity,'var(--hot)','Une aide à comparer les niches']];
 html+=`<div class="verdict ${verdictClass(r.verdict)}"><span class="pill">${r.verdict}</span><p>${num(r.sample)} produits retenus selon nos estimations. ${r.calls} appels API${r.cached?' · rapport du jour en cache':''}. Le score décrit l’échantillon observé.</p></div>${r.warning?`<p class="banner">Analyse partielle : ${esc(r.warning)}</p>`:''}<div class="scores">${scoreCards.map(([label,value,color,caption])=>`<div class="score"><span class="eyebrow">${label}</span><div class="v">${value}<small> /100</small></div><div class="meter"><i style="width:${value}%;background:${color}"></i></div><p>${caption}</p></div>`).join('')}</div><div class="two"><div class="box"><h3>Chiffres clés</h3><div class="facts"><div><b>${r.google?.volume==null?'Indisponible':num(r.google.volume)}</b><span>recherches Google/mois</span></div><div><b>${num(r.digital_share*100)} %</b><span>résultats numériques</span></div><div><b>${usd(r.median_price)}</b><span>prix médian</span></div><div><b>${r.price_range.map(usd).join(' – ')||'N/D'}</b><span>fourchette de prix</span></div><div><b>${age(r.median_age)}</b><span>âge médian des produits</span></div><div><b>${num(r.top3_share*100)} % ${est}</b><span>revenu du top 3 boutiques</span></div></div>${r.google?.trend?`<p class="pshop">Volume Google · 12 mois</p>${spark(r.google.trend,300,46)}`:'<p class="pshop">Semrush indisponible. Le poids du volume Google est redistribué sur les signaux Etsy.</p>'}</div><div class="box"><h3>Sous-mots-clés</h3>${r.subkeywords.length?`<ul class="subkw">${r.subkeywords.map(k=>`<li><span>${esc(k)}</span><button class="link" data-analyze="${esc(k)}">Analyser</button></li>`).join('')}</ul>`:'<p class="pshop">Aucune suggestion disponible pour le moment.</p>'}</div></div><div class="box"><h3>Meilleurs produits digitaux · ventes estimées</h3>${table(r.products,{sortable:false})}</div><div class="box"><h3>Faille de qualité · avis 1 à 3 étoiles des deux leaders</h3>${r.complaints.length?r.complaints.map(c=>`<p class="quote">${esc(decode(c.text))}<span>${c.rating} ★ · ${dateTime(c.created_ts)}</span></p>`).join(''):'<p class="pshop">Aucun avis de 1 à 3 étoiles observé dans les données disponibles.</p>'}</div><p class="footnote">${esc(r.review_metric)}. Prix USD disponible pour ${r.priced} des ${r.sample} produits ; la concentration du revenu porte sur ce sous-ensemble. Ces scores s’appuient sur un échantillon de l’API et sur des estimations ; ils ne représentent pas les volumes de recherche Etsy.</p>`;
 return html;
}
function decode(text) { const el=document.createElement('textarea');el.innerHTML=text;return el.value; }
async function nicheScreen() {
 const rows=await api('/api/niches?period='+state.period);
 return head('Niches','Familles de produits digitaux · classées par opportunité',periodSwitch())+(rows.length?`<div class="tbl-wrap"><table class="niche-table"><thead><tr><th>Niche</th><th>Revenu 12 sem. est.</th><th class="r">Revenu/mois est.</th><th class="r">Tendance est.</th><th class="r">Produits / boutiques</th><th class="r">Prix médian</th><th class="r">Top 3 est.</th><th class="r">Nouveaux qui vendent est.</th><th>Dem · Conc · Porte</th><th>Opp.</th><th>Verdict / confiance</th></tr></thead><tbody>${rows.map(n=>`<tr data-niche="${esc(n.keyword)}" tabindex="0"><td><strong>${esc(n.keyword)}</strong><div class="pshop">Prix USD : ${n.priced}/${n.listings}</div></td><td>${spark(n.sparkline)}</td><td class="r num">${usd(n.monthly_revenue)}${est}</td><td class="r num">${trend(n.trend)}</td><td class="r num">${num(n.listings)} / ${num(n.shops)}</td><td class="r num">${usd(n.median_price)}</td><td class="r num">${num(n.top3_share*100)} %${est}</td><td class="r num">${num(n.new_success*100)} %${est}</td><td><span class="bars" title="Demande ${n.demand}, concurrence ${n.competition}, porte ouverte ${n.open_door}">${[[n.demand,'var(--accent)'],[n.competition,'var(--warn)'],[n.open_door,'var(--good)']].map(([v,c])=>`<span><i style="width:${v}%;background:${c}"></i></span>`).join('')}</span></td><td class="num"><b>${n.opportunity}</b></td><td><span class="vpill ${verdictClass(n.verdict)}">${n.verdict}</span><div>${conf(n.confidence)}</div></td></tr>`).join('')}</tbody></table></div><p class="footnote">Cliquez sur une niche pour afficher ses produits. Revenus et succès des nouveaux produits sont estimés. Les revenus et leur concentration couvrent uniquement les prix USD disponibles. La courbe représente les avis observés × K × prix, par semaine ; une semaine sans avis collectés ne prouve pas une absence de ventes. Un produit peut appartenir à plusieurs niches.</p>`:empty('Vos niches apparaîtront ici','La collecte construit ce classement à partir des produits numériques suivis.','<button class="btn" data-goto="collect">Ouvrir la collecte</button>'));
}
async function collectScreen() {
 const s=state.stats,b=s.budget,j=s.job;
 if(state.seeds==null)state.seeds=(await api('/api/seeds')).seeds;
 const running=j?.status==='running';
 const status={success:'Terminée',running:'En cours',budget:'Réserve atteinte',error:'Erreur',interrupted:'Interrompue'};
 return head('Collecte',`Collecte quotidienne · ${String(s.hour).padStart(2,'0')}:00 · Casablanca`,`<div class="collect-actions"><form id="schedule-form"><label class="pshop" for="hour">Heure</label> <select id="hour" aria-label="Heure de collecte">${Array.from({length:24},(_,i)=>`<option value="${i}" ${i===s.hour?'selected':''}>${String(i).padStart(2,'0')}:00</option>`).join('')}</select> <button class="btn ghost">Enregistrer l’heure</button></form><button class="btn" data-run ${running?'disabled':''}>${running?'Collecte en cours…':'Lancer maintenant'}</button></div>`)+`<div class="quota-big"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><h3>Appels API aujourd’hui</h3><span class="num"><b>${num(b.used)}</b> / 5 000 · reste ${num(b.remaining)}</span></div><div class="qtrack"><i class="used" style="width:${Math.min(100,b.used/50)}%"></i><span class="qreserve" style="width:${b.reserve/50}%" title="Réserve interactive ${b.reserve}"></span></div><div class="qlegend"><span>Consommation locale persistée · ${num(b.used)}</span><span>Réserve pour les analyses · ${num(b.reserve)}</span><span>Dernier solde API · ${num(b.remaining_reported)}</span></div></div><div class="strip"><div><span class="s">Produits digitaux suivis</span><div class="v">${num(s.listings)}</div></div><div><span class="s">Boutiques</span><div class="v">${num(s.shops)}</div></div><div><span class="s">Avis enregistrés</span><div class="v">${num(s.reviews)}</div></div><div><span class="s">Dernière collecte</span><div class="v" style="font-size:16px">${dateTime(j?.finished||j?.started)}</div></div></div><div class="box" style="margin-bottom:14px"><h3>${status[j?.status]||'Prêt pour la première collecte'}</h3><p>${esc(j?.step||'Démarrez une collecte pour remplir la base.')}${j?.calls?' · '+num(j.calls)+' appels':''}</p><p class="pshop">${esc(j?.message||'')}${running?' · actualisation toutes les 10 secondes':''}</p></div><div class="two"><div class="box"><h3>Fiabilité des estimations</h3><p class="pshop">Jour ${s.history_days+1} · ${s.snapshot_days} jours avec un relevé. Estimations plus fiables à partir du jour 7, selon la couverture des avis.</p><div class="maturity">${[[0,'J1','Avis 90 j'],[7,'J7','Ventes boutiques'],[30,'J30','Tendances 30 j'],[90,'J90','Historique complet']].map(([d,label,description])=>`<div class="${s.history_days>=d?'done':''}"><b>${label}</b>${description}</div>`).join('')}</div><p class="footnote">La collecte reprend les historiques incomplets et s’arrête avant de toucher à la réserve. Une première collecte peut nécessiter deux jours de budget.</p><p class="footnote">Le serveur doit rester ouvert pour sa planification. Un exemple launchd est fourni pour une collecte sans interface ouverte.</p></div><div class="box"><h3>Mots-clés de départ</h3><form id="seeds-form"><label for="seeds" class="pshop">Un par ligne. Les marques bloquées et produits physiques sont exclus.</label><textarea id="seeds" spellcheck="false">${esc(state.seedDraft??state.seeds)}</textarea><button class="btn seed-save">Enregistrer les mots-clés</button></form></div></div>`;
}
function updateShell() {
 const s=state.stats;if(!s)return;
 $('#quota').innerHTML=`<div>Appels API aujourd’hui</div><b class="num">${num(s.budget.used)}</b> / 5 000<div class="qbar"><i style="width:${Math.min(100,s.budget.used/50)}%;background:var(--hot)"></i></div><div style="margin-top:6px">Réserve · ${num(s.budget.reserve)} appels</div>`;
 $('#mode').innerHTML=s.mock?'<span class="mockflag">Données d’exemple</span>':`<span>${s.job?.status==='running'?'Collecte en cours':'API officielle · lecture seule'}</span>`;
 if(s.mock)notice('Données d’exemple · produits, boutiques et historiques fictifs. Aucune requête Etsy.');
}
async function render({loading=true}={}) {
 const id=++requestId,screen=state.screen;
 const focused=document.activeElement?.dataset?.filter==='q',selection=focused?document.activeElement.selectionStart:null;
 document.querySelectorAll('.nav button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.screen===screen)));
 $('#screen').setAttribute('aria-busy','true');if(loading)$('#screen').innerHTML='<div class="loading" role="status">Chargement des données…</div>';
 try{
  if(!state.stats)state.stats=await api('/api/status');updateShell();
  const html=screen==='hot'?await hotScreen():screen==='kw'?keywordScreen():screen==='niches'?await nicheScreen():await collectScreen();
  if(id!==requestId)return;
  $('#screen').innerHTML=html;
  if(focused){const el=$('[data-filter="q"]');if(el){el.focus();el.setSelectionRange(selection,selection);}}
 }catch(e){if(id===requestId)$('#screen').innerHTML=empty('Chargement impossible',esc(e.message),'<button class="btn" data-retry>Réessayer</button>');}
 finally{if(id===requestId)$('#screen').setAttribute('aria-busy','false');}
}
function navigate(screen){state.screen=screen;closeDrawer();render();}
async function runAnalysis(keyword) {
 if(state.analyzing)return;
 state.screen='kw';state.analyzing=true;state.report={...(state.report||{}),keyword};render();
 try{state.report=await api('/api/keyword',{keyword});state.stats=await api('/api/status');}
 catch(e){notice(e.message,true);state.report=null;}
 finally{state.analyzing=false;if(state.screen==='kw')render({loading:false});}
}
function chart(p) {
 const data=p.chart,w=400,h=150,bw=360/data.length,max=Math.max(1,...data.map(d=>d.sales));
 const fav=data.map(d=>d.favorites).filter(v=>v!=null),fmin=Math.min(...fav),fmax=Math.max(...fav);
 const bars=data.map((d,i)=>`<rect x="${28+i*bw}" y="${125-d.sales/max*100}" width="${Math.max(1,bw*.7)}" height="${d.sales/max*100}" fill="var(--accent)"><title>${d.day} : ${num(d.sales,1)} ventes est.</title></rect>`).join('');
 const line=data.flatMap((d,i)=>d.favorites==null?[]:[`${i===0||data[i-1].favorites==null?'M':'L'}${28+i*bw+bw*.35} ${125-(d.favorites-fmin)/(fmax-fmin||1)*100}`]).join(' ');
 return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Ventes estimées par jour et favoris observés"><line x1="26" y1="125" x2="390" y2="125" stroke="var(--line)"/><text x="22" y="27" text-anchor="end">${num(max)}</text>${bars}<path d="${line}" fill="none" stroke="var(--hot)" stroke-width="2"/><text x="28" y="145">${data[0].day.slice(5)}</text><text x="388" y="145" text-anchor="end">${data.at(-1).day.slice(5)}</text></svg>`;
}
let drawerFocus=null;
async function openDrawer(id) {
 drawerFocus=document.activeElement;
 try{
  const period=state.screen==='kw'?30:state.period,p=await api(`/api/products/${id}?period=${period}`);
  $('#drawer-root').innerHTML=`<div class="backdrop" data-close></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="Fiche produit"><button class="close" data-close aria-label="Fermer">✕</button>${image(p,true)}<div><h3>${esc(p.title)}</h3><p class="pshop">${esc(p.shop_name)} · <a href="https://www.etsy.com/listing/${p.listing_id}" target="_blank" rel="noopener noreferrer">Voir sur Etsy ↗</a></p></div><div class="kv"><div><b>${num(p.monthly_sales)}${est}</b><span>ventes/mois estimées</span></div><div><b>${usd(p.monthly_revenue)}${est}</b><span>revenu/mois estimé</span></div><div><b>${conf(p.confidence)}</b><span>confiance</span></div></div><div><p class="eyebrow">Ventes estimées par jour · ${period} jours</p>${chart(p)}<p class="chart-legend">Vert : avis/jour × K, est. · Orange : favoris cumulés (axe indépendant). Les jours sans relevé de favoris sont laissés vides.</p></div><div><h3>Boutique</h3><div class="kv"><div><b>${num(p.shop_sales)}</b><span>ventes totales boutique</span></div><div><b>${age(p.shop_age_days)}</b><span>âge de la boutique</span></div><div><b>${num(p.digital_listing_count)}</b><span>produits digitaux</span></div></div></div><div><p class="eyebrow">Tags · cliquer pour analyser</p><div class="tags">${p.tags.map(t=>`<button class="tag" data-analyze="${esc(t)}">${esc(t)} <small>Analyser</small></button>`).join('')}</div></div><p class="footnote">Méthode : ${p.method==='blend'?'70 % variation des ventes boutique répartie sur les produits + 30 % avis × K':'avis × K boutique'}. K = ${num(p.k,1)} (est.). Historique boutique : ${p.coverage_days} jours sur cette période. Les ventes par produit restent des estimations.</p></aside>`;
  document.body.style.overflow='hidden';$('.drawer .close').focus();
 }catch(e){notice(e.message,true);}
}
function closeDrawer(){ $('#drawer-root').innerHTML='';document.body.style.overflow='';if(drawerFocus?.isConnected)drawerFocus.focus();drawerFocus=null; }
document.addEventListener('click',async e=>{
 const b=e.target.closest('button,tr[data-product],tr[data-niche]');
 if(e.target.matches('.backdrop')||b?.hasAttribute('data-close'))return closeDrawer();
 if(!b||b.disabled)return;
 if(b.dataset.screen)return navigate(b.dataset.screen);
 if(b.dataset.goto)return navigate(b.dataset.goto);
 if(b.dataset.period){state.period=Number(b.dataset.period);state.offset=0;return render();}
 if(b.dataset.sort){state.dir=state.sort===b.dataset.sort&&state.dir==='desc'?'asc':'desc';state.sort=b.dataset.sort;state.offset=0;return render({loading:false});}
 if(b.dataset.page){state.offset=Number(b.dataset.page);return render();}
 if(b.dataset.product)return openDrawer(Number(b.dataset.product));
 if(b.dataset.niche){state.filters.niche=b.dataset.niche;state.offset=0;return navigate('hot');}
 if(b.dataset.analyze){closeDrawer();return runAnalysis(b.dataset.analyze);}
 if(b.hasAttribute('data-retry'))return render();
 if(b.hasAttribute('data-run')){
  b.disabled=true;
  try{await api('/api/collect',{bootstrap:state.stats.listings<2000});state.stats=await api('/api/status');await render({loading:false});}
  catch(err){notice(err.message,true);b.disabled=false;}
 }
});
document.addEventListener('submit',async e=>{
 e.preventDefault();
 if(e.target.id==='keyword-form')return runAnalysis($('#keyword-input').value.trim());
 try{
  if(e.target.id==='seeds-form'){const value=$('#seeds').value;const result=await api('/api/seeds',{seeds:value});state.seeds=result.seeds;state.seedDraft=null;$('#seeds').value=result.seeds;notice('Mots-clés enregistrés.'+(result.blocked.length?' Mots-clés bloqués ignorés : '+result.blocked.join(', '):''));}
  if(e.target.id==='schedule-form'){await api('/api/schedule',{hour:Number($('#hour').value)});state.stats=await api('/api/status');await render({loading:false});notice('Heure de collecte enregistrée, fuseau Africa/Casablanca.');}
 }catch(err){notice(err.message,true);}
});
let filterTimer;
document.addEventListener('input',e=>{
 if(e.target.id==='seeds')state.seedDraft=e.target.value;
 if(e.target.dataset.filter){state.filters[e.target.dataset.filter]=e.target.value;state.offset=0;clearTimeout(filterTimer);filterTimer=setTimeout(()=>render({loading:false}),350);}
});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape')closeDrawer();
 if((e.key==='Enter'||e.key===' ')&&e.target.matches('tr[data-product],tr[data-niche]')){e.preventDefault();e.target.click();}
 if(e.key==='Tab'&&$('.drawer')){const focusable=[...$('.drawer').querySelectorAll('button,a')],first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){last.focus();e.preventDefault();}else if(!e.shiftKey&&document.activeElement===last){first.focus();e.preventDefault();}}
});
setInterval(async()=>{
 try{state.stats=await api('/api/status');updateShell();if(state.screen==='collect'&&!['TEXTAREA','SELECT'].includes(document.activeElement.tagName))await render({loading:false});}catch{}
},10000);
render();
