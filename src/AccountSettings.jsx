import React,{useState} from 'react';
import FloatingWindow from './FloatingWindow.jsx';
import {accountDisplayName,isNativeUsernameAccount,
 normalizeAccountUsername,validateAccountUsername,validateAccountPassword} from './AccountIdentity.js';

export default function AccountSettings({db,user,onClose,onUpdated}){
 const [username,setUsername]=useState(()=>accountDisplayName(user));
 const [password,setPassword]=useState(''),[confirm,setConfirm]=useState('');
 const [currentPassword,setCurrentPassword]=useState('');
 const [working,setWorking]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const native=isNativeUsernameAccount(user);
 const providers=(user?.identities||[]).map(identity=>identity.provider)
  .filter((provider,index,array)=>array.indexOf(provider)===index);
 const message=error=>error?.message||String(error);
 async function rename(e){
  e.preventDefault();setError('');setNotice('');
  let requested;
  try{requested=validateAccountUsername(username)}catch(err){setError(message(err));return}
  if(requested===normalizeAccountUsername(accountDisplayName(user))){
   setNotice('This username is already set.');return;
  }
  setWorking('name');
  try{
   const {data,error:saveError}=await db.functions.invoke('username-update',{
    body:{username:requested}
   });
   if(saveError){
    let details=null;
    try{details=await saveError.context?.json()}catch{}
    throw Error(details?.error||saveError.message||'Unable to change username.');
   }
   if(!data?.ok)throw Error(data?.error||'Unable to change username.');
   // Refresh metadata and JWT after a username-based email alias changes.
   const {error:refreshError}=await db.auth.refreshSession();
   if(refreshError)console.warn('Account saved, but session refresh failed',refreshError);
   await onUpdated?.();
   setUsername(requested);
   setNotice(native?
    'Username updated. Sign in with '+requested+' next time.':
    'Username updated. Your Google/Discord login remains connected.');
  }catch(err){
   setError(message(err)+
    (/not found|failed to send a request|404/i.test(message(err))?
      ' The username-update account service must be deployed before this feature can be used.':''));
  }finally{setWorking('')}
 }
 async function changePassword(e){
  e.preventDefault();setError('');setNotice('');
  try{validateAccountPassword(password,confirm,username)}
  catch(err){setError(message(err));return}
  setWorking('password');
  try{
   const fields={password};
   // Supabase honours current_password when the project requires it. OAuth
   // accounts can set their first password without an existing one.
   if(currentPassword)fields.current_password=currentPassword;
   const {error:saveError}=await db.auth.updateUser(fields);
   if(saveError)throw saveError;
   setPassword('');setConfirm('');setCurrentPassword('');
   setNotice('Password saved. You can continue to sign in with your linked social provider, too.');
   await onUpdated?.();
  }catch(err){setError(message(err))}
  finally{setWorking('')}
 }
 return <FloatingWindow kind="account" onClose={onClose}>
  <section className="modal account-settings-dialog" role="dialog" aria-label="Account Settings">
   <div className="heading"><h2>Account Settings</h2>
    <button type="button" className="secondary" onClick={onClose}
     aria-label="Close Account Settings">✕</button></div>
   <div className="account-settings-scroll">
    <p className="muted small">Manage the name other players see and the credentials used to sign in.</p>
    <div className="account-login-info">
     <strong>Account</strong>
     <span>{native?'Username and password':providers.length?
      providers.join(', ')+' account':'Email account'}</span>
     {user?.email&&!native&&<small>{user.email}</small>}
    </div>
    <form onSubmit={rename} className="account-settings-form">
     <h3>Username</h3>
     <label>Username
      <input autoComplete="username" value={username} required maxLength={24}
       onChange={e=>setUsername(e.target.value)}
       placeholder="Your username" disabled={!!working}/>
     </label>
     <p className="muted tiny">{native?
      'Changing this also updates the username you use to log in.':
      'This changes your display username. Your connected social account still works for sign-in.'}</p>
     <button disabled={!!working} type="submit">
      {working==='name'?'Saving…':'Save username'}</button>
    </form>
    <form onSubmit={changePassword} className="account-settings-form">
     <h3>{native?'Change password':'Set or change password'}</h3>
     <p className="muted tiny">{native?
      'Enter a new password. If your account requires your current password, enter it below.':
      'Set a password to add password-based sign-in to your Google/Discord account. Social sign-in remains available.'}</p>
     <label>Current password <span className="muted tiny">(if already set)</span>
      <input type="password" autoComplete="current-password" value={currentPassword}
       onChange={e=>setCurrentPassword(e.target.value)} disabled={!!working}/>
     </label>
     <label>New password
      <input type="password" autoComplete="new-password" minLength={10}
       maxLength={128} required value={password}
       onChange={e=>setPassword(e.target.value)} disabled={!!working}/>
     </label>
     <label>Confirm new password
      <input type="password" autoComplete="new-password" minLength={10}
       maxLength={128} required value={confirm}
       onChange={e=>setConfirm(e.target.value)} disabled={!!working}/>
     </label>
     <button disabled={!!working} type="submit">
      {working==='password'?'Saving…':native?'Change password':'Save password'}</button>
    </form>
    {error&&<p className="error small" role="alert">{error}</p>}
    {notice&&<p className="good small" role="status">{notice}</p>}
   </div>
  </section>
 </FloatingWindow>;
}
