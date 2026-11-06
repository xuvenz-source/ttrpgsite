import React,{useState} from 'react';

const NAME=/^[a-z][a-z0-9_]{2,23}$/i;
const RESERVED_DOMAIN='accounts.tabletopforge.example.com';
export const usernameEmail=(username)=>username.trim().toLowerCase()+'@'+RESERVED_DOMAIN;
const errText=e=>e?.message||String(e);

export function AuthGate({db}){
 const[mode,setMode]=useState('login');
 const[username,setUsername]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState('');
 const[legacyEmail,setLegacyEmail]=useState('');
 const[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const signup=mode==='register';
 async function submit(e){
  e.preventDefault();setError('');setNotice('');
  const raw=username.trim();
  if(signup&&!NAME.test(raw))return setError('Usernames need 3–24 characters: letters, numbers or underscores, starting with a letter.');
  if(signup&&password.length<10)return setError('Use a password of at least 10 characters.');
  if(signup&&password!==confirm)return setError('Passwords do not match.');
  if(!signup&&!raw)return setError('Enter your username or existing account email.');
  setBusy(true);let created=false;
  try{
   if(signup){
    const {data,error:registrationError}=await db.functions.invoke('username-register',{
     body:{username:raw,password}
    });
    if(registrationError){
     let details=null;
     try{details=await registrationError.context?.json()}catch{}
     throw Error(details?.error||registrationError.message||'Could not create account.');
    }
    if(!data?.ok)throw Error(data?.error||'Could not create your account.');
    created=true;
   }
   const email=raw.includes('@')&&!signup?raw:usernameEmail(raw);
   const {error:loginError}=await db.auth.signInWithPassword({email,password});
   if(loginError)throw loginError;
  }catch(e){
   if(created){
    setMode('login');setError('Account created, but automatic sign-in failed. Sign in with the same username and password. '+errText(e));
   }else setError(errText(e));
  }finally{setBusy(false)}
 }
 async function legacyLink(e){
  e.preventDefault();setError('');setNotice('');setBusy(true);
  try{
   const {error}=await db.auth.signInWithOtp({
    email:legacyEmail.trim(),options:{emailRedirectTo:location.origin}
   });
   if(error)throw error;
   setNotice('Sign-in link sent. Check the mailbox for your existing account.');
  }catch(e){setError(errText(e))}
  finally{setBusy(false)}
 }
 async function social(provider){
  setError('');setNotice('');setBusy(true);
  try{
   const {error}=await db.auth.signInWithOAuth({provider,options:{redirectTo:location.origin}});
   if(error)throw error;
  }catch(e){
   const msg=errText(e);
   setError(/Unsupported provider|provider is not enabled|validation_failed/i.test(msg)?
    (provider==='discord'?'Discord':'This social sign-in method')+
    ' sign-in is not enabled for Tabletop Forge yet. Use Create account with a username and password until the site administrator configures OAuth.':
    msg);
   setBusy(false);
  }
 }
 return <div className="welcome-screen">
  <div className="welcome-shell welcome-auth">
   <div className="welcome-brand">⚔ Tabletop Forge</div>
   <p className="muted">Your campaigns, maps and character sheets in one place.</p>
   <div className="welcome-tabs">
    <button type="button" className={mode==='login'?'selected':''} onClick={()=>{setMode('login');setError('');setNotice('')}}>Sign in</button>
    <button type="button" className={mode==='register'?'selected':''} onClick={()=>{setMode('register');setError('');setNotice('')}}>Create account</button>
   </div>
   <form className="welcome-form" onSubmit={submit}>
    <label>{signup?'Username':'Username or existing email'}
     <input autoComplete="username" placeholder={signup?'Choose a username':'Username or email'} required
      maxLength={120} value={username} onChange={e=>setUsername(e.target.value)}/>
    </label>
    <label>Password
     <input type="password" minLength={signup?10:undefined} required autoComplete={signup?'new-password':'current-password'}
      placeholder={signup?'At least 10 characters':'Your password'} value={password}
      onChange={e=>setPassword(e.target.value)}/>
    </label>
    {signup&&<label>Confirm password
     <input type="password" minLength={10} required autoComplete="new-password"
      placeholder="Repeat password" value={confirm} onChange={e=>setConfirm(e.target.value)}/>
    </label>}
    {signup&&<p className="muted tiny">No email is needed for these accounts. You won't receive a verification link, but password recovery by email is unavailable. Keep your credentials secure.</p>}
    {error&&<p className="error small" role="alert">{error}</p>}
    {notice&&<p className="good small" role="status">{notice}</p>}
    <button type="submit" disabled={busy}>{busy?'Working…':signup?'Create account':'Sign in'}</button>
   </form>
   <div className="welcome-social">
    <div className="welcome-or"><span>or continue with</span></div>
    <div className="welcome-social-options">
     <button type="button" className="secondary" disabled={busy} onClick={()=>social('google')}>Google</button>
     <button type="button" className="secondary" disabled={busy} onClick={()=>social('discord')}>Discord</button>
    </div>
    <p className="muted tiny">Google and Discord require the corresponding sign-in providers to be enabled by the app administrator.</p>
   </div>
   <details className="welcome-legacy">
    <summary>Use an email sign-in link (existing accounts)</summary>
    <form onSubmit={legacyLink} className="welcome-form">
     <label>Email address<input type="email" required placeholder="Your existing email"
      autoComplete="email" value={legacyEmail} onChange={e=>setLegacyEmail(e.target.value)}/></label>
     <button type="submit" className="secondary" disabled={busy}>Email me a sign-in link</button>
    </form>
   </details>
  </div>
 </div>;
}

export function CampaignHub({
 campaigns,loading,roles,accountLabel,createName,onCreateName,inviteCode,onInviteChange,
 onCreate,onJoin,onSelect,onSignOut,error,onClearError
}){
 const[showCreate,setShowCreate]=useState(false);
 const[showJoin,setShowJoin]=useState(!!inviteCode);
 return <div className="welcome-screen">
  <div className="welcome-shell welcome-hub">
   <div className="welcome-hub-top">
    <div><div className="welcome-brand">⚔ Tabletop Forge</div>
     <p className="muted small">Welcome, {accountLabel}. Choose a campaign to enter.</p>
    </div>
    <button type="button" className="secondary" onClick={onSignOut}>Sign out</button>
   </div>
   {error&&<div className="error alert" role="alert" onClick={onClearError}>{error} ✕</div>}
   <div className="welcome-heading">
    <h2>Your campaigns</h2><span className="muted small">{campaigns.length} joined</span>
   </div>
   {loading?<p className="muted small" role="status">Loading your campaigns…</p>:
   campaigns.length>0?<div className="welcome-campaigns">
    {campaigns.map(c=><button type="button" className="welcome-campaign" key={c.id} onClick={()=>onSelect(c.id)}>
     <span className="welcome-campaign-symbol">⚔</span>
     <span className="welcome-campaign-name">{c.name}</span>
     <span className="welcome-campaign-role">{roles[c.id]==='dm'?'Dungeon Master':'Player'}</span>
     <span className="welcome-enter">Enter →</span>
    </button>)}
   </div>:<div className="welcome-empty">
    <strong>No campaigns yet</strong>
    <p className="muted small">Create one as a DM or join a game with an invite code.</p>
   </div>}
   <div className="welcome-actions">
    <section className="welcome-action">
     <button type="button" className="secondary full-button" onClick={()=>setShowCreate(v=>!v)} aria-expanded={showCreate}>+ Create campaign</button>
     {showCreate&&<form onSubmit={onCreate} className="welcome-form">
      <label>Campaign name<input value={createName} maxLength={100} required
       onChange={e=>onCreateName(e.target.value)} placeholder="Your new campaign"/></label>
      <button type="submit">Create & enter campaign</button>
     </form>}
    </section>
    <section className="welcome-action">
     <button type="button" className="secondary full-button" onClick={()=>setShowJoin(v=>!v)} aria-expanded={showJoin}>+ Join with invite code</button>
     {showJoin&&<form onSubmit={onJoin} className="welcome-form">
      <label>Invite code<input value={inviteCode} required
       onChange={e=>onInviteChange(e.target.value)} placeholder="Enter invite code"/></label>
      <button type="submit">Join & enter campaign</button>
     </form>}
    </section>
   </div>
  </div>
 </div>;
}
