/**
 * H5 应用根。
 *
 * 嵌套顺序：
 *   AuthProvider (mutation 需要 access_token)
 *     → BrowserRouter (路由必须在 AppProvider 外，否则 useNavigate 在 fetch 取消时拿不到上下文)
 *       → AppProvider (data + state)
 *         → ToastProvider (QQ 接单 / 限流 / 错误提示)
 *           → Layout (路由 + 状态屏 + sheet + admin)
 */
import { BrowserRouter } from "react-router-dom";
import { AppProvider } from "./store/AppContext";
import { AuthProvider } from "./store/AuthContext";
import { ToastProvider } from "./components/ToastProvider";
import { Layout } from "./Layout";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppProvider>
          <ToastProvider>
            <Layout />
          </ToastProvider>
        </AppProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
