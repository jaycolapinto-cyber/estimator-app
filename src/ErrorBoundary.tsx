import React from "react";

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { error };
  }

  componentDidCatch(error: any, info: any) {
    console.error("App crashed:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 18, fontFamily: "system-ui" }}>
          <h2 style={{ margin: 0 }}>App crashed (live)</h2>
          <pre
            style={{
              marginTop: 12,
              whiteSpace: "pre-wrap",
              background: "#111827",
              color: "#e5e7eb",
              padding: 12,
              borderRadius: 8,
            }}
          >
            {this.state.error?.message || String(this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
