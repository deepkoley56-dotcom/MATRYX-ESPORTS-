(() => {
  const $ = (id) => document.getElementById(id);
  const cfg = window.MATRYX_CONFIG || {};
  const configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes("PASTE_") && !cfg.SUPABASE_ANON_KEY.includes("PASTE_");
  const db = configured && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  let user = null, profile = null, authMode = "login";
  const monthKey = new Date().toISOString().slice(0,7);
  $("currentMonth").textContent = new Date().toLocaleDateString(undefined,{month:"long",year:"numeric"}).toUpperCase();
  $("prizeMonth").value = monthKey;

  const esc = (v="") => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const dateFmt = v => v ? new Date(v).toLocaleString([], {month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}) : "Date to be announced";
  const toast = (msg, error=false) => { const el=$("toast"); el.textContent=msg; el.classList.toggle("error",error); el.classList.remove("hidden"); setTimeout(()=>el.classList.add("hidden"),3600); };
  const message = (id,msg,error=false) => { const el=$(id); if(!el)return; el.textContent=msg; el.classList.toggle("error",error); };
  const noBackend = () => { toast("Setup needed: add Supabase URL/key and run schema.sql.",true); };
  const run = async (promise) => { if(!db){noBackend();throw new Error("Supabase is not configured.");} const {data,error}=await promise; if(error)throw error; return data; };
  const safeRun = async (fn, fallback=null) => { try{return await fn();}catch(e){console.error(e);return fallback;} };
  const statusPill = s => `<span class="pill ${s==="approved"||s==="completed"?"pill-green":s==="rejected"?"pill-red":""}">${esc((s||"pending").toUpperCase())}</span>`;
  const openModal = id => $(id).classList.remove("hidden");
  const closeModal = id => $(id).classList.add("hidden");

  $("menuToggle").onclick=()=>$("nav").classList.toggle("open");
  document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
  document.querySelectorAll(".modal-backdrop").forEach(el=>el.addEventListener("click",e=>{if(e.target===el)el.classList.add("hidden")}));
  $("openAuth").onclick=()=>openModal("authModal");
  $("registerGuildBtn").onclick=()=>user?openModal("guildModal"):openModal("authModal");
  $("dashboardGuildBtn").onclick=()=>openModal("guildModal");
  $("openDashboard").onclick=()=>{ $("dashboard").classList.remove("hidden"); $("dashboard").scrollIntoView({behavior:"smooth"}); };
  $("logoutBtn").onclick=async()=>{if(db)await db.auth.signOut();user=null;profile=null;renderAuth();toast("Logged out.");};
  document.querySelectorAll("[data-auth]").forEach(b=>b.onclick=()=>{authMode=b.dataset.auth;document.querySelectorAll("[data-auth]").forEach(x=>x.classList.toggle("active",x===b));$("authSubmit").textContent=authMode==="login"?"Login":"Create account";$("authNameWrap").classList.toggle("hidden",authMode!=="signup");$("authPassword").autocomplete=authMode==="login"?"current-password":"new-password";message("authMessage","");});

  $("authForm").onsubmit=async e=>{e.preventDefault();if(!db){noBackend();return;}const email=$("authEmail").value.trim(),password=$("authPassword").value;try{
    if(authMode==="signup"){const display_name=$("authName").value.trim()||email.split("@")[0];const {data,error}=await db.auth.signUp({email,password,options:{data:{display_name}}});if(error)throw error;if(data.user && !data.session){message("authMessage","Account created. Check your email to confirm, then log in.");return;}toast("Account created.");}
    else{const {error}=await db.auth.signInWithPassword({email,password});if(error)throw error;toast("Welcome back.");}
    closeModal("authModal");await refreshAuth();
  }catch(err){message("authMessage",err.message||"Could not sign in.",true);}
  };
  $("guildForm").onsubmit=async e=>{e.preventDefault();if(!user){message("guildMessage","Please log in first.",true);return;}try{const data=await run(db.from("guilds").insert({name:$("guildName").value.trim(),game_id:$("guildGameId").value.trim()||null,description:$("guildDescription").value.trim()||null,logo_url:$("guildLogo").value.trim()||null,leader_id:user.id,status:"pending"}).select().single());message("guildMessage","Guild submitted for admin approval.");$("guildForm").reset();await loadAll();toast("Guild submitted.");}catch(err){message("guildMessage",err.message,true);}};
  $("profileForm").onsubmit=async e=>{e.preventDefault();if(!user)return;try{await run(db.from("profiles").upsert({id:user.id,display_name:$("profileName").value.trim(),ff_uid:$("profileUid").value.trim()||null,updated_at:new Date().toISOString()}));message("profileMessage","Profile saved.");await refreshAuth();}catch(err){message("profileMessage",err.message,true);}};
  $("tournamentForm").onsubmit=async e=>{e.preventDefault();try{await run(db.from("tournaments").insert({name:$("tourName").value.trim(),mode:$("tourMode").value,start_at:new Date($("tourDate").value).toISOString(),max_slots:Number($("tourLimit").value),entry_fee:Number($("tourFee").value)||0,upi_id:$("tourUpi").value.trim()||null,payment_qr_url:$("tourQr").value.trim()||null,prize_description:$("tourPrize").value.trim()||null,status:$("tourStatus").value,created_by:user.id}));$("tournamentForm").reset();$("tourLimit").value=48;toast("Tournament created.");await loadAll();}catch(err){toast(err.message,true);}};
  $("matchForm").onsubmit=async e=>{e.preventDefault();const a=$("matchGuildA").value,b=$("matchGuildB").value;if(!a||!b||a===b){toast("Choose two different guilds.",true);return;}try{await run(db.from("guild_matches").insert({guild_a:a,guild_b:b,scheduled_at:new Date($("matchDate").value).toISOString(),mode:$("matchMode").value,status:"scheduled",created_by:user.id}));$("matchForm").reset();toast("Guild match scheduled.");await loadAll();}catch(err){toast(err.message,true);}};
  $("prizeForm").onsubmit=async e=>{e.preventDefault();try{await run(db.from("monthly_prizes").upsert({month:$("prizeMonth").value,description:$("prizeDescription").value.trim(),updated_by:user.id},{onConflict:"month"}));toast("Monthly prize saved.");await loadAll();}catch(err){toast(err.message,true);}};
  document.querySelectorAll(".admin-tabs [data-tab]").forEach(b=>b.onclick=()=>{document.querySelectorAll(".admin-tabs [data-tab]").forEach(x=>x.classList.toggle("active",x===b));document.querySelectorAll(".admin-tab-content").forEach(x=>x.classList.toggle("hidden",x.id!==b.dataset.tab));});

  async function refreshAuth(){if(!db){renderAuth();return;}const {data}=await db.auth.getSession();user=data.session?.user||null;if(user){profile=await safeRun(()=>run(db.from("profiles").select("*").eq("id",user.id).maybeSingle()),null);if(!profile){const display_name=user.user_metadata?.display_name||user.email.split("@")[0];profile=await safeRun(()=>run(db.from("profiles").upsert({id:user.id,display_name}).select().single()),{display_name});}await safeRun(()=>run(db.from("profiles").select("*").eq("id",user.id).single()).then(p=>profile=p));}else profile=null;renderAuth();await loadDashboard();}
  function renderAuth(){ $("openAuth").classList.toggle("hidden",!!user);$("openDashboard").classList.toggle("hidden",!user);$("logoutBtn").classList.toggle("hidden",!user);$("dashboard").classList.toggle("hidden",!user);if(user)$("roleBadge").textContent=profile?.role==="admin"?"ADMIN":"PLAYER";$("adminPanel").classList.toggle("hidden",profile?.role!=="admin");}
  async function loadAll(){if(!db){renderDemo();return;}await Promise.all([loadTournaments(),loadGuildsAndLeaderboard(),loadChallenges(),loadChampions(),loadAdminData()]);}
  function renderDemo(){ $("tournamentList").innerHTML=`<div class="empty-state">Connect Supabase to load real tournaments. Add records through the admin panel after setup.</div>`;$("challengeList").innerHTML=`<div class="empty-state">Guild challenges will appear here.</div>`;$("leaderboardBody").innerHTML=`<tr><td colspan="5" class="empty-state">Leaderboard will appear after guilds have verified match points.</td></tr>`;$("championsList").innerHTML=`<div class="empty-state">Monthly champions will be saved here.</div>`;$("statTournaments").textContent="0";$("statGuilds").textContent="0";$("statMatches").textContent="0";}
  async function loadTournaments(){
    const rows=await safeRun(()=>run(db.from("tournaments").select("*").order("start_at",{ascending:true})),[]);
    const entryRows=await safeRun(()=>run(db.from("tournament_entries").select("tournament_id,status,payment_status")),[]);
    $("statTournaments").textContent=rows.length;
    $("tournamentList").innerHTML=rows.length?rows.map(t=>{
      const joined=entryRows.filter(e=>e.tournament_id===t.id && (Number(t.entry_fee||0)===0 ? e.status==="registered" : e.payment_status==="approved")).length;
      const fee=Number(t.entry_fee||0)===0?"Free entry":"₹"+Number(t.entry_fee).toFixed(2)+" entry";
      const limit=Number(t.max_slots||0);
      const full=limit>0 && joined>=limit;
      return `<article class="tournament-card"><div class="card-top"><span class="mode-icon">✦</span>${statusPill(t.status)}</div><h3>${esc(t.name)}</h3><p>${esc(t.mode)} tournament · ${esc(fee)}</p><div class="card-meta"><span>START<br><b>${esc(dateFmt(t.start_at))}</b></span><span>SLOTS<br><b>${joined}/${limit||"Open"}</b></span><span>PRIZE<br><b>${esc(t.prize_description||"Champion title")}</b></span></div><div class="card-bottom"><small class="muted">${full?"Slots full":"Register while slots are open"}</small><button class="btn btn-primary btn-small" data-join="${t.id}" ${(t.status!=="upcoming"||full)?"disabled":""}>Join</button></div></article>`;
    }).join(""):`<div class="empty-state">No tournaments yet. Admin can create the first event from the dashboard.</div>`;
    document.querySelectorAll("[data-join]").forEach(b=>b.onclick=()=>joinTournament(b.dataset.join));
  }
  let selectedPaymentTournament = null;

  async function joinTournament(id){
    if(!user){openModal("authModal");return;}
    const t = await safeRun(
      ()=>run(db.from("tournaments").select("*").eq("id",id).single()),
      null
    );
    if(!t){toast("Could not load tournament details.",true);return;}

    if(Number(t.entry_fee||0) <= 0){
      try{
        await run(db.from("tournament_entries").insert({
          tournament_id:id,player_id:user.id,status:"registered",
          payment_status:"free"
        }));
        toast("Tournament entry confirmed.");
        await loadDashboard();
        await loadTournaments();
      }catch(e){
        toast(e.message.includes("duplicate")
          ?"You already joined this tournament.":e.message,true);
      }
      return;
    }

    selectedPaymentTournament = t;
    const upi = t.upi_id
      ? `<p><b>UPI ID:</b> ${esc(t.upi_id)}</p>
         <a class="btn btn-outline btn-small"
            href="upi://pay?pa=${encodeURIComponent(t.upi_id)}&pn=${encodeURIComponent("MATRYX ESPORTS")}&am=${encodeURIComponent(Number(t.entry_fee).toFixed(2))}&cu=INR">Open UPI app</a>`
      : `<p>Admin has not configured a UPI ID yet.</p>`;
    const qr = t.payment_qr_url
      ? `<p><img src="${esc(t.payment_qr_url)}" alt="Tournament payment QR" style="width:100%;max-width:260px;display:block;margin:12px auto;border-radius:12px"></p>`
      : "";
    $("paymentDetails").innerHTML =
      `<h3>${esc(t.name)}</h3>
       <p>Entry fee: <b>₹${Number(t.entry_fee).toFixed(2)}</b></p>
       ${upi}${qr}`;
    $("paymentReference").value = "";
    $("paymentProof").value = "";
    $("paymentMessage").textContent = "";
    openModal("paymentModal");
  }

  $("paymentForm").onsubmit = async e => {
    e.preventDefault();
    if(!user || !selectedPaymentTournament)return;
    const reference = $("paymentReference").value.trim();
    if(!reference){message("paymentMessage","Enter your transaction reference.",true);return;}
    try{
      const t = selectedPaymentTournament;
      await run(db.from("tournament_entries").insert({
        tournament_id:t.id,
        player_id:user.id,
        status:"pending",
        payment_status:"pending",
        transaction_reference:reference,
        payment_proof_url:$("paymentProof").value.trim()||null
      }));
      message("paymentMessage","Submitted. Wait for admin verification.");
      toast("Payment submitted for review.");
      $("paymentForm").reset();
      await loadDashboard();
      await loadTournaments();
    }catch(err){
      message("paymentMessage",
        err.message.includes("duplicate")
          ?"You already submitted an entry for this tournament."
          :err.message,true);
    }
  };

  async function loadGuildsAndLeaderboard(){const guilds=await safeRun(()=>run(db.from("guilds").select("*").eq("status","approved").order("name")),[]);$("statGuilds").textContent=guilds.length;const matches=await safeRun(()=>run(db.from("guild_matches").select("id").gte("scheduled_at",new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString())),[]);$("statMatches").textContent=matches.length;
    const scores=await safeRun(()=>run(db.from("guild_monthly_scores").select("guild_id,points,wins,matches_played,guilds(name,logo_url)").eq("month",monthKey).order("points",{ascending:false})),[]);
    $("leaderboardBody").innerHTML=scores.length?scores.map((s,i)=>`<tr><td>${i===0?"🏆":String(i+1).padStart(2,"0")}</td><td><div class="guild-cell"><span class="guild-avatar">${esc((s.guilds?.name||"?").slice(0,1).toUpperCase())}</span>${esc(s.guilds?.name||"Guild")}</div></td><td>${s.matches_played||0}</td><td>${s.wins||0}</td><td><b>${s.points||0}</b></td></tr>`).join(""):`<tr><td colspan="5" class="empty-state">No verified scores for this month yet.</td></tr>`;
    $("matchGuildA").innerHTML=guilds.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join("");$("matchGuildB").innerHTML=guilds.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join("");}
  async function loadChallenges(){const rows=await safeRun(()=>run(db.from("guild_matches").select("*,guild_a_info:guilds!guild_matches_guild_a_fkey(name),guild_b_info:guilds!guild_matches_guild_b_fkey(name)").in("status",["challenge_pending","scheduled"]).order("scheduled_at",{ascending:true}).limit(10)),[]);$("challengeList").innerHTML=rows.length?rows.map(m=>`<div class="challenge-card"><div><b>${esc(m.guild_a_info?.name||"Guild A")}</b><small>vs ${esc(m.guild_b_info?.name||"Guild B")} · ${esc(m.mode)} · ${esc(dateFmt(m.scheduled_at))}</small></div><div>${statusPill(m.status)}</div></div>`).join(""):`<div class="empty-state">No open challenges or scheduled matches yet.</div>`;}
  async function loadChampions(){const rows=await safeRun(()=>run(db.from("monthly_champions").select("*,guilds(name)").order("month",{ascending:false}).limit(6)),[]);$("championsList").innerHTML=rows.length?rows.map(c=>`<div class="champion-card"><div class="trophy">🏆</div><h3>${esc(c.guilds?.name||"Champion Guild")}</h3><p>${esc(c.month)} champion</p><p>${esc(c.prize_description||"Monthly champion")}</p></div>`).join(""):`<div class="empty-state">Past champions will appear here after the admin declares a winner.</div>`;}
  async function loadDashboard(){if(!db||!user)return; $("profileName").value=profile?.display_name||user.email.split("@")[0];$("profileUid").value=profile?.ff_uid||"";const g=await safeRun(()=>run(db.from("guilds").select("*").eq("leader_id",user.id).order("created_at",{ascending:false}).limit(1)),[]);$("myGuildInfo").innerHTML=g.length?`<div class="admin-item"><div><b>${esc(g[0].name)}</b><small>${esc(g[0].game_id||"No in-game ID")} · ${statusPill(g[0].status)}</small></div></div>`:"No guild linked to this account yet.";const entries=await safeRun(()=>run(db.from("tournament_entries").select("status,tournaments(name,start_at,mode)").eq("player_id",user.id).order("created_at",{ascending:false})),[]);$("myEntries").innerHTML=entries.length?entries.map(e=>`<div class="admin-item"><div><b>${esc(e.tournaments?.name||"Tournament")}</b><small>${esc(e.tournaments?.mode||"")} · ${esc(dateFmt(e.tournaments?.start_at))}</small></div>${statusPill(e.status)}</div>`).join(""):`<div class="empty-state">No tournament entries yet.</div>`;}
  async function loadAdminData(){if(profile?.role!=="admin")return;const ts=await safeRun(()=>run(db.from("tournaments").select("*").order("created_at",{ascending:false})),[]);$("adminTournamentList").innerHTML=ts.map(t=>`<div class="admin-item"><div><b>${esc(t.name)}</b><small>${esc(t.mode)} · ${esc(dateFmt(t.start_at))} · ${esc(t.status)}</small></div><div class="admin-item-actions"><button class="btn btn-outline btn-small" data-tourstatus="${t.id}" data-status="${t.status==="upcoming"?"live":t.status==="live"?"completed":"upcoming"}">Set ${t.status==="upcoming"?"Live":t.status==="live"?"Completed":"Upcoming"}</button><button class="btn btn-outline btn-small" data-tourdelete="${t.id}">Delete</button></div></div>`).join("")||`<div class="empty-state">No tournaments created.</div>`;
    const gs=await safeRun(()=>run(db.from("guilds").select("*,profiles:leader_id(display_name)").order("created_at",{ascending:false})),[]);$("adminGuildList").innerHTML=gs.map(g=>`<div class="admin-item"><div><b>${esc(g.name)}</b><small>Leader: ${esc(g.leader_id)} · ${esc(g.game_id||"No game ID")} · ${esc(g.status)}</small></div><div class="admin-item-actions">${g.status!=="approved"?`<button class="btn btn-primary btn-small" data-guildstatus="${g.id}" data-status="approved">Approve</button>`:""}<button class="btn btn-outline btn-small" data-guildstatus="${g.id}" data-status="rejected">Reject</button></div></div>`).join("")||`<div class="empty-state">No guilds registered.</div>`;
    const ms=await safeRun(()=>run(db.from("guild_matches").select("*,guild_a_info:guilds!guild_matches_guild_a_fkey(name),guild_b_info:guilds!guild_matches_guild_b_fkey(name)").order("scheduled_at",{ascending:false})),[]);$("adminMatchList").innerHTML=ms.map(m=>`<div class="admin-item"><div><b>${esc(m.guild_a_info?.name||"Guild A")} vs ${esc(m.guild_b_info?.name||"Guild B")}</b><small>${esc(dateFmt(m.scheduled_at))} · ${esc(m.mode)} · ${esc(m.status)}</small></div><div class="admin-item-actions"><button class="btn btn-primary btn-small" data-result="${m.id}">Verify result</button></div></div>`).join("")||`<div class="empty-state">No matches scheduled.</div>`;
    const ps=await safeRun(()=>run(db.from("monthly_prizes").select("*").order("month",{ascending:false})),[]);$("adminPrizeList").innerHTML=ps.map(p=>`<div class="admin-item"><div><b>${esc(p.month)}</b><small>${esc(p.description)}</small></div></div>`).join("");
    document.querySelectorAll("[data-tourstatus]").forEach(b=>b.onclick=async()=>{await adminAction(()=>db.from("tournaments").update({status:b.dataset.status}).eq("id",b.dataset.tourstatus));});
    document.querySelectorAll("[data-tourdelete]").forEach(b=>b.onclick=async()=>{if(confirm("Delete this tournament?"))await adminAction(()=>db.from("tournaments").delete().eq("id",b.dataset.tourdelete));});
    document.querySelectorAll("[data-guildstatus]").forEach(b=>b.onclick=async()=>{await adminAction(()=>db.from("guilds").update({status:b.dataset.status}).eq("id",b.dataset.guildstatus));});
    document.querySelectorAll("[data-result]").forEach(b=>b.onclick=async()=>{const winner=prompt("Enter winner guild ID (copy from guild list), or leave blank for draw:");if(winner===null)return;const points=prompt("Points to award to winning guild (default 3):","3");const p=Math.max(0,Number(points||3));await adminAction(async()=>{const m=await run(db.from("guild_matches").select("*").eq("id",b.dataset.result).single());let winnerId=winner.trim()||null;if(winnerId && winnerId!==m.guild_a && winnerId!==m.guild_b)throw new Error("Winner ID must match Guild A or Guild B.");const {error}=await db.from("guild_matches").update({status:"completed",winner_guild_id:winnerId,verified:true,verified_by:user.id,verified_at:new Date().toISOString(),points_awarded:p}).eq("id",m.id);if(error)throw error;});});
  }
  async function adminAction(fn){try{await run(typeof fn==="function"?fn():fn);toast("Admin update saved.");await loadAll();}catch(e){toast(e.message,true);}}
  // Guild leader challenge flow: button appears on each approved guild card in the guild list below.
  // The leader can choose a target guild; admin may review pending challenges.
  async function loadGuildDirectory(){/* directory is intentionally handled through guild registration and leaderboard for the compact starter UI. */}
  if(db){db.auth.onAuthStateChange(()=>setTimeout(()=>refreshAuth(),0));}else renderDemo();
  loadAll();refreshAuth();
})();