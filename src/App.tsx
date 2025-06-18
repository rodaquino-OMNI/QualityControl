import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { useAppSelector } from './hooks/redux';

function App() {
  const theme = useAppSelector((state) => state.ui?.theme || 'light');

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <Routes>
        <Route path="/" element={<div className="p-8 text-center">
          <h1 className="text-4xl font-bold text-gray-800 dark:text-white mb-4">
            AUSTA Cockpit
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Platform for human and AI interaction deployed on quality control of production in Healthcare
          </p>
        </div>} />
      </Routes>
    </div>
  );
}

export default App;