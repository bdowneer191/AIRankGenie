import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import QueryForm from './components/QueryForm';
import JobDetailView from './components/JobDetailView';
import HistoryPage from './components/HistoryPage';
import AnalyticsPage from './components/AnalyticsPage';
import { TrackingJob } from './types';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedJob, setSelectedJob] = useState<TrackingJob | null>(null);

  // Simple view router
  const renderView = () => {
    if (selectedJob) {
      return (
        <JobDetailView 
          job={selectedJob} 
          onBack={() => { setSelectedJob(null); setCurrentView('dashboard'); }} 
        />
      );
    }

    switch (currentView) {
      case 'new-job':
        return (
          <QueryForm 
            onJobCreated={(job) => {
              setSelectedJob(job);
              setCurrentView('details');
            }} 
          />
        );
      case 'history':
        return (
          <HistoryPage
            onViewJob={(job) => {
              setSelectedJob(job);
              setCurrentView('details');
            }}
          />
        );
      case 'analytics':
        return <AnalyticsPage />;
      case 'dashboard':
      default:
        return (
          <Dashboard 
            onViewJob={(job) => {
               setSelectedJob(job);
               setCurrentView('details');
            }}
            onNewJob={() => setCurrentView('new-job')}
          />
        );
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar currentView={currentView} onNavigate={(view) => {
        setCurrentView(view);
        setSelectedJob(null);
      }} />
      
      <main className="flex-1 md:ml-64 p-4 md:p-8 overflow-y-auto h-screen">
        <div className="max-w-6xl mx-auto">
          {renderView()}
        </div>
      </main>
    </div>
  );
};

export default App;
