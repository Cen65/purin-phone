import { StatusBar } from "./StatusBar";
import { HomeScreen } from "./HomeScreen";
import { AppHost } from "./AppHost";
import { NavBar } from "./NavBar";
import { NotificationHost } from "./NotificationHost";
import { LockScreen } from "./LockScreen";
import { CallHost } from "./CallHost";
import { usePhoneStore } from "../state/phoneStore";

/**
 * 手机壳：设备外框 + 状态栏 + 桌面/App 宿主 + 导航条 + 通知层 + 通话层 + 锁屏。
 * 所有内容 App 都在这个框架内运行。
 */
export function PhoneShell() {
  const activeAppId = usePhoneStore((s) => s.activeAppId);
  const locked = usePhoneStore((s) => s.locked);
  return (
    <div className="phone-frame">
      <StatusBar />
      <div className="phone-content">{activeAppId ? <AppHost /> : <HomeScreen />}</div>
      {activeAppId && <NavBar />}
      <NotificationHost />
      <CallHost />
      {locked && <LockScreen />}
    </div>
  );
}
