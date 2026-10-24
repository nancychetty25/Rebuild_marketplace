
const EXT='jpg'; /* change to png / webp if your photos use another format */
const U=p=>(window.EMBED&&EMBED[p])||p;
const IMG={hero:'assets/images/hero.'+EXT};
const slug=n=>n.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const pimg=(k,n)=>`assets/images/products/${k}/${slug(n)}.${EXT}`;
const PH=t=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#e9e1d0"/><text x="200" y="145" font-family="sans-serif" font-size="18" text-anchor="middle" fill="#6b6b60">${String(t).replace(/[<>&]/g,'')}</text><text x="200" y="172" font-family="sans-serif" font-size="13" text-anchor="middle" fill="#8a8a7c">Add image to assets folder</text></svg>`);
document.addEventListener('error',e=>{const i=e.target;if(i.tagName=='IMG'&&!i.dataset.f){i.dataset.f=1;i.src=PH(i.alt||'Image')}},true);
const GAL={};
const AR_MAP={bricks:'brick',concrete:'slab',steel:'beam',wood:'woodenplank',doors:'door',windows:'window'};
const CATS=[['bricks','Bricks'],['concrete','Concrete'],['steel','Steel'],['wood','Wood'],['tiles','Tiles'],['doors','Doors'],['windows','Windows']];
const B=[['Reclaimed Bricks',12,'Mumbai',1200,'Good'],['Vintage Red Bricks',15,'Thane',800,'Good'],['Handmade Bricks',18,'Mumbai',500,'Excellent'],['Concrete Bricks',10,'Navi Mumbai',2000,'Good'],['Demolition Bricks (Cleaned)',14,'Mumbai',700,'Good'],['Clay Bricks (Reclaimed)',16,'Kalyan',800,'Good'],['Solid Bricks',13,'Thane',900,'Needs Repair'],['Perforated Bricks',11,'Mumbai',1000,'Good']];
const D={bricks:B.map((x,i)=>({n:x[0],p:x[1],l:x[2],q:x[3],c:x[4],img:U(pimg('bricks',x[0])),path:pimg('bricks',x[0]),u:'piece'}))};
const O={concrete:[['Concrete Slab (Reused)',250,'Thane',60,'Good'],['Concrete Blocks',45,'Mumbai',400,'Good'],['Precast Lintel',320,'Navi Mumbai',40,'Excellent']],
steel:[['Steel Beam (Reclaimed)',1200,'Navi Mumbai',25,'Good'],['TMT Bars (Bundle)',2400,'Mumbai',30,'Good'],['Steel Angle Frame',650,'Thane',50,'Needs Repair']],
wood:[['Wooden Plank (Reused)',180,'Mumbai',150,'Good'],['Teak Beam',950,'Thane',20,'Excellent'],['Sal Wood Batten',120,'Kalyan',300,'Good']],
tiles:[['Reclaimed Floor Tiles',35,'Mumbai',600,'Good'],['Vitrified Tiles (Spare Lot)',55,'Thane',350,'Excellent'],['Mosaic Tiles',28,'Navi Mumbai',500,'Needs Repair']],
doors:[['Teak Door (Reclaimed)',3500,'Mumbai',8,'Good'],['Flush Door',1800,'Thane',14,'Good'],['Panel Door with Frame',4200,'Navi Mumbai',5,'Excellent']],
windows:[['Wooden Window Frame',2200,'Mumbai',12,'Good'],['Glass Pane Window',1600,'Thane',18,'Good'],['Aluminium Sliding Window',2800,'Navi Mumbai',9,'Excellent']]};
for(const k in O)D[k]=O[k].map(x=>({n:x[0],p:x[1],l:x[2],q:x[3],c:x[4],img:U(pimg(k,x[0])),path:pimg(k,x[0]),u:'piece'}));
const FEAT=[['bricks',0],['concrete',0],['steel',0],['wood',0]];
let cart=[],ptab=0,ship='pickup',user={name:'Rahul Mehta',email:'rahul.mehta@example.com',phone:'+91 98200 00000',city:'Mumbai'},
orders=[{id:'RV-1041',date:'12 Sep 2026',items:[{n:'Reclaimed Bricks',q:300,p:12},{n:'Wooden Plank (Reused)',q:10,p:180}],total:5400,status:'Delivered'},{id:'RV-1032',date:'28 Aug 2026',items:[{n:'Steel Beam (Reclaimed)',q:2,p:1200}],total:2400,status:'Delivered'}],
listings=[{n:'Teak Door (Reclaimed)',p:3500,q:3,on:true},{n:'Mosaic Tiles',p:28,q:500,on:false}],fav={},F={stock:false,cond:[],loc:[],max:5000,sort:'rel',open:false},tab=0,qty=1,gi=0;
const $=s=>document.querySelector(s),app=$('#app');
const toast=m=>{const t=$('#t');t.textContent=m;t.classList.add('on');clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove('on'),1600)};
const upd=()=>$('#cn').textContent=cart.reduce((s,c)=>s+c.q,0);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const add=(key,q=1)=>{const m=key.match(/^(\D+)(\d+)$/),x=D[m[1]][m[2]],c=cart.find(c=>c.key==key);c?c.q=Math.min(x.q,c.q+q):cart.push({key,q});upd();toast('Added to cart: '+x.n)};
const pr=p=>'₹'+p.toLocaleString('en-IN');
function card(k,i){const x=D[k][i],f=x.fit?' c':'',key=k+i;
return `<article class="card" data-go="p-${k}-${i}"><div class="ph${f}"><img src="${x.img}" alt="${x.n}" loading="lazy"><button class="heart${fav[key]?' on':''}" data-fav="${key}" aria-label="Save">${fav[key]?'♥':'♡'}</button><span class="badge${x.c=='Needs Repair'?' r':''}">${x.c=='Good'||x.c=='Excellent'?x.c+' Condition':x.c}</span></div>
<div class="bd"><h3>${x.n}</h3><div class="price">${pr(x.p)} <small>/ ${x.u}</small></div><div class="meta">📍 ${x.l} · ${x.q} ${x.u}s available</div><button class="add" data-add="${key}" aria-label="Add to cart">🛒</button></div></article>`}
function nav(cur){$('#nav').innerHTML=`<a href="#home" class="${cur=='home'?'on':''}">All Categories</a>`+CATS.map(c=>`<a href="#${c[0]}" class="${cur==c[0]?'on':''}">${c[1]}</a>`).join('')+`<a class="sell" href="#sell">Sell Material</a>`}
function home(){nav('home');app.innerHTML=`
<section class="hero" style="--hero:url('${new URL(U(IMG.hero),document.baseURI).href}')"><div class="wrap"><div class="txt"><h1>Give Construction Materials <em>a Second Life</em></h1><p>Buy and sell quality reclaimed construction materials. Build sustainably. Reduce waste. Create a greener tomorrow.</p><a class="btn" href="#bricks" style="display:inline-block">Explore Marketplace →</a></div></div></section>
<div class="wrap"><div class="perks">${[['🍃','Reduce Landfill Waste'],['🪙','Save Construction Costs'],['🌱','Lower Carbon Emissions'],['♻️','Promote Circular Construction']].map(p=>`<div class="perk"><span>${p[0]}</span>${p[1]}</div>`).join('')}</div>
<section class="s"><div class="sh"><h2>Shop by Category</h2><a href="#bricks">View All →</a></div><div class="catgrid">${CATS.map(c=>`<button class="cat" data-go="${c[0]}"><img src="${U('assets/images/categories/'+c[0]+'.'+EXT)}" alt="${c[1]}">${c[1]}</button>`).join('')}</div></section>
<section class="s"><div class="sh"><h2>Featured Materials</h2><a href="#bricks">View All →</a></div><div class="grid">${FEAT.map(f=>card(f[0],f[1])).join('')}</div></section>
<div class="cta"><div><h2>Make a Sustainable Choice</h2><p>Every material reused helps reduce construction waste and protect the environment.</p></div><a class="btn" href="#bricks">Learn More →</a></div></div>`}
function list(k){nav(k);const nm=CATS.find(c=>c[0]==k)[1],all=D[k];
let ix=all.map((_,i)=>i).filter(i=>{const x=all[i];return(!F.stock||x.q>0)&&(!F.cond.length||F.cond.includes(x.c))&&(!F.loc.length||F.loc.includes(x.l))&&x.p<=F.max});
if(F.sort=='lo')ix.sort((a,b)=>all[a].p-all[b].p);if(F.sort=='hi')ix.sort((a,b)=>all[b].p-all[a].p);
const cnt=(f)=>all.filter(f).length,ck=(a,v)=>F[a].includes(v)?'checked':'';
const conds=['Excellent','Good','Needs Repair'],locs=['Mumbai','Thane','Navi Mumbai','Kalyan'];
app.innerHTML=`<div class="wrap"><div class="crumb"><a href="#home">Home</a> › <b>${nm}</b></div>
<div class="cathead"><div><h1>${nm}</h1><span style="color:var(--mute);font-size:13px">${ix.length} listings</span></div><label>Sort by: <select id="sort"><option value="rel">Relevance</option><option value="lo"${F.sort=='lo'?' selected':''}>Price: low to high</option><option value="hi"${F.sort=='hi'?' selected':''}>Price: high to low</option></select></label></div>
<div class="lay"><div><button class="btn o ftog" id="ft">${F.open?'Hide':'Show'} filters</button><aside class="fil${F.open?' open':''}">
<details open><summary>Availability</summary><label><input type="checkbox" id="stk" ${F.stock?'checked':''}>In stock only (${all.length})</label></details>
<details open><summary>Quality and Condition</summary>${conds.map(c=>`<label><input type="checkbox" data-f="cond" value="${c}" ${ck('cond',c)}>${c} (${cnt(x=>x.c==c)})</label>`).join('')}</details>
<details open><summary>Location</summary>${locs.map(c=>`<label><input type="checkbox" data-f="loc" value="${c}" ${ck('loc',c)}>${c} (${cnt(x=>x.l==c)})</label>`).join('')}</details>
<details open><summary>Price Range</summary><input type="range" id="pr" min="10" max="5000" step="10" value="${F.max}"><div style="display:flex;justify-content:space-between;font-size:13px"><span>₹10</span><span>${F.max>=5000?'₹5,000+':pr(F.max)}</span></div></details></aside></div>
<div>${ix.length?`<div class="grid">${ix.map(i=>card(k,i)).join('')}</div>`:'<p>No listings match these filters. Clear a filter to see more.</p>'}</div></div></div>`;
$('#ft').onclick=()=>{F.open=!F.open;list(k)};$('#sort').onchange=e=>{F.sort=e.target.value;list(k)};$('#stk').onchange=e=>{F.stock=e.target.checked;list(k)};$('#pr').onchange=e=>{F.max=+e.target.value;list(k)};
document.querySelectorAll('[data-f]').forEach(c=>c.onchange=()=>{const a=F[c.dataset.f];c.checked?a.push(c.value):a.splice(a.indexOf(c.value),1);list(k)})}
function prod(k,i){nav(k);const x=D[k][i],nm=CATS.find(c=>c[0]==k)[1],key=k+i,th=GAL[key]||[x.img],f='';
const rows=[['Material',nm.replace(/s$/,'')],['Dimensions',k=='bricks'?'22 cm × 10 cm × 7 cm':'Varies by piece'],['Weight',k=='bricks'?'2.5 kg (approx)':'On request'],['Condition',x.c=='Needs Repair'?'Needs repair':x.c+' (minor wear)'],['Suitable For','Construction, Landscaping, DIY Projects'],['Pickup/Delivery','Self pickup / Delivery available']];
const T=[rows.map(r=>`<div class="r"><b>${r[0]}</b><span>${r[1]}</span></div>`).join(''),`<p>Graded by the seller and checked on pickup. Minor chips and mortar marks are normal on reclaimed ${nm.toLowerCase()}. Ask the seller for extra photos before you buy.</p>`,`<p>Reusing ${nm.toLowerCase()} avoids landfill and the emissions from making new material. Every piece reused keeps embodied carbon in use.</p>`];
const rel=CATS.filter(c=>c[0]!=k).slice(0,3).map(c=>[c[0],0]);
app.innerHTML=`<div class="wrap"><div class="crumb"><a href="#home">Home</a> › <a href="#${k}">${nm}</a> › <b>${x.n}</b></div>
<div class="pd"><div class="gal"><div class="main${f}"><img id="mi" src="${th[gi]}" alt="${x.n}">${th.length>1?'<button class="nav" style="left:10px" data-g="-1" aria-label="Previous">‹</button><button class="nav" style="right:10px" data-g="1" aria-label="Next">›</button>':''}</div><div class="thumbs">${th.length<2?'':th.map((s,j)=>`<button class="${j==gi?'on':''}" data-t="${j}" aria-label="Photo ${j+1}"><img src="${s}" alt=""></button>`).join('')}</div></div>
<div><span class="badge" style="position:static;display:inline-block">${x.c=='Needs Repair'?x.c:x.c+' Condition'}</span><h1>${x.n}</h1><div class="price">${pr(x.p)} <small>/ ${x.u}</small></div>
<p>Available Quantity: <b>${x.q} ${x.u}s</b><br><span style="color:var(--mute)">📍 ${x.l}, Maharashtra</span></p>
<div class="qty"><div><button data-q="-1" aria-label="Less">−</button><span>${qty}</span><button data-q="1" aria-label="More">+</button></div><button class="btn" id="atc">Add to Cart</button></div>
<div class="seller"><div class="av">🌿</div><div><b>GreenBuild Supplies</b><div class="stars">★★★★★ <span style="color:var(--mute)">4.8 (26 reviews)</span></div></div><button class="btn o" id="cs">Contact Seller</button></div></div></div>
<div class="tabs">${['Details','Condition & Usage','Sustainability Impact'].map((t,j)=>`<button class="${j==tab?'on':''}" data-tab="${j}">${t}</button>`).join('')}</div><div class="tabc">${T[tab]}</div>
${AR_MAP[k]?`<div class="ar"><h3>♻ Visualize in Your Space</h3><p>Preview the ${nm.toLowerCase()} at real scale using augmented reality on a compatible device. Android Chrome gets full AR; other devices open a 3D preview.</p><button class="btn" id="ar">View in Your Space (AR)</button></div>`:''}
<div class="sh" style="margin-top:30px"><h2>You May Also Like</h2></div><div class="grid" style="grid-template-columns:repeat(3,1fr);padding-bottom:20px">${rel.map(r=>card(r[0],r[1])).join('')}</div></div>`;
if(!GAL[key]){GAL[key]=[x.img];const base=x.path.replace(/\.\w+$/,'');Promise.all([2,3,4].map(n=>new Promise(r=>{const m=new Image(),p=base+'-'+n+'.'+EXT;m.onload=()=>r(p);m.onerror=()=>r(null);m.src=p}))).then(a=>{const ok=a.filter(Boolean);if(ok.length){GAL[key]=[x.img,...ok];if(location.hash=='#p-'+k+'-'+i)prod(k,i)}})}
const re=()=>prod(k,i);
document.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>{gi=(gi+ +b.dataset.g+th.length)%th.length;re()});
document.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{gi=+b.dataset.t;re()});
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=+b.dataset.tab;re()});
document.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>{qty=Math.min(x.q,Math.max(1,qty+ +b.dataset.q));re()});
$('#atc').onclick=()=>add(k+i,qty);$('#cs').onclick=()=>toast('Message sent to GreenBuild Supplies');const arb=$('#ar');if(arb)arb.onclick=()=>{if(window.EMBED){toast('AR opens from the downloaded project (ar/ folder)');return}location.href='ar/index.html?model='+AR_MAP[k]+'&product='+encodeURIComponent(x.n)+'&back='+encodeURIComponent('#p-'+k+'-'+i)}}
function sell(){nav('sell');app.innerHTML=`<div class="wrap" style="max-width:560px;padding:40px 20px"><h1>Sell Material</h1><p style="color:var(--mute)">List leftover or reclaimed material in a few minutes.</p><div style="display:grid;gap:12px;margin-top:20px"><input class="search" style="max-width:none" placeholder="Material name"><select><option>Choose a category</option>${CATS.map(c=>`<option>${c[1]}</option>`).join('')}</select><input class="search" style="max-width:none" placeholder="Price per piece (₹)"><input class="search" style="max-width:none" placeholder="Quantity available"><button class="btn" id="sb">Submit listing</button></div></div>`;$('#sb').onclick=()=>toast('Listing submitted for review')}
function cartPage(){nav('cart');
const L=cart.map(c=>{const m=c.key.match(/^(\D+)(\d+)$/);return{...c,k:m[1],i:+m[2],x:D[m[1]][m[2]]}});
if(!L.length){app.innerHTML=`<div class="wrap empty"><h1>Your cart is empty</h1><p>Browse reclaimed materials and add what you need.</p><a class="btn" href="#bricks" style="display:inline-block">Explore marketplace</a></div>`;return}
const sub=L.reduce((s,c)=>s+c.x.p*c.q,0),fee=ship=='delivery'?200:0,pcs=L.reduce((s,c)=>s+c.q,0);
app.innerHTML=`<div class="wrap"><div class="crumb"><a href="#home">Home</a> › <b>Cart</b></div><h1 style="font-size:32px;margin-bottom:18px">Your cart <small style="font:400 15px Inter,sans-serif;color:var(--mute)">${pcs} pieces</small></h1>
<div class="cartlay"><div>${L.map(c=>`<div class="ci"><img class="${c.x.fit?'c':''}" src="${c.x.img}" alt=""><div class="inf"><a href="#p-${c.k}-${c.i}"><b>${c.x.n}</b></a><div class="meta">📍 ${c.x.l} · GreenBuild Supplies</div><div class="price" style="font-size:15px">${pr(c.x.p)} <small>/ piece</small></div></div>
<div class="qty" style="margin:0"><div><button data-cq="${c.key}:-1" aria-label="Less">−</button><span>${c.q}</span><button data-cq="${c.key}:1" aria-label="More">+</button></div></div><div class="lt">${pr(c.x.p*c.q)}</div><button class="rm" data-rm="${c.key}" aria-label="Remove ${c.x.n}">✕</button></div>`).join('')}</div>
<aside class="sum"><h3>Order summary</h3>
<label><input type="radio" name="ship" value="pickup" ${ship=='pickup'?'checked':''}>Self pickup<span>Free</span></label><label><input type="radio" name="ship" value="delivery" ${ship=='delivery'?'checked':''}>Delivery<span>₹200</span></label>
<div class="row"><span>Subtotal</span><span>${pr(sub)}</span></div><div class="row"><span>${ship=='delivery'?'Delivery':'Pickup'}</span><span>${fee?pr(fee):'Free'}</span></div><div class="row tot"><span>Total</span><span>${pr(sub+fee)}</span></div>
<button class="btn" id="co">Place order</button><p style="font-size:12px;color:var(--mute);margin:10px 0 0">Reusing ${pcs} pieces keeps them out of landfill.</p></aside></div></div>`;
document.querySelectorAll('[data-cq]').forEach(b=>b.onclick=()=>{const[k,d]=b.dataset.cq.split(':'),c=cart.find(c=>c.key==k),m=k.match(/^(\D+)(\d+)$/);c.q=Math.min(D[m[1]][m[2]].q,Math.max(1,c.q+ +d));upd();cartPage()});
document.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{cart=cart.filter(c=>c.key!=b.dataset.rm);upd();cartPage()});
document.querySelectorAll('[name=ship]').forEach(r=>r.onchange=()=>{ship=r.value;cartPage()});
$('#co').onclick=()=>{orders.unshift({id:'RV-'+(1042+orders.length),date:new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}),items:L.map(c=>({n:c.x.n,q:c.q,p:c.x.p})),total:sub+fee,status:'Confirmed'});cart=[];upd();toast('Order placed');location.hash='profile'}}
function profile(){nav('profile');
const favs=Object.keys(fav).filter(k=>fav[k]),pcs=orders.reduce((s,o)=>s+o.items.reduce((a,i)=>a+i.q,0),0);
let body='';
if(ptab==0)body=orders.map(o=>`<div class="ord"><div class="oh"><b>${o.id}</b><span>${o.date}</span><span class="pill${o.status=='Delivered'?'':' p'}">${o.status}</span><b>${pr(o.total)}</b></div>${o.items.map(i=>`<div class="meta">${i.q} × ${esc(i.n)} — ${pr(i.p)} each</div>`).join('')}</div>`).join('');
if(ptab==1)body=favs.length?`<div class="grid">${favs.map(f=>{const m=f.match(/^(\D+)(\d+)$/);return card(m[1],+m[2])}).join('')}</div>`:'<p style="color:var(--mute)">Nothing saved yet. Tap the heart on any material to save it here.</p>';
if(ptab==2)body=listings.map((l,j)=>`<div class="ord oh" style="align-items:center;margin:0 0 12px"><div><b>${l.n}</b><div class="meta">${pr(l.p)} / piece · ${l.q} available</div></div><span class="pill${l.on?'':' p'}">${l.on?'Active':'Paused'}</span><button class="btn o" data-pl="${j}" style="padding:7px 14px">${l.on?'Pause':'Resume'}</button></div>`).join('')+'<a class="btn" href="#sell" style="display:inline-block">Sell Material</a>';
if(ptab==3)body=`<div class="frm">${[['name','Full name'],['email','Email'],['phone','Phone'],['city','City']].map(f=>`<label>${f[1]}<input id="u-${f[0]}" value="${esc(user[f[0]])}"></label>`).join('')}<button class="btn" id="us">Save changes</button></div>`;
app.innerHTML=`<div class="wrap"><div class="phead"><div class="pav">${esc(user.name[0]||'?')}</div><div><h1 style="font-size:28px">${esc(user.name)}</h1><div class="meta">${esc(user.email)} · 📍 ${esc(user.city)}</div></div>
<div class="stats"><div class="stat"><b>${orders.length}</b><span>Orders</span></div><div class="stat"><b>${favs.length}</b><span>Saved</span></div><div class="stat"><b>${pcs}</b><span>Pieces reused</span></div></div></div>
<div class="tabs">${['Orders','Saved','My listings','Account'].map((t,j)=>`<button class="${j==ptab?'on':''}" data-pt="${j}">${t}</button>`).join('')}</div><div style="padding:20px 0 30px">${body}</div></div>`;
document.querySelectorAll('[data-pt]').forEach(b=>b.onclick=()=>{ptab=+b.dataset.pt;profile()});
document.querySelectorAll('[data-pl]').forEach(b=>b.onclick=()=>{const l=listings[b.dataset.pl];l.on=!l.on;profile()});
const us=$('#us');if(us)us.onclick=()=>{['name','email','phone','city'].forEach(f=>user[f]=$('#u-'+f).value.trim()||user[f]);toast('Profile saved');profile()}}
function route(){const h=(location.hash||'#home').slice(1);F={stock:false,cond:[],loc:[],max:5000,sort:'rel',open:false};tab=0;qty=1;gi=0;ptab=0;window.scrollTo(0,0);
if(h=='sell')sell();else if(h=='cart')cartPage();else if(h=='profile')profile();else if(h.startsWith('p-')){const[,k,i]=h.split('-');D[k]?prod(k,+i):home()}else if(D[h])list(h);else home()}
document.addEventListener('click',e=>{const f=e.target.closest('[data-fav]'),a=e.target.closest('[data-add]'),g=e.target.closest('[data-go]');
if(f){e.stopPropagation();fav[f.dataset.fav]=!fav[f.dataset.fav];f.textContent=fav[f.dataset.fav]?'♥':'♡';f.classList.toggle('on')}
else if(a){e.stopPropagation();add(a.dataset.add)}
else if(g){location.hash=g.dataset.go}});
$('#q').addEventListener('keydown',e=>{if(e.key=='Enter'){const v=e.target.value.toLowerCase(),c=CATS.find(c=>v.includes(c[0])||v.includes(c[1].toLowerCase().replace(/s$/,'')));c?location.hash=c[0]:toast('No category matches “'+e.target.value+'” yet')}});
addEventListener('hashchange',route);route();
