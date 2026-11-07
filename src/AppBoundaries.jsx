import React from 'react';
export class AppErrorBoundary extends React.Component{
 constructor(props){super(props);this.state={failed:false}}
 static getDerivedStateFromError(){return {failed:true}}
 componentDidCatch(error,info){console.error('Tabletop Forge UI error',error,info)}
 render(){
  if(this.state.failed)return <div className="welcome-screen">
   <section className="welcome-shell welcome-auth">
    <h2>A tabletop window encountered an error</h2>
    <p className="muted">Your campaign data is still saved. Reloading will reopen Tabletop Forge.</p>
    <button type="button" onClick={()=>location.reload()}>Reload Tabletop Forge</button>
   </section>
  </div>;
  return this.props.children;
 }
}
export function QuickEditBoundary({children,onClose}){
 return <LocalErrorBoundary onClose={onClose}>{children}</LocalErrorBoundary>;
}
class LocalErrorBoundary extends React.Component{
 constructor(props){super(props);this.state={failed:false}}
 static getDerivedStateFromError(){return {failed:true}}
 componentDidCatch(error,info){console.error('Token quick-edit error',error,info)}
 render(){
  if(!this.state.failed)return this.props.children;
  return <div className="modal-backdrop">
   <section className="modal quick-token-modal" role="dialog" aria-modal="true">
    <h2>Could not open token controls</h2>
    <p className="muted small">The tabletop is still available. Close this window and try again.</p>
    <button type="button" onClick={this.props.onClose}>Close</button>
   </section>
  </div>;
 }
}
