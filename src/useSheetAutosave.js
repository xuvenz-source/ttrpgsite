import {useCallback,useEffect,useRef,useState} from 'react';

/** Reusable serial autosave for large editable sheets.
 * Changes show locally as the user types. Network writes are coalesced and
 * serialized; leaving a sheet flushes the latest snapshot before closing.
 * Errors retain the draft and are never silently described as saved. */
export default function useSheetAutosave({value,initialValue,onSave,delay=300,enabled=true}){
 const latest=useRef(value),persisted=useRef(JSON.stringify(initialValue));
 const queue=useRef(Promise.resolve()),timer=useRef(null);
 const saveRef=useRef(onSave),active=useRef(true);
 const [status,setStatus]=useState('Saved'),[error,setError]=useState('');
 latest.current=value;saveRef.current=onSave;
 const flush=useCallback(async()=>{
  if(timer.current!==null){clearTimeout(timer.current);timer.current=null}
  if(!enabled)return;
  const snapshot=structuredClone(latest.current),encoded=JSON.stringify(snapshot);
  const write=queue.current.catch(()=>{}).then(async()=>{
   if(encoded===persisted.current)return;
   if(active.current){setStatus('Saving…');setError('')}
   await saveRef.current(snapshot);
   persisted.current=encoded;
   if(active.current){
    setStatus(JSON.stringify(latest.current)===encoded?'Saved':'Saving…');
   }
  });
  queue.current=write.catch(()=>{});
  try{await write}
  catch(e){
   if(active.current){
    setError(e?.message||String(e));setStatus('Save failed');
   }
   throw e;
  }
 },[enabled]);
 useEffect(()=>{
  if(!enabled)return;
  if(JSON.stringify(value)===persisted.current)return;
  setStatus('Saving…');
  if(timer.current!==null)clearTimeout(timer.current);
  timer.current=setTimeout(()=>{timer.current=null;void flush().catch(()=>{})},delay);
  return()=>{if(timer.current!==null){clearTimeout(timer.current);timer.current=null}};
 },[value,enabled,delay,flush]);
 useEffect(()=>()=>{
  active.current=false;
  if(timer.current!==null)clearTimeout(timer.current);
 },[]);
 return {status,error,flush,hasPending:JSON.stringify(value)!==persisted.current};
}
