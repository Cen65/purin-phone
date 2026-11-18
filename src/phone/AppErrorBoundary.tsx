import { Component, type ErrorInfo, type ReactNode } from "react";
import { usePhoneStore } from "../state/phoneStore";

interface Props {
  children: ReactNode;
  appName: string;
}

interface State {
  error: Error | null;
}

/** App 级错误边界：单个 App 崩溃只显示错误页，不拖垮整个手机系统。 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[app:${this.props.appName}] crashed`, error, info);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="app-error">
          <p className="app-error-title">😢 「{this.props.appName}」出了点问题</p>
          <pre className="app-error-detail">{String(this.state.error.message ?? this.state.error)}</pre>
          <div className="app-error-actions">
            <button type="button" onClick={() => this.setState({ error: null })}>
              重试
            </button>
            <button type="button" className="secondary" onClick={() => usePhoneStore.getState().goHome()}>
              回到桌面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
