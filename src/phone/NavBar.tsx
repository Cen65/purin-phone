import { usePhoneStore } from "../state/phoneStore";

/** 底部 Home 指示条：点击回桌面 */
export function NavBar() {
  const goHome = usePhoneStore((s) => s.goHome);
  return (
    <nav className="nav-bar">
      <button type="button" className="nav-pill" onClick={goHome} aria-label="主屏幕" />
    </nav>
  );
}
