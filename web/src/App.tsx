import { lazy, Suspense } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { Landing } from './landing/Landing';
import { Skeleton } from './design/feedback';

const ConsoleRoot = lazy(() => import('./console/Root').then((m) => ({ default: m.ConsoleRoot })));
const Login = lazy(() => import('./console/Login').then((m) => ({ default: m.Login })));
const Shell = lazy(() => import('./console/Shell').then((m) => ({ default: m.Shell })));
const Live = lazy(() => import('./console/Live').then((m) => ({ default: m.Live })));
const Memory = lazy(() => import('./console/Memory').then((m) => ({ default: m.Memory })));
const WordMapPage = lazy(() => import('./console/WordMapPage').then((m) => ({ default: m.WordMapPage })));
const Runs = lazy(() => import('./console/Runs').then((m) => ({ default: m.Runs })));
const RunPage = lazy(() => import('./console/Runs').then((m) => ({ default: m.RunPage })));
const EvalPage = lazy(() => import('./console/EvalPage').then((m) => ({ default: m.EvalPage })));
const Settings = lazy(() => import('./console/Settings').then((m) => ({ default: m.Settings })));
const Kitchen = lazy(() => import('./console/Kitchen').then((m) => ({ default: m.Kitchen })));

const page = (el: React.ReactElement) => (
  <Suspense fallback={<Skeleton className="m-6 h-64" />}>{el}</Suspense>
);

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route element={page(<ConsoleRoot />)}>
        <Route path="/login" element={page(<Login />)} />
        <Route path="/app" element={page(<Shell />)}>
          <Route index element={<Navigate to="live" replace />} />
          <Route path="live" element={page(<Live />)} />
          <Route path="memory" element={page(<Memory />)} />
          <Route path="wordmap" element={page(<WordMapPage />)} />
          <Route path="runs" element={page(<Runs />)} />
          <Route path="runs/:id" element={page(<RunPage />)} />
          <Route path="eval" element={page(<EvalPage />)} />
          <Route path="settings" element={page(<Settings />)} />
          <Route path="_kitchen" element={page(<Kitchen />)} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
