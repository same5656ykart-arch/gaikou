import { useRoute } from './store';
import { Home } from './screens/Home';
import { ProjectScreen } from './screens/Project';
import { SettingsScreen } from './screens/Settings';
import { Overlays } from './ui/Overlays';

export function App() {
  const route = useRoute();
  return (
    <>
      <div className="app">
        {route.name === 'home' && <Home />}
        {route.name === 'settings' && <SettingsScreen />}
        {route.name === 'project' && <ProjectScreen key={route.id} id={route.id} tab={route.tab} />}
      </div>
      <Overlays />
    </>
  );
}
