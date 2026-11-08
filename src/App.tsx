import { DetailPanel } from './components/DetailPanel';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { MapView } from './map/MapView';
import { useUI } from './state/store';

function Toasts() {
  const toasts = useUI((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <Sidebar />
        <MapView />
        <DetailPanel />
      </div>
      <Toasts />
    </div>
  );
}
