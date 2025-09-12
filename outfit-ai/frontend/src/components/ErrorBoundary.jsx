import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state = { error:null }; }
  static getDerivedStateFromError(e){ return { error:e }; }
  componentDidCatch(e, info){ console.error("❌ UI crash:", e, info); }
  render(){
    if (this.state.error) {
      return (
        <div style={{padding:24}}>
          <h2>Something went wrong</h2>
          <pre style={{whiteSpace:'pre-wrap',background:'#fff0f4',padding:12,borderRadius:12}}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
