import React from 'react';
import { useAppSelector } from '../store/hooks';

const Dashboard: React.FC = () => {
  const user = useAppSelector((state) => state.auth.user);

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <span className="text-lg">🏥</span>
            </div>
            <h1 className="text-xl font-bold text-white">AUSTA Cockpit</h1>
          </div>
          
          <div className="flex items-center space-x-4">
            <span className="text-slate-300">{user?.firstName} {user?.lastName}</span>
            <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center font-bold">
              AS
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Grid */}
      <div className="grid grid-cols-12 h-[calc(100vh-73px)]">
        {/* Left Sidebar - Cases Queue */}
        <div className="col-span-3 bg-slate-800 border-r border-slate-700 p-4 overflow-y-auto">
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center">
              <span className="text-orange-500 mr-2">📋</span>
              Casos Pendentes (12)
            </h2>
            
            {/* Filter Buttons */}
            <div className="flex space-x-2 mb-4">
              <button className="px-3 py-1 bg-primary-600 text-white text-sm rounded-lg">Todos</button>
              <button className="px-3 py-1 bg-slate-700 text-slate-300 text-sm rounded-lg hover:bg-slate-600">Alta Prior.</button>
              <button className="px-3 py-1 bg-slate-700 text-slate-300 text-sm rounded-lg hover:bg-slate-600">Complexos</button>
            </div>
          </div>

          {/* Case Items */}
          <div className="space-y-3">
            <div className="border-l-4 border-red-500 bg-slate-700/50 p-4 rounded-r-lg hover:bg-slate-700 transition-colors cursor-pointer">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-primary-400 font-semibold">#AUT-2024-7834</h3>
                <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">ALTA</span>
              </div>
              <p className="text-white font-medium">Maria Santos</p>
              <p className="text-slate-400 text-sm">Oncologia - Quimioterapia</p>
              <div className="flex items-center mt-3 space-x-4">
                <span className="flex items-center text-slate-400 text-xs">
                  <span className="w-2 h-2 bg-yellow-500 rounded-full mr-1"></span>
                  15 min
                </span>
                <span className="text-slate-400 text-xs">💰 R$ 45.000</span>
                <span className="text-slate-400 text-xs">🤖 85% IA</span>
              </div>
            </div>

            <div className="border-l-4 border-yellow-500 bg-slate-700/50 p-4 rounded-r-lg hover:bg-slate-700 transition-colors cursor-pointer">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-primary-400 font-semibold">#AUT-2024-7835</h3>
                <span className="bg-yellow-500 text-white text-xs px-2 py-1 rounded-full">MÉDIA</span>
              </div>
              <p className="text-white font-medium">João Oliveira</p>
              <p className="text-slate-400 text-sm">Cardiologia - Cateterismo</p>
              <div className="flex items-center mt-3 space-x-4">
                <span className="flex items-center text-slate-400 text-xs">
                  <span className="w-2 h-2 bg-yellow-500 rounded-full mr-1"></span>
                  8 min
                </span>
                <span className="text-slate-400 text-xs">💰 R$ 12.000</span>
                <span className="text-slate-400 text-xs">🤖 72% IA</span>
              </div>
            </div>

            <div className="border-l-4 border-green-500 bg-slate-700/50 p-4 rounded-r-lg hover:bg-slate-700 transition-colors cursor-pointer">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-primary-400 font-semibold">#AUT-2024-7836</h3>
                <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-full">BAIXA</span>
              </div>
              <p className="text-white font-medium">Pedro Lima</p>
              <p className="text-slate-400 text-sm">Ortopedia - Ressonância</p>
              <div className="flex items-center mt-3 space-x-4">
                <span className="flex items-center text-slate-400 text-xs">
                  <span className="w-2 h-2 bg-yellow-500 rounded-full mr-1"></span>
                  5 min
                </span>
                <span className="text-slate-400 text-xs">💰 R$ 1.200</span>
                <span className="text-slate-400 text-xs">🤖 91% IA</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content - Case Analysis */}
        <div className="col-span-6 p-6 overflow-y-auto">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">Análise do Caso #AUT-2024-7834</h2>
              <div className="flex space-x-3">
                <button className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors">
                  📞 Contatar Prestador
                </button>
                <button className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors">
                  💡 Segunda Opinião
                </button>
              </div>
            </div>
          </div>

          {/* Case Details Grid */}
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
              <h3 className="text-slate-400 text-sm mb-2">Paciente</h3>
              <h4 className="text-xl font-semibold text-white mb-1">Maria Santos, 45 anos</h4>
              <p className="text-slate-400">CPF: ••••••789-••</p>
            </div>

            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
              <h3 className="text-slate-400 text-sm mb-2">Procedimento</h3>
              <h4 className="text-xl font-semibold text-white mb-1">Quimioterapia - Protocolo AC</h4>
              <p className="text-slate-400">CID: C50.9</p>
            </div>

            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
              <h3 className="text-slate-400 text-sm mb-2">Prestador</h3>
              <h4 className="text-xl font-semibold text-white mb-1">Hospital Sírio-Libanês</h4>
              <p className="text-slate-400">Dr. Roberto Costa</p>
            </div>

            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
              <h3 className="text-slate-400 text-sm mb-2">Valor Total</h3>
              <h4 className="text-2xl font-bold text-orange-400 mb-1">R$ 45.000,00</h4>
              <p className="text-slate-400">4 sessões</p>
            </div>
          </div>

          {/* AI Analysis */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mb-6">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center mr-3">
                <span className="text-lg">🤖</span>
              </div>
              <div>
                <h3 className="font-semibold text-white">Olá Dr. Ana! Identifiquei uma discrepância no valor solicitado.</h3>
                <p className="text-slate-400 text-sm">Gostaria que eu faça uma análise comparativa com casos similares?</p>
              </div>
            </div>
            <button className="w-full bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-lg font-medium transition-colors">
              Sim, por favor. Inclua também prestadores da mesma região.
            </button>
          </div>

          {/* Analysis Progress */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center mr-3">
                <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <span className="text-white">Analisando 47 casos similares...</span>
            </div>
          </div>

          {/* Chat Input */}
          <div className="mt-6">
            <div className="flex space-x-3">
              <input
                type="text"
                placeholder="Digite sua pergunta para a IA..."
                className="flex-1 px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors">
                Enviar
              </button>
            </div>
          </div>
        </div>

        {/* Right Sidebar - Medical History & Metrics */}
        <div className="col-span-3 bg-slate-800 border-l border-slate-700 p-4 overflow-y-auto">
          {/* Medical History */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <span className="text-green-500 mr-2">📊</span>
              Histórico Médico
            </h3>
            
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                <div>
                  <p className="text-xs text-slate-400">20/12/2023</p>
                  <p className="text-white font-medium">Mastectomia</p>
                  <p className="text-slate-400 text-sm">Hospital Albert Einstein</p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                <div>
                  <p className="text-xs text-slate-400">15/01/2024</p>
                  <p className="text-white font-medium">Biópsia</p>
                  <p className="text-slate-400 text-sm">Confirmação CID C50.9</p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                <div>
                  <p className="text-xs text-slate-400">25/01/2024</p>
                  <p className="text-white font-medium">Consulta Oncologia</p>
                  <p className="text-slate-400 text-sm">Indicação quimioterapia</p>
                </div>
              </div>
            </div>
          </div>

          {/* Medications */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <span className="text-purple-500 mr-2">💊</span>
              Medicamentos em Uso
            </h3>
            
            <div className="space-y-2">
              <p className="text-slate-300">• Tamoxifeno 20mg</p>
              <p className="text-slate-300">• Omeprazol 40mg</p>
              <p className="text-slate-300">• Dipirona 500mg</p>
            </div>
          </div>

          {/* Provider Metrics */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <span className="text-yellow-500 mr-2">📈</span>
              Métricas do Prestador
            </h3>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Taxa Aprovação</span>
                <span className="text-green-400 font-semibold">87%</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Tempo Médio</span>
                <span className="text-white font-semibold">12 min</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Score Qualidade</span>
                <span className="text-yellow-400 font-semibold">B+</span>
              </div>
            </div>
          </div>

          {/* Documents */}
          <div className="mt-8">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <span className="text-gray-500 mr-2">📎</span>
              Documentos Anexos
            </h3>
            
            <button className="w-full text-left p-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors border border-slate-600">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Ver documentos</span>
                <span className="text-slate-500">⚙️</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;