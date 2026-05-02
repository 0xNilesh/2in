// Router map.
//   / and /onboarding render full-screen — no shell.
//   Everything else renders inside AppShell (rail + center + work pane).

import { Routes, Route } from 'react-router-dom';
import { AppShell } from './layout/AppShell.jsx';
import Landing from './routes/Landing.jsx';
import Onboarding from './routes/Onboarding.jsx';
import Chat from './routes/Chat.jsx';
import TeamChat from './routes/TeamChat.jsx';
import Activity from './routes/Activity.jsx';
import Specialist from './routes/Specialist.jsx';
import Memory from './routes/Memory.jsx';
import Patterns from './routes/Patterns.jsx';
import Tools from './routes/Tools.jsx';
import Library from './routes/Library.jsx';
import Settings from './routes/Settings.jsx';
import NotFound from './routes/NotFound.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route element={<AppShell />}>
        <Route path="chat" element={<Chat />} />
        <Route path="chat/:threadId" element={<Chat />} />
        <Route path="team/:specialistId" element={<TeamChat />} />
        <Route path="activity" element={<Activity />} />
        <Route path="specialist/:id" element={<Specialist />} />
        <Route path="memory" element={<Memory />} />
        <Route path="memory/:sliceId" element={<Memory />} />
        <Route path="patterns" element={<Patterns />} />
        <Route path="tools" element={<Tools />} />
        <Route path="library" element={<Library />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
