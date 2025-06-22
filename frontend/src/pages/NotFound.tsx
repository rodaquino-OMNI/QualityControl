import React from 'react';
import { Link } from 'react-router-dom';

const NotFound: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="mb-8">
          <h1 className="text-9xl font-bold text-slate-600 mb-4">404</h1>
          <h2 className="text-3xl font-semibold text-white mb-2">Página não encontrada</h2>
          <p className="text-slate-400">A página que você está procurando não existe ou foi movida.</p>
        </div>
        
        <div className="space-x-4">
          <Link 
            to="/dashboard" 
            className="inline-flex items-center px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors"
          >
            Ir ao Dashboard
          </Link>
          <button 
            onClick={() => window.history.back()} 
            className="inline-flex items-center px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors border border-slate-600"
          >
            Voltar
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;