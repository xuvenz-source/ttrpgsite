import React,{useEffect,useRef,useState} from 'react';

const SCRIPT_URL='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loadPromise=null;
function turnstileApi(){
 if(window.turnstile)return Promise.resolve(window.turnstile);
 if(loadPromise)return loadPromise;
 loadPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src=SCRIPT_URL;script.async=true;
  script.onload=()=>window.turnstile?resolve(window.turnstile):reject(Error('CAPTCHA failed to initialize'));
  script.onerror=()=>reject(Error('CAPTCHA could not load. Check your connection or content blockers.'));
  document.head.appendChild(script);
 }).catch(error=>{loadPromise=null;throw error});
 return loadPromise;
}

/** Turnstile is only a user experience. The Edge Function performs mandatory
 * server-side Siteverify with the private key and rejects any missing token. */
export default function SignupCaptcha({siteKey,onToken,resetSignal}){
 const host=useRef(null),widget=useRef(null),apiRef=useRef(null);
 const [error,setError]=useState('');
 useEffect(()=>{
  if(!siteKey)return;
  let active=true;
  void turnstileApi().then(api=>{
   if(!active||!host.current)return;
   apiRef.current=api;
   widget.current=api.render(host.current,{
    sitekey:siteKey,action:'username-register',theme:'auto',size:'flexible',
    callback:token=>{if(active){setError('');onToken(token)}},
    'expired-callback':()=>{if(active){onToken('');setError('Verification expired. Please try again.')}},
    'error-callback':()=>{if(active){onToken('');setError('CAPTCHA failed. Please retry the challenge.')}}
   });
  }).catch(e=>{if(active){onToken('');setError(e.message)}});
  return()=>{
   active=false;
   if(widget.current!==null&&apiRef.current){
    try{apiRef.current.remove(widget.current)}catch{}
   }
   widget.current=null;
  };
 },[siteKey,onToken]);
 useEffect(()=>{
  if(!resetSignal||!apiRef.current||widget.current===null)return;
  try{apiRef.current.reset(widget.current);onToken('');setError('')}catch{}
 },[resetSignal,onToken]);
 if(!siteKey)return <p role="alert" className="error small">
  Account creation is temporarily unavailable: CAPTCHA is not configured.
 </p>;
 return <div className="signup-captcha">
  <div ref={host} aria-label="Human verification for account signup"/>
  {error&&<p role="alert" className="error small">{error}</p>}
 </div>;
}
